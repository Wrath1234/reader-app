package app.reader.proto.sources

import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class SourceProviderTest {
    private val webnovelSources = Sources.all.filter { it.id != "readfrom" }
    private val transport = SourceTransport { _, _, _ -> error("Unexpected network request") }

    @Test fun sourceUrlsPreserveEscapedSearchAndRejectForeignOrigins() {
        val source = Sources.get("novelping")
        val url = source.url("/search?keyword=one%26two+three&page=2")
        assertEquals("https://novelping.com/search?keyword=one%26two+three&page=2", url)
        assertEquals(url, source.url(url))
        for (bad in listOf("https://novelping.com.evil.test/book", "//127.0.0.1/book", "javascript:alert(1)", "http://novelping.com/book", "https://user@novelping.com/book", "https://novelping.com:123/book")) {
            assertThrows(IllegalArgumentException::class.java) { source.url(bad) }
        }
    }

    @Test fun webNovelCatalogLayoutsReturnCanonicalResultsAndNextPage() {
        for (source in webnovelSources) {
            val provider = HtmlSourceProvider(source, transport)
            val row = if (source.id == "freewebnovel")
                "<div class=li-row><div class=li><div class=con><div class=txt><h3 class=tit><a href=/novel/story title='Test story'>Test story</a></h3></div></div></div></div>"
                else "<div class=list><div class=row><div><h3 class=novel-title><a href=/book/story>Test story</a></h3></div></div></div>"
            val data = provider.parseCatalog(Jsoup.parse(row + "<ul class=pagination><li><a rel=next href='?page=2'>Next</a></li></ul>", source.base))
            assertEquals(source.id, 1, data.items.size)
            assertEquals("Test story", data.items.single().title)
            assertTrue(data.items.single().url.startsWith(source.base))
            assertTrue(data.hasMore)
            assertTrue(provider.parseCatalog(Jsoup.parse("<p>No results found</p>")).items.isEmpty())
        }
    }

    @Test fun chapterListsPreserveOrderAndExcludeDuplicatesAndForeignLinks() {
        val provider = HtmlSourceProvider(Sources.get("novelping"), transport)
        val data = provider.parseChapters(Jsoup.parse("""
            <ul class=list-chapter>
            <li data-chapter-item><a href=/book/a/chapter-1><span class=chapter-title>Chapter 1</span><span class=chapter-comment-count>17</span></a></li>
            <li data-chapter-item><a href=/book/a/chapter-2>Chapter 2</a></li>
            <li data-chapter-item><a href=/book/a/chapter-1>Duplicate</a></li>
            <li data-chapter-item><a href=https://other.test/chapter-3>Wrong host</a></li></ul>
        """))
        assertEquals(listOf("Chapter 1", "Chapter 2"), data.map { it.title })
        assertEquals(data[0].id, Chapter("Renamed chapter", data[0].url).id)
        assertNotEquals(data[0].id, data[1].id)
    }

    @Test fun fullPagesCanContinueWhenPaginationIsRenderedByTheWebsiteScript() {
        for (source in webnovelSources) {
            val pageSize = if (source.id == "readnovelfull") 10 else 20
            val provider = HtmlSourceProvider(source, transport)
            val rows = (1..pageSize).joinToString("") { i ->
                if (source.id == "freewebnovel") "<div class=li-row><div class=li><div class=con><h3 class=tit><a href=/novel/$i>Book $i</a></h3></div></div></div>"
                else "<div class=row><h3 class=novel-title><a href=/book/$i>Book $i</a></h3></div>"
            }
            val data = provider.parseCatalog(Jsoup.parse("<div class=list>$rows</div>"))
            assertEquals(pageSize, data.items.size)
            assertTrue(source.id, data.hasMore)
        }
    }

    @Test fun sanitizationRetainsStoryFormattingAndRejectsExecutableMarkup() {
        val provider = HtmlSourceProvider(Sources.get("novelfull"), transport)
        val doc = Jsoup.parse("""
            <div id=chapter-content><h2>A heading</h2><p onclick='alert(1)'>A <em>quiet</em> story.<br>Second line.</p>
            <script>alert(2)</script><iframe src='https://evil.test'></iframe><div class=ads>Advertising</div>
            <p style='display: none'>Hidden ad</p><img src='/image.jpg' onerror='alert(3)'></div>
        """, "https://novelfull.com/book/chapter-1")
        val safe = provider.cleanChapter(doc.selectFirst("#chapter-content")!!)
        val parsed = Jsoup.parse(safe)
        assertEquals("A heading", parsed.selectFirst("h2")!!.text())
        assertEquals("quiet", parsed.selectFirst("em")!!.text())
        assertFalse(safe.contains("alert"))
        assertFalse(safe.contains("Advertising"))
        assertFalse(safe.contains("Hidden ad"))
        assertTrue(parsed.selectFirst("img")!!.attr("src").startsWith("/online/image?source=novelfull"))
    }

    @Test fun novelFullAndReadNovelFullAndNovelPingUseCorrectChapterEndpoints() {
        for (id in listOf("novelfull", "readnovelfull", "novelping")) {
            val source = Sources.get(id)
            val calls = mutableListOf<String>()
            val fake = SourceTransport { _, url, _ ->
                calls.add(url)
                Jsoup.parse(if (url.contains("ajax")) "<select><option value='/book/test/chapter-1'>First chapter</option></select>" else
                    "<h3 class=title>Test novel</h3><div id=rating data-novel-id=123></div><ul class=info><li>Author: <a>Writer</a></li></ul><div class=desc-text>Synopsis</div>", url)
            }
            val novel = HtmlSourceProvider(source, fake).novel(source.base + "/book/test")
            assertEquals("Test novel", novel.title)
            assertEquals("Writer", novel.author)
            assertEquals("Synopsis", novel.description)
            assertEquals(1, novel.chapters.size)
            assertEquals(source.base + (if (id == "novelfull") "/ajax-chapter-option" else "/ajax/chapter-archive") + "?novelId=123", calls.last())
        }
    }

    @Test fun freeWebNovelPostsIdentifiersAndParsesJsonChapterOptions() {
        var posted = emptyMap<String, String>()
        val source = Sources.get("freewebnovel")
        val fake = SourceTransport { _, url, form ->
            if (form.isEmpty()) Jsoup.parse("<h1 class=tit>Test novel</h1><a class='set-case add' data-articleid=42></a>", url)
            else {
                posted = form
                Jsoup.parse("", url).apply { body().text(JSONObject().put("html", "<select><option value='/chapter-1.html'>Chapter 1</option></select>").toString()) }
            }
        }
        val novel = FreeWebNovelProvider(fake).novel(source.base + "/novel/test-novel.html")
        assertEquals(mapOf("aid" to "42", "acode" to "test-novel", "cid" to "1"), posted)
        assertEquals("https://freewebnovel.com/novel/test-novel/chapter-1.html", novel.chapters.single().url)
    }

    @Test fun changedLayoutsAndMissingChapterContentFailClearly() {
        val provider = HtmlSourceProvider(Sources.get("novelping"), transport)
        assertThrows(IllegalStateException::class.java) { provider.parseCatalog(Jsoup.parse("<p>Site moved</p>")) }
        assertThrows(IllegalArgumentException::class.java) { provider.parseChapters(Jsoup.parse("<p>Login required</p>")) }
        assertThrows(IllegalArgumentException::class.java) { provider.cleanChapter(Jsoup.parse("<div><script>ad()</script></div>").body()) }
    }
}
