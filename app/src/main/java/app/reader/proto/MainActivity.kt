package app.reader.proto

import android.app.Activity
import android.app.Dialog
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.MediaStore
import android.util.Base64
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.WindowInsets
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import android.window.OnBackInvokedDispatcher
import org.json.JSONObject
import org.json.JSONArray
import app.reader.proto.sources.OnlineLibrary
import app.reader.proto.sources.SourceHttp
import app.reader.proto.sources.SourceAccessException
import app.reader.proto.sources.Sources
import java.util.concurrent.Executors
import java.io.ByteArrayInputStream
import java.io.InputStream

/**
 * Native shell. The reader UI runs in a WebView served from a private
 * in-app origin; this class imports and serves EPUB content and exposes a
 * small bridge. Online providers fetch chapters on workers and serve sanitized
 * content through the same private origin as EPUB chapters.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var lib: Library
    private lateinit var online: OnlineLibrary
    private lateinit var sourceHttp: SourceHttp
    private val sourceWorkers = Executors.newFixedThreadPool(4)
    private var sourceDialog: Dialog? = null
    private var topDp = 0f
    private var botDp = 0f

    companion object {
        private const val HOST = "reader.local"
        private const val PICK = 41
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lib = Library(this)
        sourceHttp = SourceHttp(WebSettings.getDefaultUserAgent(this))
        online = OnlineLibrary(this, sourceHttp)
        window.setDecorFitsSystemWindows(false)

        // debug builds only: allows inspecting the page from a computer over adb
        if (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)
        web = WebView(this)
        setContentView(web)
        web.setBackgroundColor(0xFF0D0805.toInt())
        web.overScrollMode = View.OVER_SCROLL_NEVER
        web.isVerticalScrollBarEnabled = false
        web.isHapticFeedbackEnabled = true
        web.isLongClickable = false
        web.setOnLongClickListener { true } // no system text-selection menu
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            textZoom = 100
        }
        web.addJavascriptInterface(Bridge(), "Android")
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                serve(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.host != HOST // never leave the app origin
        }
        web.setOnApplyWindowInsetsListener { _, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            val d = resources.displayMetrics.density
            topDp = bars.top / d
            botDp = bars.bottom / d
            web.evaluateJavascript("window.__insets&&window.__insets($topDp,$botDp)", null)
            insets
        }
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { goBack() }
        }
        web.loadUrl("https://$HOST/web/index.html")
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    @Deprecated("Used on Android 12 and below")
    override fun onBackPressed() = goBack()

    private fun goBack() {
        web.evaluateJavascript("(window.__back&&window.__back())===true") { r -> if (r != "true") finish() }
    }

    private fun handleIntent(i: Intent?) {
        if (i?.action == Intent.ACTION_VIEW) i.data?.let { importUri(it) }
    }

    // ---------- content serving ----------

    private fun serve(u: Uri): WebResourceResponse? {
        if (u.host != HOST || u.scheme != "https") return notFound()
        val path = u.path ?: return notFound()
        return try {
            when {
                path.startsWith("/web/") -> {
                    val p = path.removePrefix("/")
                    if (p.contains("..")) notFound() else ok(assets.open(p), mime(p))
                }
                path.startsWith("/book/") -> {
                    val rest = path.removePrefix("/book/")
                    val cut = rest.indexOf('/')
                    if (cut < 0) return notFound()
                    val id = rest.substring(0, cut)
                    val ins = if (online.contains(id)) online.entry(id, rest.substring(cut + 1))
                        else lib.entry(id, rest.substring(cut + 1)) ?: return notFound()
                    ok(ins, mime(rest))
                }
                path == "/online/image" -> {
                    val source = Sources.get(u.getQueryParameter("source") ?: return notFound())
                    val data = online.image(source.id, u.getQueryParameter("url") ?: return notFound())
                    ok(ByteArrayInputStream(data.first), data.second)
                }
                path.startsWith("/cover/") -> {
                    val id = path.removePrefix("/cover/")
                    if (online.contains(id)) {
                        val meta = online.book(id)
                        val image = online.image(meta.getString("sourceId"), meta.getString("coverUrl"))
                        ok(ByteArrayInputStream(image.first), image.second)
                    } else {
                        val c = lib.cover(id) ?: return notFound()
                        ok(c.first, c.second)
                    }
                }
                else -> notFound()
            }
        } catch (e: Exception) {
            val body = JSONObject().put("error", e.message ?: "Could not load this content.")
            if (e is SourceAccessException) body.put("source", e.sourceId).put("code", "connect")
            WebResourceResponse("application/json", "utf-8", 502, "Source unavailable", emptyMap(),
                ByteArrayInputStream(body.toString().toByteArray()))
        }
    }

    private fun ok(ins: InputStream, mime: String): WebResourceResponse {
        val textual = mime.startsWith("text/") || mime.contains("xml") || mime.contains("json") || mime.contains("javascript")
        return WebResourceResponse(
            mime, if (textual) "utf-8" else null, 200, "OK",
            mapOf("Cache-Control" to "no-store", "Access-Control-Allow-Origin" to "*"), ins
        )
    }

    private fun notFound() = WebResourceResponse(
        "text/plain", "utf-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0))
    )

    private fun mime(p: String): String = when (p.substringAfterLast('.', "").lowercase()) {
        "html", "htm" -> "text/html"
        "xhtml", "xml", "opf", "ncx" -> "application/xhtml+xml"
        "css" -> "text/css"
        "js" -> "text/javascript"
        "json" -> "application/json"
        "jpg", "jpeg" -> "image/jpeg"
        "png" -> "image/png"
        "gif" -> "image/gif"
        "webp" -> "image/webp"
        "svg" -> "image/svg+xml"
        "woff2" -> "font/woff2"
        "woff" -> "font/woff"
        "ttf" -> "font/ttf"
        "otf" -> "font/otf"
        else -> "application/octet-stream"
    }

    // ---------- import ----------

    private fun pick() {
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/epub+zip", "application/octet-stream", "application/zip"))
        }
        @Suppress("DEPRECATION")
        startActivityForResult(i, PICK)
    }

    @Deprecated("Plain Activity result API")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != PICK) return
        val uri = data?.data
        if (resultCode != RESULT_OK || uri == null) {
            js("window.__imported&&window.__imported(${JSONObject().put("cancelled", true)})")
            return
        }
        importUri(uri)
    }

    private fun importUri(uri: Uri) {
        Thread {
            val res = JSONObject()
            try {
                res.put("id", lib.importFrom(uri))
            } catch (e: Exception) {
                res.put("error", e.message ?: "Import failed.")
            }
            js("window.__imported&&window.__imported($res)")
        }.start()
    }

    private fun js(code: String) = runOnUiThread { if (!isFinishing && !isDestroyed) web.evaluateJavascript(code, null) }

    /** This browser has no reader bridge; cookies are shared with native requests. */
    private fun connectSource(id: String) {
        val source = runCatching { Sources.get(id) }.getOrNull() ?: return
        sourceDialog?.dismiss()
        val dialog = Dialog(this, android.R.style.Theme_Material_NoActionBar)
        sourceDialog = dialog
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, 36, 0, 24) }
        val label = TextView(this).apply { text = "${source.name}\nComplete any verification, then tap Done."; setPadding(24, 16, 24, 12) }
        val done = Button(this).apply { text = "Done"; setOnClickListener { dialog.dismiss() } }
        val browser = WebView(this).apply {
            source.httpUserAgent?.let { settings.userAgentString = it }
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    runCatching { source.url(request.url.toString()) }.isFailure
            }
        }
        layout.addView(label)
        layout.addView(done)
        layout.addView(browser, LinearLayout.LayoutParams(-1, 0, 1f))
        dialog.setContentView(layout)
        dialog.setOnDismissListener {
            browser.stopLoading(); browser.destroy()
            android.webkit.CookieManager.getInstance().flush()
            sourceDialog = null
            js("window.__sourceConnected&&window.__sourceConnected(${JSONObject.quote(id)})")
        }
        dialog.show()
        dialog.window?.setLayout(-1, -1)
        browser.loadUrl(source.base)
    }

    override fun onDestroy() {
        sourceDialog?.dismiss()
        sourceWorkers.shutdownNow()
        web.destroy()
        super.onDestroy()
    }

    // ---------- bridge ----------

    inner class Bridge {
        @JavascriptInterface
        fun listBooks(): String {
            val list = JSONArray(lib.listJson())
            val remote = online.list()
            for (i in 0 until remote.length()) list.put(remote.getJSONObject(i))
            return list.toString()
        }

        @JavascriptInterface
        fun getBook(id: String): String = if (online.contains(id)) online.book(id).apply { remove("chapters") }.toString() else lib.bookJson(id)

        @JavascriptInterface
        fun importBook() = runOnUiThread { pick() }

        @JavascriptInterface
        fun deleteBook(id: String) { if (online.contains(id)) online.delete(id) else lib.delete(id) }

        @JavascriptInterface
        fun sourceRequest(requestId: String, payload: String) {
            if (!requestId.matches(Regex("[0-9]{1,12}")) || payload.length > 10000) return
            sourceWorkers.execute {
                val result = try { JSONObject().put("data", online.request(JSONObject(payload)).apply { remove("chapters") }) }
                catch (e: Exception) {
                    JSONObject().put("error", e.message ?: "The source could not be reached.").also {
                        if (e is SourceAccessException) it.put("code", "connect").put("source", e.sourceId)
                    }
                }
                js("window.__sourceResult&&window.__sourceResult(${JSONObject.quote(requestId)},$result)")
            }
        }

        @JavascriptInterface
        fun connectSource(id: String) = runOnUiThread { this@MainActivity.connectSource(id) }

        @JavascriptInterface
        fun insets(): String = "$topDp,$botDp"

        /** Dark or light system bar icons, to match the reading theme. */
        @JavascriptInterface
        fun statusStyle(light: Boolean) = runOnUiThread {
            val m = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(if (light) m else 0, m)
        }

        /** pattern: "12" for one pulse, or "25,50,25" as on,off,on milliseconds. */
        @JavascriptInterface
        fun haptic(pattern: String) {
            val p = pattern.split(',').mapNotNull { it.trim().toLongOrNull() }.filter { it in 1..400 }
            if (p.isEmpty()) return
            if (p.size == 1 && p[0] <= 12) {
                runOnUiThread { web.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK) }
                return
            }
            val vib: Vibrator = if (Build.VERSION.SDK_INT >= 31) {
                (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            try {
                if (p.size == 1) vib.vibrate(VibrationEffect.createOneShot(p[0], VibrationEffect.DEFAULT_AMPLITUDE))
                else vib.vibrate(VibrationEffect.createWaveform(longArrayOf(0) + p.toLongArray(), -1))
            } catch (_: Exception) {
            }
        }

        /** Save a PNG data URL into Pictures/ReaderProto. */
        @JavascriptInterface
        fun savePng(name: String, dataUrl: String): Boolean {
            return try {
                val bytes = Base64.decode(dataUrl.substringAfter(','), Base64.DEFAULT)
                val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "_").take(60).ifEmpty { "quote" }
                val values = ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME, "$safe-${System.currentTimeMillis()}.png")
                    put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                    put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/ReaderProto")
                }
                val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return false
                contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return false
                runOnUiThread { Toast.makeText(this@MainActivity, "Saved to Pictures/ReaderProto", Toast.LENGTH_SHORT).show() }
                true
            } catch (e: Exception) {
                false
            }
        }
    }
}
