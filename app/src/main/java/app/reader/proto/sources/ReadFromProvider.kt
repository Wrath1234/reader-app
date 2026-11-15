/*
 * Retrieval flow adapted from LagradOst/QuickNovel's ReadfromnetProvider.kt,
 * commit 06295a438875054e459d3f6e4113143966a991ea.
 * Copyright QuickNovel contributors. GPL-3.0; see third_party/quicknovel.
 * Adapted 2026-11-15: canonical book/page addresses, bounded ordered page lists,
 * metadata and paragraph normalization for Reader's existing rendering path.
 */
package app.reader.proto.sources

import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import java.net.URI
import java.net.URLEncoder

class ReadFromProvider(http: SourceTransport) : HtmlSourceProvider(Sources.get("readfrom"), http) {
    private val bookFile = Regex("^(?:page,(\\d+),)?(\\d+-[^/]+\\.html)$")

    /** The same book has one identity whether opened from its first or a later page. */
    internal fun canonicalBook(url: String): String {
        val path = URI(source.url(url)).path
        val match = bookFile.matchEntire(path.substringAfterLast('/'))
            ?: error("Use a ReadFrom.Net book link, rather than an author or category link.")
        return source.url(path.substringBeforeLast('/') + "/" + match.groupValues[2])
    }

    private fun pageUrl(book: String, page: Int): String = if (page == 1) book else
        book.substringBeforeLast('/') + "/page,$page," + book.substringAfterLast('/')

    override fun catalog(query: String, page: Int): CatalogPage {
        require(page in 1..1000)
        val path = if (query.isBlank()) "/allbooks/page/$page/" else
            "/build_in_search/?q=${URLEncoder.encode(query.trim(), "UTF-8")}"
        return parseReadFromCatalog(get(path))
    }

    internal fun parseReadFromCatalog(doc: Document): CatalogPage {
        val cards = doc.select("article .box_in").mapNotNull { row ->
            val title = row.selectFirst("h2.title a") ?: return@mapNotNull null
            val url = runCatching { canonicalBook(title.attr("href")) }.getOrNull() ?: return@mapNotNull null
            val name = title.text().trim().takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val img = row.selectFirst("a.highslide img, img")
            val cover = img?.attr("data-src")?.ifBlank { img.attr("src") }.orEmpty()
            NovelCard(name, url, if (cover.isBlank()) "" else URI(source.base).resolve(cover).toString())
        }.distinctBy { it.url }
        if (cards.isEmpty() && !Regex("nothing found|no (?:books?|results?)|not found|0 results|no matches", RegexOption.IGNORE_CASE)
                .containsMatchIn(doc.text())) {
            error("ReadFrom.Net's book list could not be read. Try connecting to the source.")
        }
        return CatalogPage(cards, doc.select(".navigation .page_next a[href], .navigation a[rel=next]").isNotEmpty())
    }

    override fun novel(url: String): Novel {
        val canonical = canonicalBook(url)
        val doc = get(canonical)
        return parseBook(doc, canonical)
    }

    internal fun parseBook(doc: Document, url: String): Novel {
        val canonical = canonicalBook(url)
        require(doc.select("#textToRead").any { it.text().isNotBlank() }) { "ReadFrom.Net returned no reading text for this book." }
        val title = doc.selectFirst("article.fullstory h2.title, h2.title")?.text()
            ?.replace(Regex(",\\s*page\\s+\\d+\\s*$", RegexOption.IGNORE_CASE), "")?.trim()
            ?.takeIf { it.isNotBlank() } ?: error("The book title could not be read.")
        val pages = sortedSetOf(1)
        doc.select(".splitnewsnavigation a[href], .splitnewsnavigation2 a[href]").forEach { link ->
            val candidate = runCatching { source.url(link.attr("href")) }.getOrNull() ?: return@forEach
            if (runCatching { canonicalBook(candidate) }.getOrNull() != canonical) return@forEach
            val match = bookFile.matchEntire(URI(candidate).path.substringAfterLast('/')) ?: return@forEach
            val number = match.groupValues[1].ifBlank { "1" }.toIntOrNull() ?: error("The source returned an invalid page number.")
            require(number in 1..10000) { "The source returned an invalid page count." }
            pages.add(number)
        }
        // The site may shorten its pager to 1, 2, …, last. Addresses are sequential.
        val chapters = (1..pages.last()).map { Chapter("Page $it", pageUrl(canonical, it)) }
        val author = doc.select("#dle-speedbar li[itemprop=itemListElement] a").lastOrNull()?.text().orEmpty()
        val description = doc.selectFirst("meta[name=description]")?.attr("content").orEmpty()
        val cover = doc.selectFirst("meta[property=og:image]")?.attr("content").orEmpty()
        return Novel(source, canonical, title, author, description, cover, "", emptyList(), chapters, "pages")
    }

    override fun chapter(url: String): String {
        // Validate the book/page shape before requesting it, in addition to origin checks.
        canonicalBook(url)
        val doc = get(url)
        val content = doc.select("#textToRead").lastOrNull { it.text().isNotBlank() }?.clone()
            ?: error("The reading page could not be read. Try connecting to ReadFrom.Net.")
        content.select(".splitnewsnavigation, .splitnewsnavigation2, .navigation, .page_next-prev, .pages, script, style").remove()
        // This source separates paragraphs with runs of BRs, rather than P elements.
        // Preserve single line breaks and inline emphasis inside each paragraph.
        val paragraphs = content.html().replace(Regex("(?:<br\\s*/?>[\\s\\u00a0]*(?:&nbsp;[\\s\\u00a0]*)?){2,}", RegexOption.IGNORE_CASE), "</p><p>")
        val normalized = Jsoup.parse("<div><p>$paragraphs</p></div>", doc.location()).body()
        return cleanChapter(normalized)
    }
}
