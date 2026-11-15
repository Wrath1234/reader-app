package app.reader.proto

import android.app.Activity
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
import android.widget.Toast
import android.window.OnBackInvokedDispatcher
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.InputStream

/**
 * Native shell. The reader UI runs in a WebView served from a private
 * in-app origin; this class imports and serves EPUB content and exposes a
 * small bridge (library, haptics, image saving). The app has no internet
 * permission, so nothing leaves the device.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var lib: Library
    private var topDp = 0f
    private var botDp = 0f

    companion object {
        private const val HOST = "reader.local"
        private const val PICK = 41
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lib = Library(this)
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
        if (u.host != HOST) return null
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
                    val ins = lib.entry(rest.substring(0, cut), rest.substring(cut + 1)) ?: return notFound()
                    ok(ins, mime(rest))
                }
                path.startsWith("/cover/") -> {
                    val c = lib.cover(path.removePrefix("/cover/")) ?: return notFound()
                    ok(c.first, c.second)
                }
                else -> notFound()
            }
        } catch (e: Exception) {
            notFound()
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

    private fun js(code: String) = runOnUiThread { web.evaluateJavascript(code, null) }

    // ---------- bridge ----------

    inner class Bridge {
        @JavascriptInterface
        fun listBooks(): String = lib.listJson()

        @JavascriptInterface
        fun getBook(id: String): String = lib.bookJson(id)

        @JavascriptInterface
        fun importBook() = runOnUiThread { pick() }

        @JavascriptInterface
        fun deleteBook(id: String) = lib.delete(id)

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
