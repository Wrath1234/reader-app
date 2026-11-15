package app.reader.proto.sources

import org.jsoup.Jsoup
import org.junit.Assert.*
import org.junit.Test

class ReadFromProviderTest {
    private val book = "https://readfrom.net/test-author/123-test-book.html"
    private val unavailable = SourceTransport { _, _, _ -> error("Unexpected request") }

    private fun document(pager: String = "") = Jsoup.parse("""
        <div id=dle-speedbar><ul><li itemprop=itemListElement><a>Author</a></li>
        <li itemprop=itemListElement><a href=/test-author/>Test Author</a></li></ul></div>
        <meta name=description content="A novel about a distant world.">
        <meta property=og:image content="https://picture.readfrom.net/test.jpg">
        <article class=fullstory><h2 class=title>Test Book, page 1</h2>
        <div id=textToRead>A readable opening.</div></article>
        <div class=splitnewsnavigation2>$pager</div>
    """, book)

    @Test fun pageLinksCanonicalizeToOneBookIdentity() {
        val provider = ReadFromProvider(unavailable)
        assertEquals(book, provider.canonicalBook(book))
        assertEquals(book, provider.canonicalBook("https://readfrom.net/test-author/page,12,123-test-book.html?ref=search#top"))
        assertThrows(IllegalArgumentException::class.java) { provider.canonicalBook("https://other.test/test-author/123-test-book.html") }
        assertThrows(IllegalStateException::class.java) { provider.canonicalBook("https://readfrom.net/test-author/") }
    }

    @Test fun metadataBuildsAnOrderedCompletePagerWithoutOtherBooksOrDuplicates() {
        val provider = ReadFromProvider(unavailable)
        val doc = document("""
            <a href="/test-author/page,22,123-test-book.html">Last</a>
            <a href="/test-author/page,2,123-test-book.html">2</a>
            <a href="/test-author/page,2,123-test-book.html">Duplicate</a>
            <a href="/test-author/page,999,456-another-book.html">Other book</a>
            <a href="https://other.test/test-author/page,100,123-test-book.html">Wrong host</a>
        """)
        val novel = provider.parseBook(doc, book)
        assertEquals("Test Book", novel.title)
        assertEquals("Test Author", novel.author)
        assertEquals("A novel about a distant world.", novel.description)
        assertEquals("pages", novel.sectionLabel)
        assertEquals(22, novel.chapters.size)
        assertEquals(22, novel.chapters.map { it.id }.toSet().size)
        assertEquals(book, novel.chapters.first().url)
        assertEquals("Page 12", novel.chapters[11].title)
        assertTrue(novel.chapters.last().url.endsWith("page,22,123-test-book.html"))
    }

    @Test fun aBookWithoutNavigationStillHasItsFirstPage() {
        val novel = ReadFromProvider(unavailable).parseBook(document(), book)
        assertEquals(listOf(Chapter("Page 1", book)), novel.chapters)
    }

    @Test fun invalidPageCountsAndMissingTextFailClearly() {
        val provider = ReadFromProvider(unavailable)
        assertThrows(IllegalArgumentException::class.java) {
            provider.parseBook(document("<a href='/test-author/page,10001,123-test-book.html'>Invalid</a>"), book)
        }
        assertThrows(IllegalArgumentException::class.java) {
            provider.parseBook(Jsoup.parse("<h2 class=title>Login</h2>"), book)
        }
    }

    @Test fun searchAndBrowseUseSourceSpecificRoutesAndParseCards() {
        val calls = mutableListOf<String>()
        val provider = ReadFromProvider(SourceTransport { _, url, _ ->
            calls.add(url)
            Jsoup.parse("""
                <article><div class=box_in id="search result">
                <a class=highslide><img src="https://picture.readfrom.net/cover.jpg"></a>
                <h2 class=title><a href="/test-author/123-test-book.html"><b>Test Book</b></a></h2>
                </div></article><div class=navigation><span class=page_next><a href="/allbooks/page/3/">Next</a></span></div>
            """, url)
        })
        val page = provider.catalog("Test & Book", 1)
        assertEquals("Test Book", page.items.single().title)
        assertEquals(book, page.items.single().url)
        assertEquals("https://picture.readfrom.net/cover.jpg", page.items.single().cover)
        assertEquals("https://readfrom.net/build_in_search/?q=Test+%26+Book", calls.first())
        assertTrue(page.hasMore)
        provider.catalog("", 2)
        assertEquals("https://readfrom.net/allbooks/page/2/", calls.last())
    }

    @Test fun noResultsIsDifferentFromAnUnrecognizedCatalog() {
        val provider = ReadFromProvider(unavailable)
        assertTrue(provider.parseReadFromCatalog(Jsoup.parse("<p>Nothing found</p>")).items.isEmpty())
        assertThrows(IllegalStateException::class.java) { provider.parseReadFromCatalog(Jsoup.parse("<p>New site layout</p>")) }
    }

    @Test fun readingPagesBecomeParagraphsAndRetainEmphasisWithoutSiteControls() {
        val provider = ReadFromProvider(SourceTransport { _, url, _ -> Jsoup.parse("""
            <!-- <div id=textToRead>Obsolete text</div> -->
            <div id=textToRead>First <em>quiet</em> paragraph.<br><br>&nbsp;Second paragraph.<br><br>
            Third paragraph.<div class=splitnewsnavigation2>Site navigation</div>
            <script>alert(1)</script><iframe src=https://other.test></iframe></div>
        """, url) })
        val html = provider.chapter(book)
        val parsed = Jsoup.parse(html)
        assertEquals(3, parsed.select("p").count { it.text().isNotBlank() })
        assertEquals("quiet", parsed.selectFirst("em")!!.text())
        assertFalse(parsed.text().contains("Site navigation"))
        assertFalse(parsed.text().contains("Obsolete text"))
        assertTrue(parsed.select("script, iframe, button").isEmpty())
    }
}
