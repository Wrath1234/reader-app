package app.reader.proto.sources

import android.webkit.CookieManager
import org.jsoup.Connection
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import java.net.URI
import java.util.concurrent.ConcurrentHashMap

class SourceAccessException(val sourceId: String, message: String) : Exception(message)

/** Requests run on workers, never through the bridge's synchronous UI methods. */
class SourceHttp(private val userAgent: String) : SourceTransport {
    private val locks = ConcurrentHashMap<String, Any>()
    private val lastRequest = ConcurrentHashMap<String, Long>()

    override fun fetch(source: Source, url: String, form: Map<String, String>): Document {
        val response = request(source, source.url(url), form, false)
        val body = response.body()
        return if (body.trimStart().startsWith("{")) Jsoup.parse("", response.url().toString()).apply { body().text(body) }
            else response.parse()
    }

    fun image(source: Source, url: String): Pair<ByteArray, String> {
        val r = request(source, url, emptyMap(), true)
        val type = r.contentType()?.substringBefore(';').orEmpty()
        require(type in listOf("image/jpeg", "image/png", "image/webp", "image/gif", "image/avif")) { "Unsupported image." }
        return r.bodyAsBytes() to type
    }

    private fun validate(source: Source, url: String, image: Boolean): String {
        if (!image) return source.url(url)
        val u = URI(url)
        require(u.scheme == "https" && u.userInfo == null && u.port == -1 &&
            (u.host == source.host || u.host?.endsWith(".${source.host}") == true)) { "Unsupported image host." }
        return u.toASCIIString()
    }

    private fun request(source: Source, input: String, form: Map<String, String>, image: Boolean): Connection.Response =
        synchronized(locks.getOrPut(source.id) { Any() }) {
            var url = validate(source, input, image)
            var data = form
            repeat(5) {
                if (!image) {
                    val remaining = source.delayMs - (android.os.SystemClock.elapsedRealtime() - (lastRequest[source.id] ?: 0))
                    if (remaining > 0) Thread.sleep(remaining)
                    lastRequest[source.id] = android.os.SystemClock.elapsedRealtime()
                }
                val cookies = CookieManager.getInstance().getCookie(url).orEmpty().split(';').mapNotNull { item ->
                    val at = item.indexOf('=')
                    if (at > 0) item.substring(0, at).trim() to item.substring(at + 1).trim() else null
                }.toMap()
                val connection = Jsoup.connect(url).userAgent(source.httpUserAgent ?: userAgent).referrer(source.base + "/")
                    .timeout(25000).maxBodySize(if (image) 8 * 1024 * 1024 else 6 * 1024 * 1024)
                    .ignoreHttpErrors(true).ignoreContentType(true).followRedirects(false).cookies(cookies)
                    .header("Accept-Language", "en-US,en;q=0.9")
                if (data.isNotEmpty()) connection.method(Connection.Method.POST).data(data)
                val response = connection.execute()
                response.headers("Set-Cookie").forEach { CookieManager.getInstance().setCookie(url, it) }
                val code = response.statusCode()
                if (code in 300..399) {
                    val location = response.header("Location") ?: error("The source returned an invalid redirect.")
                    url = validate(source, URI(url).resolve(location).toString(), image)
                    if (code == 303 || code == 301 || code == 302) data = emptyMap()
                } else {
                    if (code == 403 || code == 429 || code == 503 || (!image &&
                        Regex("<title>\\s*(Just a moment|Attention Required)|id=\"challenge-form\"", RegexOption.IGNORE_CASE).containsMatchIn(response.body()))) {
                        throw SourceAccessException(source.id, "${source.name} needs a connection check. Tap Connect, complete any verification, then try again.")
                    }
                    require(code in 200..299) { "${source.name} returned HTTP $code. Please try again later." }
                    return@synchronized response
                }
            }
            error("The source redirected too many times.")
        }
}
