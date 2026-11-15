package app.reader.proto.sources

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.io.InputStream
import java.util.concurrent.ConcurrentHashMap

class OnlineLibrary(context: Context, private val http: SourceHttp) {
    private val root = File(context.filesDir, "online").apply { mkdirs() }
    private val images = File(context.cacheDir, "source-images").apply { mkdirs() }
    private val locks = ConcurrentHashMap<String, Any>()
    private val previews = object : LinkedHashMap<String, Pair<Long, Novel>>(20, .75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Pair<Long, Novel>>?) = size > 20
    }
    private fun provider(source: Source): SourceProvider = when (source.id) {
        "freewebnovel" -> FreeWebNovelProvider(http)
        "readfrom" -> ReadFromProvider(http)
        else -> HtmlSourceProvider(source, http)
    }
    private fun dir(id: String): File {
        require(id.matches(Regex("[a-f0-9]{40}"))) { "Invalid online book." }
        return File(root, id)
    }
    fun contains(id: String) = id.matches(Regex("[a-f0-9]{40}")) && File(dir(id), "meta.json").exists()
    fun book(id: String): JSONObject = JSONObject(File(dir(id), "meta.json").readText())
    fun list(): JSONArray {
        val result = JSONArray()
        root.listFiles()?.forEach { folder ->
            runCatching { book(folder.name) }.getOrNull()?.let { meta ->
                result.put(JSONObject().put("id", meta.getString("id")).put("title", meta.getString("title"))
                    .put("author", meta.optString("author")).put("hasCover", meta.optString("coverUrl").isNotBlank()).put("online", true)
                    .put("sourceName", meta.optString("sourceName")).put("sections", meta.getJSONArray("spine").length())
                    .put("added", meta.optLong("added")))
            }
        }
        return result
    }
    fun delete(id: String) = synchronized(locks.getOrPut(id) { Any() }) { dir(id).deleteRecursively() }

    fun image(sourceId: String, url: String): Pair<ByteArray, String> {
        val key = stableId(sourceId + url)
        return synchronized(locks.getOrPut("image:$key") { Any() }) {
            val file = File(images, key)
            val type = File(images, "$key.type")
            if (!file.exists() || !type.exists()) {
                val data = http.image(Sources.get(sourceId), url)
                file.writeBytes(data.first); type.writeText(data.second)
                // Keep this disposable image cache bounded.
                val cached = images.listFiles()?.filter { !it.name.endsWith(".type") }?.sortedBy { it.lastModified() }.orEmpty()
                var bytes = cached.sumOf { it.length() }
                for (old in cached) {
                    if (bytes <= 32L * 1024 * 1024) break
                    if (old.name == key) continue
                    bytes -= old.length(); old.delete(); File(images, "${old.name}.type").delete()
                }
            }
            file.readBytes() to type.readText()
        }
    }

    private fun write(file: File, text: String) {
        file.parentFile?.mkdirs()
        val tmp = File.createTempFile("pending-", ".tmp", file.parentFile)
        try {
            tmp.writeText(text)
            check(tmp.renameTo(file)) { "Could not save the novel." }
        } finally { tmp.delete() }
    }

    private fun details(source: Source, url: String, refresh: Boolean = false): Novel {
        val key = source.id + ":" + source.url(url).trimEnd('/')
        if (!refresh) synchronized(previews) { previews[key]?.let { if (System.currentTimeMillis() - it.first < 600000) return it.second } }
        return provider(source).novel(url).also { synchronized(previews) { previews[key] = System.currentTimeMillis() to it } }
    }

    private fun json(novel: Novel): JSONObject {
        val spine = JSONArray(); val toc = JSONArray(); val chapters = JSONArray()
        novel.chapters.forEach { chapter ->
            val path = "chapters/${chapter.id}.html"
            spine.put(JSONObject().put("href", path).put("size", 1))
            toc.put(JSONObject().put("title", chapter.title).put("href", path).put("frag", "").put("depth", 0))
            chapters.put(JSONObject().put("id", chapter.id).put("url", chapter.url).put("title", chapter.title))
        }
        return JSONObject().put("id", novel.id).put("online", true).put("sourceId", novel.source.id)
            .put("sourceName", novel.source.name).put("sourceUrl", novel.url).put("title", novel.title)
            .put("sectionLabel", novel.sectionLabel)
            .put("author", novel.author).put("description", novel.description).put("status", novel.status)
            .put("tags", JSONArray(novel.tags)).put("lang", "en").put("coverUrl", novel.cover).put("cover", JSONObject.NULL)
            .put("css", JSONArray()).put("spine", spine).put("toc", toc).put("chapters", chapters)
            .put("total", novel.chapters.size).put("added", System.currentTimeMillis())
    }

    fun request(data: JSONObject): JSONObject {
        if (data.getString("op") == "sources") return JSONObject().put("sources", JSONArray(Sources.all.map {
            JSONObject().put("id", it.id).put("name", it.name).put("url", it.base)
        }))
        if (data.getString("op") == "refresh") {
            val id = data.getString("id")
            return synchronized(locks.getOrPut(id) { Any() }) {
                val old = book(id)
                val meta = json(details(Sources.get(old.getString("sourceId")), old.getString("sourceUrl"), true))
                check(meta.getString("id") == id) { "The source changed this novel's address. Your saved copy has been kept." }
                meta.put("added", old.optLong("added"))
                write(File(dir(id), "meta.json"), meta.toString())
                meta
            }
        }
        val source = Sources.get(data.getString("source"))
        return when (data.getString("op")) {
            "catalog" -> {
                val page = provider(source).catalog(data.optString("query").take(200), data.optInt("page", 1))
                JSONObject().put("items", JSONArray(page.items.map { card ->
                    JSONObject().put("title", card.title).put("url", card.url).put("cover", card.cover)
                })).put("hasMore", page.hasMore)
            }
            "details", "add" -> {
                val meta = json(details(source, data.getString("url")))
                if (data.getString("op") == "add") {
                    val id = meta.getString("id")
                    synchronized(locks.getOrPut(id) { Any() }) {
                        if (!contains(id)) write(File(dir(id), "meta.json"), meta.toString())
                    }
                    book(id)
                } else meta
            }
            else -> error("Unknown source action.")
        }
    }

    /** Online chapter paths are IDs, never arbitrary file or network paths. */
    fun entry(id: String, path: String): InputStream = synchronized(locks.getOrPut(id) { Any() }) {
        val match = Regex("chapters/([a-f0-9]{40})\\.html").matchEntire(path) ?: error("Unknown chapter.")
        val chapterId = match.groupValues[1]
        val meta = book(id)
        val chapters = meta.getJSONArray("chapters")
        val chapter = (0 until chapters.length()).map { chapters.getJSONObject(it) }.find { it.getString("id") == chapterId }
            ?: error("This chapter is no longer in the novel's chapter list.")
        val file = File(dir(id), path)
        if (!file.exists()) {
            val source = Sources.get(meta.getString("sourceId"))
            val html = provider(source).chapter(chapter.getString("url"))
            write(file, html)
        }
        ByteArrayInputStream(file.readBytes())
    }
}
