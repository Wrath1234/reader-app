# Reader Proto (Android)

First on-device prototype of the reader. A Kotlin shell imports and serves EPUBs;
the reading UI is a WebView app in `app/src/main/assets/web/`.

- `MainActivity.kt` – WebView host, file picker import, haptics, image saving, back handling
- `Epub.kt` – EPUB 2/3 package parser (metadata, spine, cover, NCX / nav contents)
- `Library.kt` – imported books in app storage (`files/books/<id>/`)
- `assets/web/app.js` – library, EPUB cleanup, effects, read tracker, bookmarks, quotes, sound
- `assets/web/app.css` – generated from the HTML prototype plus app overrides

Fonts are bundled. Online discovery supports NovelFull, FreeWebNovel,
ReadNovelFull, NovelPing and ReadFrom.Net through the **Find novels** button. Select a source
or search all five, open the novel details, then read or add it to the library.
You can also paste a novel link from one of these sources.

Chapters are fetched on demand and cached in app storage; opening an online
novel does not download its entire chapter list as text. **Refresh chapters**
in the book sheet checks for updates. Stable chapter IDs preserve positions
when a source inserts or reorders chapters. **Save this place** adds a reading
bookmark alongside the existing decorative bookmarks.

If a source asks for browser verification, tap **Connect**, complete it in the
separate source window, tap **Done**, and retry. That window has no reader
bridge. Remote chapter HTML is sanitized before the existing reader loads it.

Provider code is adapted from QuickNovel; provenance and GPL-3.0 notices are
under `third_party/quicknovel/`. This integration was requested for private use.

Provider parser tests: `:app:testDebugUnitTest`. They cover all four layouts,
chapter ordering and deduplication, FreeWebNovel's chapter-list request,
restricted URLs, sanitization, and clear failures when markup changes.

## Build and install

There is no Gradle wrapper yet. Build with the cached Gradle and JDK 17:

```bash
export JAVA_HOME="$HOME/.gradle/jdks/eclipse_adoptium-17-aarch64-os_x.2/jdk-17.0.19+10/Contents/Home"
"$HOME/.gradle/wrapper/dists/gradle-9.1.0-bin/9agqghryom9wkf8r80qlhnts3/gradle-9.1.0/bin/gradle" --no-daemon -q :app:assembleDebug
"$HOME/Library/Android/sdk/platform-tools/adb" install -r app/build/outputs/apk/debug/app-debug.apk
```

JavaScript console output shows up in `adb logcat -s chromium`.

ReadFrom.Net contains conventional novels split into reading pages. Its books
show **Pages** in their contents and detail view. Repeated line breaks are
normalized into paragraphs for the existing reader, and different page links
for the same book share one library identity.
