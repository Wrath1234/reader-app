package app.reader.proto

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.security.MessageDigest
import java.util.zip.ZipFile

/** Imported books live in filesDir/books/<id>/ as book.epub + meta.json (+ cover). */
class Library(private val ctx: Context) {

    private val root = File(ctx.filesDir, "books").apply { mkdirs() }
    private val zips = HashMap<String, ZipFile>()

    private fun dir(id: String): File {
        require(id.matches(Regex("[a-f0-9]{8,40}"))) { "bad id" }
        return File(root, id)
    }

    /** Copy the picked document into app storage, parse it and return its id. */
    fun importFrom(uri: Uri): String {
        val name = displayName(uri)
        val tmp = File.createTempFile("import", ".epub", ctx.cacheDir)
        try {
            val md = MessageDigest.getInstance("MD5")
            val input = ctx.contentResolver.openInputStream(uri) ?: throw Exception("Could not open that file.")
            input.use { ins ->
                tmp.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = ins.read(buf)
                        if (n < 0) break
                        md.update(buf, 0, n)
                        out.write(buf, 0, n)
                    }
                }
            }
            val id = md.digest().joinToString("") { "%02x".format(it) }.substring(0, 16)
            val d = dir(id)
            if (File(d, "meta.json").exists()) return id // already in the library

            val meta = try {
                Epub.parse(tmp, name.substringBeforeLast('.').ifEmpty { "Untitled" })
            } catch (e: Epub.NotAnEpub) {
                throw e
            } catch (e: Exception) {
                throw Exception("That file could not be read as an EPUB.")
            }
            d.mkdirs()
            val dest = File(d, "book.epub")
            tmp.copyTo(dest, overwrite = true)
            meta.put("id", id).put("added", System.currentTimeMillis()).put("file", name)
            File(d, "meta.json").writeText(meta.toString())
            return id
        } finally {
            tmp.delete()
        }
    }

    private fun displayName(uri: Uri): String {
        try {
            ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) return c.getString(0) ?: ""
            }
        } catch (_: Exception) {
        }
        return uri.lastPathSegment ?: ""
    }

    fun listJson(): String {
        val arr = JSONArray()
        root.listFiles()?.sortedByDescending { it.lastModified() }?.forEach { d ->
            val m = File(d, "meta.json")
            if (!m.exists()) return@forEach
            try {
                val j = JSONObject(m.readText())
                arr.put(
                    JSONObject().put("id", j.getString("id")).put("title", j.getString("title"))
                        .put("author", j.optString("author")).put("hasCover", !j.isNull("cover"))
                        .put("sections", j.getJSONArray("spine").length()).put("added", j.optLong("added"))
                )
            } catch (_: Exception) {
            }
        }
        return arr.toString()
    }

    fun bookJson(id: String): String = File(dir(id), "meta.json").readText()

    fun delete(id: String) {
        synchronized(zips) { zips.remove(id)?.close() }
        dir(id).deleteRecursively()
    }

    private fun zip(id: String): ZipFile = synchronized(zips) {
        zips.getOrPut(id) { ZipFile(File(dir(id), "book.epub")) }
    }

    /** Stream one entry of a book's EPUB. Returns null if it does not exist. */
    fun entry(id: String, path: String): InputStream? {
        val z = zip(id)
        val e = z.getEntry(path) ?: return null
        return z.getInputStream(e)
    }

    fun cover(id: String): Pair<InputStream, String>? {
        val j = JSONObject(bookJson(id))
        if (j.isNull("cover")) return null
        val ins = entry(id, j.getString("cover")) ?: return null
        return ins to j.optString("coverType", "image/jpeg")
    }
}
