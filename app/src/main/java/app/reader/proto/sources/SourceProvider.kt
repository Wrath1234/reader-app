/*
 * Selectors and retrieval flows adapted from LagradOst/QuickNovel:
 * AllNovelProvider.kt, NovelFullProvider.kt, FreewebnovelProvider.kt,
 * ReadNovelFullProvider.kt and NovelBinProvider.kt, commit 06295a438875054e459d3f6e4113143966a991ea.
 * Copyright QuickNovel contributors. GPL-3.0; see third_party/quicknovel.
 * Adapted 2026-11-15 for Reader's existing book and chapter pipeline.
 */
package app.reader.proto.sources

import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import org.jsoup.safety.Safelist
import org.json.JSONObject
import java.net.URI
import java.net.URLEncoder
import java.security.MessageDigest

data class Source(val id: String, val name: String, val base: String, val delayMs: Long = 1000,
    val httpUserAgent: String? = null) {
    val host: String get() = URI(base).host
    fun url(value: String): String {
        val u = URI(base + "/").resolve(value.trim()).normalize()
        require(u.scheme == "https" && u.userInfo == null && u.port == -1 &&
            (u.host == host || u.host == "www.$host")) { "This link does not belong to $name." }
        return u.toASCIIString().substringBefore('#')
    }
}

object Sources {
    val all = listOf(
        Source("novelfull", "NovelFull", "https://novelfull.com"),
        Source("freewebnovel", "FreeWebNovel", "https://freewebnovel.com", 1100),
        Source("readnovelfull", "ReadNovelFull", "https://readnovelfull.com"),
        Source("novelping", "NovelPing", "https://novelping.com"),
        Source("readfrom", "ReadFrom.Net", "https://readfrom.net", httpUserAgent =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36")
    )
    fun get(id: String): Source = all.find { it.id == id } ?: error("Unknown source.")
}

data class NovelCard(val title: String, val url: String, val cover: String = "")
data class Chapter(val title: String, val url: String) {
    val id: String get() = stableId(url)
}
data class Novel(val source: Source, val url: String, val title: String, val author: String,
    val description: String, val cover: String, val status: String, val tags: List<String>, val chapters: List<Chapter>,
    val sectionLabel: String = "chapters") {
    val id: String get() = stableId(source.id + ":" + url)
}
data class CatalogPage(val items: List<NovelCard>, val hasMore: Boolean)
fun stableId(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
    .take(20).joinToString("") { "%02x".format(it) }

fun interface SourceTransport {
    fun fetch(source: Source, url: String, form: Map<String, String>): Document
}

/** Small provider contract: adding a new site doesn't change the reader. */
interface SourceProvider {
    val source: Source
    fun catalog(query: String, page: Int): CatalogPage
    fun novel(url: String): Novel
    fun chapter(url: String): String
}

open class HtmlSourceProvider(override val source: Source, protected val http: SourceTransport) : SourceProvider {
    protected fun get(url: String, form: Map<String, String> = emptyMap()) = http.fetch(source, source.url(url), form)
    private fun image(el: Element?): String {
        if (el == null) return ""
        val img = el.selectFirst("img") ?: return ""
        val raw = img.attr("data-src").ifBlank { img.attr("src") }
        return runCatching { URI(source.base).resolve(raw).toString() }.getOrDefault("")
    }

    override fun catalog(query: String, page: Int): CatalogPage {
        require(page in 1..1000)
        val q = URLEncoder.encode(query.trim(), "UTF-8")
        val url = when {
            query.isNotBlank() && source.id == "readnovelfull" -> "/novel-list/search?keyword=$q&page=$page"
            query.isNotBlank() -> "/search?keyword=$q&page=$page"
            source.id == "novelping" -> "/sort/hot?page=$page"
            source.id == "freewebnovel" -> "/sort/most-popular/$page"
            source.id == "readnovelfull" -> "/novel-list/most-popular?page=$page"
            else -> "/most-popular?page=$page"
        }
        return parseCatalog(get(url))
    }

    internal fun parseCatalog(doc: Document): CatalogPage {
        val rows = if (source.id == "freewebnovel") doc.select("div.li-row > div.li > div.con")
            else doc.select("div.list > div.row, div.list-novel > div.row")
        val cards = rows.mapNotNull { row ->
            val a = row.selectFirst("h3.truyen-title a, h3.novel-title a, h3.tit a") ?: return@mapNotNull null
            val url = runCatching { source.url(a.attr("href")) }.getOrNull() ?: return@mapNotNull null
            val title = a.text().ifBlank { a.attr("title") }
            if (title.isBlank()) return@mapNotNull null
            NovelCard(title, url, image(row))
        }.distinctBy { it.url }
        // A changed layout should not masquerade as an empty successful catalog.
        if (cards.isEmpty() && rows.isEmpty() &&
            !Regex("no (?:novels?|results?|books?)|not found|0 results", RegexOption.IGNORE_CASE).containsMatchIn(doc.text())) {
            error("${source.name}'s catalog layout could not be read. Try connecting to the source.")
        }
        val next = doc.select(".pagination a, .pages a, .pagelink a, a[rel=next]").any {
            !it.parent()!!.hasClass("disabled") && (it.attr("rel") == "next" || it.hasClass("next") ||
                it.attr("aria-label").contains("next", true) || it.attr("title").contains("next", true) ||
                it.text().lowercase() in listOf("next", "next page", "next ›", "›", "»", "next »"))
        }
        // Some sources render their next-page controls with client-side code.
        // A full result page can be followed; the UI also stops on duplicate pages.
        val pageSize = if (source.id == "readnovelfull") 10 else 20
        return CatalogPage(cards, next || cards.size >= pageSize)
    }

    override fun novel(url: String): Novel {
        val canonical = source.url(url).trimEnd('/')
        val doc = get(canonical)
        val title = doc.selectFirst("h3.title, h1.tit")?.text()?.takeIf { it.isNotBlank() }
            ?: error("The novel title could not be read.")
        val id = doc.selectFirst("#rating[data-novel-id]")?.attr("data-novel-id")
            ?.takeIf { it.isNotBlank() } ?: error("The novel's chapter list could not be found.")
        val endpoint = if (source.id == "novelfull") "/ajax-chapter-option" else "/ajax/chapter-archive"
        val list = get("$endpoint?novelId=${URLEncoder.encode(id, "UTF-8")}")
        val chapters = parseChapters(list)
        return metadata(doc, canonical, title, chapters)
    }

    internal fun parseChapters(doc: Document): List<Chapter> {
        val options = doc.select("select > option")
        val links = if (options.isNotEmpty()) options else
            doc.select("li[data-chapter-item] > a, ul.list-chapter > li > a")
        val chapters = links.mapNotNull { el ->
            val href = el.attr("value").ifBlank { el.attr("href") }
            if (href.isBlank() || href == "#") return@mapNotNull null
            val url = runCatching { source.url(href) }.getOrNull() ?: return@mapNotNull null
            Chapter((el.selectFirst(".chapter-title, .nchr-text")?.text() ?: el.text()).ifBlank { "Chapter" }, url)
        }.distinctBy { it.url }
        require(chapters.isNotEmpty()) { "No readable chapters were returned by ${source.name}." }
        return chapters
    }

    protected fun metadata(doc: Document, url: String, title: String, chapters: List<Chapter>): Novel {
        val info = doc.select("div.info > div, ul.info > li, ul.info-meta > li")
        fun field(label: String) = info.firstOrNull { it.text().contains(label, true) }
        val author = field("Author")?.select("a")?.text().orEmpty().ifBlank {
            doc.selectFirst("a[href^=/author/], div.item:has(span.glyphicon-user) a, span[title=Author] + a")?.text().orEmpty()
        }
        val status = field("Status")?.select("a")?.text().orEmpty().ifBlank {
            doc.selectFirst("span.s1.s3 a, span.s1.s2 a")?.text().orEmpty()
        }
        val tags = field("Genre")?.select("a")?.map { it.text() }.orEmpty().ifEmpty {
            doc.select("div.item:has(span.glyphicon-th-list) a").map { it.text() }
        }
        val cover = image(doc.selectFirst("div.book, div.pic, div.books"))
        val description = doc.selectFirst("div.desc-text, div.m-desc div.inner")?.text().orEmpty()
        return Novel(source, url, title, author, description, cover, status, tags, chapters)
    }

    override fun chapter(url: String): String {
        val doc = get(url)
        val content = doc.selectFirst(if (source.id == "freewebnovel") "div.txt" else "#chapter-content, #chr-content")
            ?: error("The chapter text could not be read. Try connecting to ${source.name}.")
        return cleanChapter(content)
    }

    internal fun cleanChapter(content: Element): String {
        val copy = content.clone()
        copy.select("script, style, iframe, form, button, nav, .adsbygoogle, .slot-frame, .reader-ad-skip, .notice-text, .ads, .adsbygoogle-noablate").remove()
        copy.select("[style]").filter {
            Regex("display\\s*:\\s*none|visibility\\s*:\\s*hidden", RegexOption.IGNORE_CASE).containsMatchIn(it.attr("style"))
        }.forEach { it.remove() }
        copy.select("img").forEach { img ->
            val raw = img.attr("data-src").ifBlank { img.attr("src") }
            val absolute = runCatching { URI(content.baseUri()).resolve(raw).toString() }.getOrNull()
            if (absolute != null && URI(absolute).scheme == "https") {
                img.attr("src", "/online/image?source=${source.id}&url=${URLEncoder.encode(absolute, "UTF-8")}")
            } else img.remove()
        }
        val safe = Safelist.none().addTags("p", "div", "br", "h1", "h2", "h3", "h4", "blockquote", "em", "i", "b", "strong", "hr", "ul", "ol", "li", "figure", "figcaption", "img", "sup", "sub")
            .addAttributes("img", "src", "alt").addProtocols("img", "src", "https").preserveRelativeLinks(true)
        val html = Jsoup.clean(copy.html(), "https://reader.local", safe)
        require(Jsoup.parse(html).text().isNotBlank()) { "This chapter is empty. Try again when connected." }
        return "<!doctype html><html><head><meta charset=\"utf-8\"></head><body>$html</body></html>"
    }
}

class FreeWebNovelProvider(http: SourceTransport) : HtmlSourceProvider(Sources.get("freewebnovel"), http) {
    override fun novel(url: String): Novel {
        val doc = get(url)
        val canonical = source.url(doc.location()).trimEnd('/').removeSuffix(".html")
        val title = doc.selectFirst("h1.tit")?.text()?.takeIf { it.isNotBlank() } ?: error("The novel title could not be read.")
        val aid = doc.selectFirst("a.set-case.add[data-articleid]")?.attr("data-articleid")
            ?: doc.selectFirst("meta[name=image]")?.attr("content")?.substringAfterLast('/')?.substringBefore("s.jpg")
            ?: error("The novel's chapter list could not be found.")
        val acode = canonical.substringAfterLast('/')
        val response = get("/api/chapterlist.php", mapOf("aid" to aid, "acode" to acode, "cid" to "1"))
        val html = JSONObject(response.body().text()).optString("html")
        require(html.isNotBlank()) { "The source returned no chapter list." }
        val list = Jsoup.parse(html)
        list.select("option").forEach {
            val value = it.attr("value").substringAfterLast('/')
            if (value.isNotBlank()) it.attr("value", "${source.base}/novel/$acode/$value")
        }
        // Jsoup moves standalone options into body; wrap them for the shared chapter parser.
        val wrapped = Jsoup.parse("<select>${list.select("option").joinToString("") { it.outerHtml() }}</select>")
        return metadata(doc, canonical, title, parseChapters(wrapped))
    }
}
