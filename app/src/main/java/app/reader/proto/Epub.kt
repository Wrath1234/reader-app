package app.reader.proto

import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import org.w3c.dom.Document
import org.w3c.dom.Element
import java.io.ByteArrayInputStream
import java.io.File
import java.util.zip.ZipFile
import javax.xml.parsers.DocumentBuilderFactory

/**
 * Minimal EPUB 2/3 package parser. Reads the container, the OPF package
 * (metadata, manifest, spine), the cover and the table of contents (NCX or
 * EPUB 3 nav), and returns everything the reader needs as JSON.
 */
object Epub {

    class NotAnEpub(msg: String) : Exception(msg)

    fun parse(file: File, fallbackTitle: String): JSONObject {
        ZipFile(file).use { z ->
            val container = text(z, "META-INF/container.xml")
                ?: throw NotAnEpub("This file is not an EPUB (no container.xml).")
            val opfPath = Regex("full-path\\s*=\\s*[\"']([^\"']+)[\"']").find(container)?.groupValues?.get(1)
                ?: throw NotAnEpub("This EPUB has no package file.")
            val opfText = text(z, opfPath) ?: throw NotAnEpub("This EPUB's package file is missing.")
            val base = opfPath.substringBeforeLast('/', "")
            val opf = xml(opfText)

            val title = firstText(opf, "dc:title") ?: firstText(opf, "title") ?: fallbackTitle
            val author = firstText(opf, "dc:creator") ?: firstText(opf, "creator") ?: ""
            val lang = firstText(opf, "dc:language") ?: "en"

            // manifest
            class Item(val id: String, val path: String, val type: String, val props: String)
            val items = LinkedHashMap<String, Item>()
            val itemEls = opf.getElementsByTagName("item")
            for (i in 0 until itemEls.length) {
                val e = itemEls.item(i) as Element
                val href = e.getAttribute("href")
                if (href.isEmpty()) continue
                items[e.getAttribute("id")] = Item(
                    e.getAttribute("id"), resolve(base, href),
                    e.getAttribute("media-type"), e.getAttribute("properties")
                )
            }

            // spine
            val spine = JSONArray()
            val refs = opf.getElementsByTagName("itemref")
            for (i in 0 until refs.length) {
                val it = items[(refs.item(i) as Element).getAttribute("idref")] ?: continue
                if (!it.type.contains("html") && !it.path.endsWith("html", true) && !it.path.endsWith(".htm", true)) continue
                val entry = z.getEntry(it.path) ?: continue
                spine.put(JSONObject().put("href", it.path).put("size", entry.size.coerceAtLeast(1)))
            }
            if (spine.length() == 0) throw NotAnEpub("This EPUB has no readable chapters.")

            // cover
            var cover: Item? = null
            val metas = opf.getElementsByTagName("meta")
            for (i in 0 until metas.length) {
                val m = metas.item(i) as Element
                if (m.getAttribute("name") == "cover") cover = items[m.getAttribute("content")]
            }
            if (cover == null) cover = items.values.firstOrNull { it.props.contains("cover-image") }
            if (cover == null) cover = items.values.firstOrNull { it.type.startsWith("image/") && it.id.contains("cover", true) }
            if (cover == null) cover = items.values.firstOrNull { it.type.startsWith("image/") && it.path.contains("cover", true) }
            if (cover != null && (!cover.type.startsWith("image/") || z.getEntry(cover.path) == null)) cover = null

            // table of contents
            val toc = JSONArray()
            val spineEl = opf.getElementsByTagName("spine").item(0) as? Element
            val ncxItem = spineEl?.getAttribute("toc")?.let { items[it] }
                ?: items.values.firstOrNull { it.type == "application/x-dtbncx+xml" }
            val navItem = items.values.firstOrNull { it.props.split(' ').contains("nav") }
            if (ncxItem != null) text(z, ncxItem.path)?.let { readNcx(it, ncxItem.path.substringBeforeLast('/', ""), toc) }
            if (toc.length() == 0 && navItem != null) text(z, navItem.path)?.let { readNav(it, navItem.path.substringBeforeLast('/', ""), toc) }

            val css = JSONArray()
            items.values.filter { it.type == "text/css" && z.getEntry(it.path) != null }.forEach { css.put(it.path) }

            var total = 0L
            for (i in 0 until spine.length()) total += spine.getJSONObject(i).getLong("size")

            return JSONObject()
                .put("title", title.trim()).put("author", author.trim()).put("lang", lang)
                .put("spine", spine).put("toc", toc).put("css", css).put("total", total)
                .put("cover", cover?.path ?: JSONObject.NULL)
                .put("coverType", cover?.type ?: JSONObject.NULL)
        }
    }

    private fun readNcx(ncx: String, base: String, out: JSONArray) {
        val doc = try { xml(ncx) } catch (e: Exception) { return }
        fun walk(el: Element, depth: Int) {
            val kids = el.childNodes
            for (i in 0 until kids.length) {
                val n = kids.item(i) as? Element ?: continue
                if (n.tagName.substringAfter(':') != "navPoint") continue
                var label = ""
                var src = ""
                val sub = n.childNodes
                for (j in 0 until sub.length) {
                    val c = sub.item(j) as? Element ?: continue
                    when (c.tagName.substringAfter(':')) {
                        "navLabel" -> label = c.textContent.trim().replace(Regex("\\s+"), " ")
                        "content" -> src = c.getAttribute("src")
                    }
                }
                if (src.isNotEmpty()) addToc(out, label, base, src, depth)
                walk(n, depth + 1)
            }
        }
        val map = doc.getElementsByTagName("navMap").item(0) as? Element ?: return
        walk(map, 0)
    }

    private fun readNav(nav: String, base: String, out: JSONArray) {
        val tocBlock = Regex("<nav[^>]*toc[^>]*>([\\s\\S]*?)</nav>", RegexOption.IGNORE_CASE).find(nav)?.groupValues?.get(1) ?: nav
        Regex("<a[^>]*href\\s*=\\s*[\"']([^\"']+)[\"'][^>]*>([\\s\\S]*?)</a>", RegexOption.IGNORE_CASE).findAll(tocBlock).forEach {
            val label = it.groupValues[2].replace(Regex("<[^>]+>"), "").replace(Regex("\\s+"), " ").trim()
            addToc(out, label, base, it.groupValues[1], 0)
        }
    }

    private fun addToc(out: JSONArray, label: String, base: String, src: String, depth: Int) {
        val frag = src.substringAfter('#', "")
        out.put(
            JSONObject().put("title", label.ifEmpty { "Untitled" })
                .put("href", resolve(base, src.substringBefore('#'))).put("frag", frag).put("depth", depth)
        )
    }

    /** Resolve a manifest href against the OPF directory into a zip entry path. */
    fun resolve(base: String, href: String): String {
        val clean = Uri.decode(href.substringBefore('#'))
        val parts = ArrayList<String>()
        if (base.isNotEmpty() && !clean.startsWith("/")) parts.addAll(base.split('/'))
        for (p in clean.split('/')) {
            when (p) {
                "", "." -> {}
                ".." -> if (parts.isNotEmpty()) parts.removeAt(parts.size - 1)
                else -> parts.add(p)
            }
        }
        return parts.joinToString("/")
    }

    private fun text(z: ZipFile, path: String): String? {
        val e = z.getEntry(path) ?: return null
        val bytes = z.getInputStream(e).use { it.readBytes() }
        return String(bytes, Charsets.UTF_8).removePrefix("\uFEFF")
    }

    private fun xml(s: String): Document {
        val f = DocumentBuilderFactory.newInstance()
        f.isNamespaceAware = false
        f.isValidating = false
        // Strip the DOCTYPE so no external DTD is ever fetched.
        val body = s.replace(Regex("<!DOCTYPE[^>]*>", RegexOption.IGNORE_CASE), "")
        return f.newDocumentBuilder().parse(ByteArrayInputStream(body.toByteArray(Charsets.UTF_8)))
    }

    private fun firstText(doc: Document, tag: String): String? {
        val n = doc.getElementsByTagName(tag)
        for (i in 0 until n.length) {
            val t = n.item(i).textContent?.trim()
            if (!t.isNullOrEmpty()) return t
        }
        return null
    }
}
