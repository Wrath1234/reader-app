# Handover: Reader app (Android ebook reader with living text)

Written for whoever picks this up next (a fresh Claude session or a developer). It covers the vision, the current state of the code and the phone, the decisions already made, how to build and test, and what is planned next. Read sections 1 to 4 first.

---

## 1. What this is

A personal Android ebook reader, built for the owner's own use (not a Play Store release). The owner wants it to be **aesthetic and unlike a normal reader**: not "words on a black page". The central idea is **living text**: the page reacts to the story (emotion words animate, dialogue is styled by tone, the mood and soundscape shift, the book visibly wears with use). It must eventually support many formats, but **only EPUB is implemented so far**.

The owner's stance on content: they download books themselves and import the EPUB. They asked about QuickNovel-style web-novel scraping; the assistant declined to write scrapers for sites hosting unlicensed copies (it offered a generic provider framework and legal sources instead). The owner then said "I will download from online and use the epub", so **import-by-file is the intended route**. Do not build scrapers for pirate sites.

## 2. Current state (read this carefully)

There are **three different states** to keep straight:

| Where | What |
|---|---|
| **On the phone right now** | The build from about 21:42 (Nov 14). It has everything through the "v8" step: expanded word families, element particle effects (Expressive only), mark-based sentence fonts, the hold-to-read feather, brush-stroke guide, press-and-hold jump, performance fixes. It does **not** have the v9 themes or the new flame. |
| **In the source files** | The v9 edits were applied to the source but **never built or installed** (the build command was interrupted): five extra skins (parchment, daylight, midnight, forest, dusk), a `.light` override block, a new SVG-flame fire effect, and a `statusStyle` bridge method for light status-bar icons. The user has since decided against most of this (see section 3). |
| **Decided but not implemented** | Keep only **Midnight** and **Rain Canopy** as extra themes, and **redesign the flame** as paper burn marks (section 3). |

Because the source is ahead of the phone, the first job is to make the source match the decisions in section 3, then build and install.

## 3. Immediate plan (what the owner has asked for)

1. **Add two themes only: Midnight and Rain Canopy.** Remove Parchment, Daylight, Dusk. Rename the old "forest" skin to Rain Canopy and change its colours.
2. **Redesign the flame effect** as burn marks on the page that expand (like the tear stains for crying).

### 3.1 Themes

The owner picked these from `reader-mockups/forest.html` (served on port 5178):

**Midnight** (pure black for OLED, no glow):
`--pagebg:#000; --txt:#cdcdcd; --dim:#7a7a7a; --acc:#a9b3c9; --ui:#eee; --sheet:#0b0b0b (add fb alpha like the others); --chip:#ffffff12`. Hide `.glow i` entirely.

**Rain Canopy** (matte green, "the green of a tree in rain", darker with a cool grey-blue mist at the top like low cloud):
`--pagebg:linear-gradient(#1b2923,#121b17); --txt:#c6d2cc; --dim:#7d968c; --acc:#86b3a0; --ui:#e4eee9; --sheet:#101914; --chip:#ffffff14`.
Mist: `radial-gradient(100% 45% at 20% 0, rgba(150,185,185,.18), transparent 72%)`. Implement it cheaply (a static gradient layer or the existing `.glow` blob tinted grey-blue). **No animation, no blur filter** (see performance, section 9). The mockup's optional falling-rain overlay (option D) was not chosen; do not add it.

Where to change in the code:
- `app.js`: `SKINS` and `LIGHT` constants (around line 20). Set `SKINS=['room','aurora','midnight','rain']` and `LIGHT=[]`. `applySettings()` toggles `skin-<name>` classes and calls `A.statusStyle(light)`.
- `index.html`: the `#cSkin` chip row. It currently lists seven skins.
- `app.css`: the "v9: fire, themes" block near the end defines `.skin-parchment/.skin-daylight/.skin-midnight/.skin-forest/.skin-dusk` and the `.light …` overrides. Delete parchment, daylight, dusk and the `.light` rules. Rename `.skin-forest` to `.skin-rain` and swap the colours. Keep `.skin-midnight`.
- `MainActivity.kt`: `statusStyle(light)` can stay (harmless) or be removed. If every theme is dark it is unnecessary.
- Remember the first card style for the quote maker: in `qm.onclick` the default is `LIGHT.includes(ST.skin)?'paper':ST.skin==='room'?'warm':'aurora'`. With no light skins this simplifies to warm for Warm Room, aurora otherwise.
- Existing skins: **Warm Room** (default, warm brown, candlelight) and **Aurora Glass** (dark blue-black with coloured glow). The owner likes both.

### 3.2 Flame redesign

The owner liked how crying puts **water stains on the page** and asked for fire to do something similar: **burn marks on paper that expand**. Two mockups are in `reader-mockups/burn.html`:
- **Option A, burn spreads out from the word** (assistant's recommendation): a jagged, glowing ember ring pushes outward from the word; behind it the paper chars black; two small flames ride the edge; sparks and smoke rise; afterwards a dark scorch with a brown halo stays on the page.
- **Option B, creeping along the line**: a glowing ember edge races left and right under the line leaving a charred band.

The owner **has not picked A or B** (they said "forget it" and asked for this handover). Default to A, confirm with the owner, and **show a mockup before implementing** (see working style, section 11).

The mockup's construction, to reuse:
- Three stacked, jagged shapes on the word (`position:absolute; z-index:-1`), each using a `clip-path: polygon(...)` with ~27 points for the torn edge:
  - `halo` (4.4em × 2.2em): brown radial gradient, stays.
  - `char` (3.5em × 1.75em): near-black radial gradient, stays.
  - `rim` (3.9em × 1.95em): orange/yellow ring gradient that fades out (to dull red, then 0).
- All three animate `transform: translate(-50%,-50%) scale(.12 → 1)` over 2.4s with `cubic-bezier(.2,.7,.3,1)`; `halo` and `char` fade in and **stay**; `rim` fades with `rimFade` over 4s.
- The word itself runs `hotText`: orange flicker text-shadow, then settles to the normal colour.
- Two small flame SVGs ride outward along the edge (`rideL`, `rideR`); embers (`spark`) and smoke (`smoke`) rise.
- Current fire entry in `FXDEF` (app.js line ~322) is `fire:[['hot',1,0],['flame',9,1900],['ember',7,2100],['scorch',1,0]]`, with the v9 CSS (`.px-flame`, `.px-hot`, `.px-ember`, `.px-scorch`, `fireText`) at the end of `app.css`. The burn-mark redesign replaces these.
- **Subtle mode keeps only the hot text flicker (`fireText`), no shapes.** Particles are Expressive only.
- Constraints: no `filter`/blur/backdrop-filter, only `transform` and `opacity` animations, keep clip-paths static, and make the residual marks cheap so they stay on the page. They must be removed when the guide jumps backwards (see `pcApply`, which removes `.px`).

## 4. Environment, build, install, test

**Machine:** macOS (Darwin 25.4), user home `/Users/vanity`. Project root: `/Users/vanity/claude/reader-app`. Mockups: `/Users/vanity/claude/reader-mockups`.

**Phone:** Xiaomi/Redmi model `25053PC47G`, Android 16 (SDK 36), 1280×2772 px, density 520 (about 2.5x CSS pixels at 412dp wide), arm64-v8a, WebView `com.google.android.webview 156.0.8078.47`. Connected over **wireless debugging**. The IP and port **change** whenever wireless debugging is toggled or the phone sleeps. Reconnect with:

```bash
export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
adb mdns services          # lists adb-…_adb-tls-connect entries (IP:port)
adb connect <ip>:<port>    # one entry usually refuses, try the other
adb devices
```

**Build tooling (no Gradle wrapper exists):**
- Gradle 9.1.0 from `~/.gradle/wrapper/dists/gradle-9.1.0-bin/9agqghryom9wkf8r80qlhnts3/gradle-9.1.0/bin/gradle`
- JDK 17 at `~/.gradle/jdks/eclipse_adoptium-17-aarch64-os_x.2/jdk-17.0.19+10/Contents/Home` (system Java is 25 and is not used)
- Android SDK at `~/Library/Android/sdk` (platforms android-36, build-tools 34 to 37). `local.properties` points at it.
- AGP 9.0.1, compileSdk 36, minSdk 30, targetSdk 36. `build.gradle.kts` applies only `com.android.application`; Kotlin compiles through AGP 9's built-in support (no Kotlin plugin line).
- A SDK-XML-version warning prints on every build; ignore it.

**One command to build, install and launch:** `sh /Users/vanity/claude/reader-app/build.sh` (about 1 to 2 minutes; builds `:app:assembleDebug`, `adb install -r`, force-stops and starts `app.reader.proto/.MainActivity`).

**Before every install, syntax-check `app.js`** (a missing semicolon once shipped a broken build to the phone; node is not installed, so use this):

```bash
osascript -l JavaScript -e 'ObjC.import("Foundation");var s=$.NSString.stringWithContentsOfFileEncodingError("/Users/vanity/claude/reader-app/app/src/main/assets/web/app.js",4,null).js;try{new Function(s);"syntax ok"}catch(e){"SYNTAX ERROR: "+e.message}'
```

**Inspecting the live app on the phone.** Debug builds enable WebView debugging. `tools/cdp.py` is a dependency-free Chrome DevTools client (WebSocket over `adb forward` to `webview_devtools_remote_<pid>`). It can evaluate JavaScript in the running page, which is how everything was tested:

```python
import sys; sys.path.insert(0,'/Users/vanity/claude/reader-app/tools')
import cdp
s=cdp.connect(); print(cdp.ev(s,"document.title"))      # run JS
print(cdp.gfx(5))                                        # frame-time stats over 5 s (gfxinfo)
```
The app must be in the foreground and a page loaded. Other helpers in `tools/`: `perf2.py`, `perf3.py` (frame timing with the guide running), `fx.py` (run the guide through a paragraph and screenshot), `trig.py`/`trig2.py` (word-family coverage on the test book), `modes.py` (verify Off/Subtle/Expressive), `final.py`. They hard-code a scratch path for screenshots; adjust `SP` first. Screenshots: `adb exec-out screencap -p > file.png`. JS console errors: `adb logcat -d -s chromium:V | grep CONSOLE`.

**Desktop harness (optional).** The web app can run in a desktop browser with a mocked `window.Android` (a `dev.html` generated in the old scratchpad, which is temporary). It is not in the project. Testing on the real phone with `cdp.py` is preferred.

**Books on the phone** (copied into app storage on import): *The Darkness That Comes Before* (the owner's main test book, 85 sections, 29 chapters), *Shadow Slave*, and *Emotion Trigger Words* (a 10-paragraph passage the owner made to test emotion detection; very useful). Source EPUBs sit in `/sdcard/Download/Epub/`. **The Download folder holds unrelated personal files; do not open or list them beyond that Epub folder.**

**Caveats when scripting adb:** the file-picker coordinates were found with `adb shell uiautomator dump`. Long compound shell commands with many redirects were once blocked by the tool's safety heuristic even though they contained no deletions; keep commands short and split them.

## 5. Architecture

```
reader-app/
  build.sh                      build + install + launch
  README.md                     short build notes
  HANDOVER.md                   this file
  tools/                        phone-testing scripts (cdp.py etc.)
  app/src/main/
    AndroidManifest.xml         VIBRATE only (NO INTERNET permission); VIEW intent filter for epub
    java/app/reader/proto/
      MainActivity.kt           WebView host, request interception, bridge, import, back handling
      Epub.kt                   EPUB 2/3 package parser
      Library.kt                imported books in app storage
    res/                        launcher icon (vector), theme, strings
    assets/web/
      index.html                all markup: library, reader, sheets, card/quote screens
      app.js                    all behaviour (about 660 long lines)
      app.css                   all styling (about 600 lines; GENERATED once, now treat as source)
      fonts.css + fonts/*.woff2 bundled fonts (22 files, about 830 KB)
```

**Design choice:** native Kotlin shell + the reader UI as a WebView app. Reason: it reused the approved HTML prototype and made effects fast to iterate. Kotlin/Compose was the earlier recommendation; it can be revisited, but the effects are CSS-heavy.

### 5.1 MainActivity.kt
- A plain `Activity` hosting one `WebView` loading `https://reader.local/web/index.html`. All content is served from inside the app by `shouldInterceptRequest`:
  - `/web/<path>` serves `assets/web/<path>`.
  - `/book/<bookId>/<zip entry path>` streams an entry straight out of the imported EPUB zip.
  - `/cover/<bookId>` streams the cover image.
  - Navigation away from host `reader.local` is blocked. `allowFileAccess`/`allowContentAccess` are off.
- Long-press and the system text-selection menu are disabled (the app draws its own highlighter).
- `WebView.setWebContentsDebuggingEnabled(true)` only when the app is debuggable.
- Window insets are converted to dp and pushed to JS via `window.__insets(top,bottom)`; JS stores them as CSS variables `--sat` and `--sab`.
- Back handling: Android 13+ `OnBackInvokedDispatcher`, older `onBackPressed`; both call `window.__back()` in JS, which closes sheets/quote mode/book in order and returns `true` when it consumed the event, otherwise the activity finishes.
- Import: `ACTION_OPEN_DOCUMENT` (`*/*` with epub/zip hints) in `startActivityForResult`; also handles `ACTION_VIEW` intents (Open-with). Import runs on a thread and calls `window.__imported({id}|{error}|{cancelled})`.
- **JS bridge object `Android`:** `listBooks()`, `getBook(id)`, `importBook()`, `deleteBook(id)`, `insets()`, `haptic("12" | "25,50,25")`, `savePng(name, dataUrl)` (writes to `Pictures/ReaderProto` through MediaStore), and in the unbuilt v9 source `statusStyle(light)`.
- `haptic`: a single pulse of 12 ms or less uses `HapticFeedbackConstants.CLOCK_TICK`; otherwise a `VibrationEffect` one-shot or waveform (on,off,on…).

### 5.2 Epub.kt
Parses `META-INF/container.xml` to the OPF; reads title/author/language, the manifest, the spine (HTML items only), cover (checks `<meta name="cover">`, `properties~cover-image`, then id/path containing "cover"), CSS files, and the table of contents (NCX preferred, else EPUB 3 nav). Strips DOCTYPE before XML parsing so no external DTD is fetched. Hrefs are URL-decoded and normalised by `resolve()`. Throws `NotAnEpub` with a user-facing message for bad files.

### 5.3 Library.kt
Each import is copied to `filesDir/books/<id>/book.epub` where `id` = first 16 hex chars of the MD5 of the file (so re-importing the same file is a no-op) plus `meta.json`. `meta.json` fields: `id,title,author,lang,spine:[{href,size}],toc:[{title,href,frag,depth}],css:[path],total,cover,coverType,added,file`. Zip files are kept open in a cache. The ID format is validated (`[a-f0-9]{8,40}`) before any path is built.

### 5.4 Web app state (localStorage keys)
- `settings`: the `ST` object (see `DEF` in app.js): `skin, font, size, lh, m, ls, align, par, dc, focus, ticks, emo('off'|'subtle'|'expressive'), ink, vig, motes, snd, vol, hap, auto, pacer, wpm, pcPos, dust, xfont`.
- `b:<bookId>`: per-book state `st`: `ch` (current section), `pos` ({ch,i,f} paragraph index and fraction), `max` (furthest book progress 0..1), `unlocked[]`, `bm` (chosen bookmark), `reveal`, `newDot`, `wear`, `ticks{ch:[idx]}`, `reach{ch:n}`, `done{ch:1}`, `firstDone`, `pc` ({ch,p,w} the guide position).
- `last`: id of the book last opened (library hero card).
- `quotes`: array of `{text,style,glow,book,author,date}`.

### 5.5 app.js structure (search by function name)
`applySettings`, `keepPos` (keeps the reading position stable while a setting reflows text) · library: `renderLib`, `openBook`, `closeBook` · EPUB cleanup: `elFlags`, `inl`, `cleanSegs`, `finishBlock`, `walk`, `parseChapter` · effects: `LEX`, `catOf`, `TAG`, `annotate`, `buildPara` · loading: `loadChapter`, `observeInk`, `fire`, `FXDEF`, `spawnFx`, `emoFx` · tracker: `autoPassed`, `updateReading`, `tickPara`, `capturePos`, `restorePos` · mood/sound: `autoMood`, `setMood`, `initAudio`, `setScene` · sheets/contents: `openSheet`, `buildToc` · bookmarks: `BMS`, `checkUnlocks`, `revealBM` · quotes: `paint`, `collect`, `sentenceSpan`, `drawCard`, `openCard`, `showList`, poster button · guide: `wrapWords`, `pcApply`, `pcStep`, `pcRun`, `pcStop`, `pcJump`, `wordAt`, `lpGo`, the feather handlers (`phStart/phMove/phEnd`) · `window.__back`.

## 6. EPUB reading pipeline

`loadChapter(i)` fetches the section XHTML from `/book/<id>/<path>`, parses with `DOMParser` (XHTML first, HTML fallback), and `walk()` turns it into **blocks**: `p`, `h` (heading), `q` (blockquote), `img`, `hr` (ornament scene break), `gap`. Publisher CSS is **not applied**; instead `loadCssFlags()` reads class rules from the book's stylesheet (`font-style: italic`, `font-weight: bold`, `text-align: center/right`, larger font-size) so italics/bold/centred headings survive. Heuristics: short bold/centred/large blocks become headings; blocks with only punctuation become scene-break ornaments; tiny black-on-white images become "glyph" ornaments (redrawn once on a canvas as cream ink on transparent so no blend mode is needed); empty runs collapse to a single gap; chapter and part labels get the small-caps label style; drop caps only on the first long paragraph after a heading.

Each paragraph gets `class="para"`, an index `data-i`, and its words/dialogue/sentences wrapped in spans (see section 7). End of each section: Previous/Next buttons. The table of contents sheet (☰) uses the book's TOC with percentage positions; sections without TOC entries still load through Next/Previous.

Not handled yet: footnotes (shown as plain text), tables, RTL languages, ruby text, fixed-layout EPUBs, EPUB 3 media overlays, DRM (not supported and not planned).

## 7. Features in detail

### 7.1 Reading modes: ticks, free scroll, and the guide
- **Read ticks:** a small circle in both margins at the end of the current paragraph. Tapping greys the paragraph and moves "current" on; tapping a greyed tick undoes it. Hidden whenever the guide is on.
- **Position tracking without ticks:** a paragraph counts as passed once only its last line is left below the "reading line" (`readTop()` = 78 px below the top inset). Exposed in the Book sheet ("Reader at", plus a debug switch "Show reading line"). Reaching the bottom of a section counts as finishing it.
- **The guide (reading assistant), default on (`ST.pacer`):** a floating feather button, bottom right.
  - **Hold** the feather (170 ms) and a soft grey brush stroke runs along the text, one word at a time, auto-scrolling (it scrolls every 3 words to keep the line at about 30% of the screen). **Let go and it stops.**
  - While holding, **slide right = faster, left = slower** (10 words/min per 18 px, range 80 to 600, default 220, shown in a "NNN words/min" bubble, with a haptic tick). Speed persists in `ST.wpm`.
  - **Tap** the feather to switch it into **move mode** (icon becomes cross-arrows, dashed ring); drag it anywhere, tap again to leave move mode. Position saved as screen fractions (`ST.pcPos`). In normal mode a drag only changes speed.
  - Timing per word: `60000/wpm × (0.6 + min(len,12)/10)`, plus 0.6 for a comma/semicolon/colon/dash and 1.1 for a sentence end; a pause of 1.4 × base between paragraphs. The run stops at the end of the section.
  - **Visuals:** the current word gets a brush-stroke underlay (`.w.pw::after`, an inline SVG data URI with two paths, scaling in over the word's duration); the previous six words keep a fading trail (`.fd`); read words in the paragraph dim to 42% (`.rd`); finished paragraphs dim (`.pread`).
  - **Jumping:** press and hold any word 480 ms to jump the guide there (forwards or backwards; it snaps to the nearest word if you press in a gap); double-tap a word does the same. **Jumping backwards resets all animations after that point** (removes `play`/`ink-in` and any particles) so they replay.
  - **Effects fire when the guide reaches the word** (`fireFor`), not when scrolled into view, so nothing is spoiled early. With the guide off, an `IntersectionObserver` triggers them as text enters the reading zone (`observeInk`).
  - Words are wrapped lazily per paragraph (`wrapWords`) when the guide reaches them, grouped so a word split across inline tags (word + comma) stays one unit.
  - The earlier "swipe up to pause, tap a floating icon to resume" idea was replaced by hold-to-read at the owner's request.

### 7.2 Emotion words (living text)
`LEX` maps **30 families** to regular expressions covering all forms of each word (about 1,500 word forms in total): `cry, sorrow, anger, fear, shake, blood, pain, death, dark, fire, cold, joy, smile, love, wary, hush, loud, magic, light, steel, water, heart, fall, rush, surprise, wonder, memory, sleep, wind, disgust`. Lists were built from the NRC-style emotion categories, writers' dialogue-tag lists and word counts from the owner's test book (a web search for ranked word-frequency lists found nothing usable; the NRC lexicon file itself was **not** downloaded because its licence is research-only). `annotate()` finds matches, skips negations ("was not crying": `NEG` regex looks 16 characters back), caps at **14 animated words per paragraph** (`CAP`), and tags each word `fx emo emo-<family>`. The matched words (`ems`) also feed the mood detector. "cried" is classed as `loud` (shouting) rather than crying because the test book uses it that way.

Settings (✦ sheet, "Emotion words"): **Off / Subtle / Expressive** (class `ei-off|ei-subtle|ei-expressive` on `#app`):
- **Subtle:** a tint (about 44% mix of the family colour) plus a small motion or glow animation. Cry's paper-stain drops are in both modes.
- **Expressive:** the same, plus **element particles** spawned by `spawnFx` from `FXDEF` (flames, ice crystals and snowflakes, blood drips and splatter, anger cracks and steam, fear shards, ink pools, ash, stars, light rays, ripples, wind streaks and leaves, hearts, confetti, a smile arc, rain, sparks, mist, eyelids for suspicion, dust, speed lines, starbursts, sepia patch and specks, bubbles, a pain bolt, ooze). Particles are `<i class="px px-<name>">` children of the word, removed after their lifetime, or left as permanent marks when lifetime is 0 (scorch, splat, ink, etc.).
- Crying: four jagged blots (`.drop.d1-d4`, `clip-path` polygons, dark centre with a pale dried rim) land around the word. This is the effect the owner loves most; keep it.
- Disgust has a subtle look (green glow and a queasy wobble, `queasy`) and an Expressive one (ooze and bubbles).
- Haptics fire once per 500 ms at most (`hapOnce`) for anger, fear/shake, heartbeat, loud/exclamation, cry, surprise.

### 7.3 Dialogue tone
`annotate()` finds quotes (curly and straight) and reads the words around each one (70 characters before, 90 after, never crossing another quote) against `TAG` lists, so `"how dare you," she said angrily` styles the quote itself, not only the tag. Classes:
- `ink-shout` (contains `!`, an ALL-CAPS word, or a shouting tag): bold, glows and the paragraph shakes once when reached. Combined with an angry tag it becomes `dlg-angry` (bigger and red, scaled by the number of `!`/caps via `--lv`).
- `dlg-angry` alone: bigger, heavier, red tint, heat pulse at the screen edge.
- `ink-whisper`: italic, starts faint (opacity .2) and fades in as the guide arrives.
- `dlg-cry`, `dlg-fear` (trembles), `dlg-joy` (hops), `dlg-sad`: tints and small motion.
- Sudden narration words (bang, crash, shattered, slammed, exploded) get `ink-sudden`: a brief full-page flash plus haptic.

### 7.4 Punctuation and sentence fonts
- Punctuation animates (`pm` classes): `!` jumps and glows in the accent colour; `?` hooks upward; an em dash before a closing quote snaps in; an ellipsis fades in.
- **Expressive fonts** (Aa sheet, on by default): whole sentences ending in `?` are set in an italic serif (`.sn-q`, Lora, or Cormorant if the body font is Cormorant), sentences ending in `!` in bold Playfair Display (`.sn-ex`). Sentences are found per quote or outside quotes and never span a quote boundary.

### 7.5 Mood, atmosphere, sound
- `autoMood(r)` scores the emotion words, shouts and sudden words in paragraphs r-1 to r+4 using `MW` weights into four moods (tense, sad, mystery, hopeful; threshold 4.5, otherwise calm) and calls `setMood`, which sets the glow colour (`--glow`) and the vignette opacity (`.vig`, tension 0 to .75). The Atmosphere sheet lets the reader override mood or turn auto off.
- Ambient glow is on by default; **drifting dust motes are decorative, off by default** (they force constant redraws; they are hidden whenever the guide runs).
- **Soundscapes** are generated live with Web Audio (no audio files): rain, fire (with random crackles), wind, library (hush and page rustles). Off by default; "Auto" maps mood to scene (calm fire, tense wind, sad rain, mystery and hopeful library); volume slider; scenes crossfade over about 2 s; audio suspends when the book closes.
- **Haptics** switch in the Atmosphere sheet.
- TTS / read-aloud was **rejected** by the owner ("tts is bad").

### 7.6 Bookmarks (cosmetic only)
Six designs: crimson ribbon, gilded tassel, quill, oak leaf, crescent charm, skeleton key (`BMS`). They are **earned silently, with no notification**: the first when a full section of 12 or more paragraphs is finished (`st.firstDone`), then at 20, 40, 60, 80 and 98.5% of the book (`THR`). The next time the book is opened, the newly earned bookmark **slides up and out of the page** (`revealBM`, `.bmrev`, 2 s) then hangs from the top (`#bmHang`, about 104 px tall, tap to open the Book sheet). A red dot on the 🔖 button marks something new until the sheet is opened. **Bookmarks do nothing functionally: reading position always saves automatically**, anchored to a paragraph index plus a fraction, so it survives font and size changes.

### 7.7 Worn book
`st.wear` (0 to 1) grows with scrolling (`distance / 2,500,000` per scroll event). It drives `--w`, which controls edge yellowing, creases, a dog-eared corner and a coffee ring on the page, plus a cracked-spine look on the mini cover in the Book sheet. A slider in the Book sheet previews it.

### 7.8 Quotes
- ❝ enters **quote mode**: a marker-pen bar appears. **Tap a sentence** to highlight it, or **press and drag** (260 ms hold) across words to highlight a span; tap an existing highlight to remove it. Highlights can span several paragraphs; they are joined with " … " when making the card. Uses `caretRangeFromPoint` and the CSS Custom Highlight API for the live preview, then wraps real `<mark class="q">` nodes.
- **Make card** opens a 1080×1350 canvas card with four styles (Candlelight, Aurora, Paper, Mono), book title and author. **Save** stores it in the Quotes list; **Save image** writes a PNG to `Pictures/ReaderProto`.
- ▤ opens the Quotes screen: **Grid** or **Wall** (tilted, pinned cards on plaster) and **Save wall as poster** (one PNG of the whole wall). Tapping a saved quote reopens it to restyle or remove.
- Highlighting is currently only for making quote cards (there is no general persistent highlighter or notes yet).

### 7.9 Library and import
Library screen: greeting, a "Continue reading" hero card (progress, Continue/Open), an "All books" grid with covers (generated covers for books without one: hue from the title hash), a long-press-free "⋯ → Remove?" two-step delete, and a floating **Import EPUB** button (system file picker). Imported files are copied into the app; originals are untouched. Empty state explains import. Progress shown is `st.max`.

### 7.10 Settings sheet (Aa)
Skin; typeface (Literata default, Cormorant Garamond, Lora, Atkinson Hyperlegible, Inter); size 13 to 26; line gap; margins 24 to 48 (minimum 24 so the tick boxes never overlap text); letter spacing; left/justified; indented/spaced paragraphs; **Reading guide** on/off; drop cap; **Expressive fonts**; focus mode (dims all but the current paragraph); read ticks. Changing any layout setting keeps the reading position (`keepPos`).

## 8. Design decisions the owner has made (do not re-litigate)
- Looks to keep: **Warm Room** and **Aurora Glass**; the book cover designs from those; "not just words on a black page".
- Wanted: quote cards that are saved in the app and downloadable; quote wall; cover fallback generator (done for the library only); worn-book effect; reactive ink; soundscapes with haptics; bookmarks earned silently with a slide-out on reopen; read tracking with ticks, replaced by the guide; emotion animations that feel natural and do not spoil the story; Subtle vs Expressive modes; "jagged water drops on paper" for crying.
- Rejected: read-aloud/TTS; tap-to-resume floating button (replaced by hold-to-read); the "speed right = slower" direction (flipped to right = faster); extra light themes and the Dusk theme (this session); the optional falling-rain overlay on the green theme.
- Many words are intentionally **not** animated because they are too frequent in the test book ("holy", "scarlet", "seas" were considered).
- Bookmarks, ticks and effects must never be gamified or noisy; the owner wants subtle-but-visible.

## 9. Performance findings and the rules that came out of them

Measured on the phone with `dumpsys gfxinfo` (frame time p50). Display reports 120 Hz modes, so the budget is 8.3 ms ideal, 16.6 ms acceptable.
- Original build: about 23 ms p50, janky and laggy while the guide ran.
- Causes found by switching layers off one at a time: endless decorative animations (the drifting dust and the swaying bookmark forced a full redraw every frame, each costing about 4 ms), `backdrop-filter` blur, `mask-image` fades on the scroller, `mix-blend-mode` glyph images, `filter: blur`/SVG displacement on tear drops, per-paragraph line-height changes, and the vignette's CSS variable animation.
- After fixes: about 11 ms idle and with the guide running; about 18 ms scrolling the 270-paragraph novel with the guide at 220 wpm; the dense test paragraph with Expressive particles measured 14 to 36 ms (worst case).
- **Rules:** no always-running animations; no `filter`, `backdrop-filter`, `mask-image`, `mix-blend-mode` on large or scrolling areas; use `transform` and `opacity` only; keep `clip-path` shapes static; put particles on their own layers (`will-change`) and remove them after use; fade the top and bottom of the page with overlay gradients (`#rd::before/::after`) instead of masks; set the vignette with an opacity transition, not a variable animation.

## 10. Bugs fixed, known issues, and what has NOT been verified

**Fixed during development:** contents sheet scrolled the whole page (fixed with `scrollTop`); progress label overlapped text (hidden when chrome hides); `trembled` spacing gap in justified text (stopped using inline-block); guide line "grew then shrank" at the end of a paragraph (the old resizing line was replaced by per-word strokes); words like blood and tears skipping animation (per-paragraph cap was 1 to 2, now 14); a missing semicolon in `app.js` briefly shipped a broken build.

**Known issues / not yet verified:**
- Press-and-hold highlighting for quotes and the long-press jump were verified by script calls, not by finger on the phone. Real touch behaviour needs a human check.
- The bookmark slide-out was shown working only in the desktop prototype; on-device it is untested.
- Soundscapes and haptic feel are unverified on the phone.
- The guide's behaviour in very long runs (chapter ends, many paragraphs) has only light testing.
- Frame time in Expressive on dense effect paragraphs can still exceed budget.
- Previous/Next buttons can sit behind the bottom bar on very short sections until scrolled.
- Quote mode and the guide may interact oddly (the feather is hidden in quote mode).
- Settings changes while the guide is mid-run are not specially handled.
- Some formatting heuristics (heading detection, gap collapsing) were tuned on three books only.

## 11. Working style and owner preferences (important)
- **Mockups first for any visual or animation change.** The owner interrupted a build to say "make mockups first before implementing" and asked for the mockup to be shown on localhost or in chat, **whichever uses less usage**. A one-file HTML mockup on the localhost server (port 5178) has been the cheap route. Do not build visual changes before the owner approves a mockup.
- **Be economical.** The owner hit usage limits mid-session; they care about cost. Prefer short answers, few tool calls, and cheap verification. Avoid long investigations.
- **"Quick, and put it on my phone"** is the owner's usual request: build, install and check on the real device (wireless debugging is on).
- The owner gives feature ideas conversationally, often asking "any ideas?" first. When they say "don't implement, suggest", only suggest.
- They are happy for the assistant to recommend; keep recommendations short with a clear pick.
- Privacy: do not put the owner's name, email or anything personal in outside requests. Their device listing contains unrelated personal files in Downloads; leave them alone.
- Legal: no scrapers for unlicensed sources; importing the owner's own EPUB files is the sanctioned route. A generic provider framework for legal sources (Gutenberg, Standard Ebooks, OPDS, AO3 exports) was proposed and not built.

## 12. Backlog (not started unless noted)
1. **Midnight + Rain Canopy themes and the burn-mark fire redesign** (section 3). Then rebuild and verify on the phone.
2. More formats: PDF (reflow mode and fixed layout), DOCX (via an HTML conversion), MOBI/AZW3, FB2, TXT/MD/HTML, CBZ/CBR comics. The plan was one internal book model (chapters, blocks, inline runs) so all effects work on every format; today everything is EPUB-shaped.
3. Library: richer shelf designs (Reading Room / bookshelf look), series grouping, search, Browse/Sources screen (only legal sources), cover fallback generator using the Warm Room and Aurora cover designs for the grid.
4. General highlights and notes (separate from quote cards), export to Markdown, search inside a book, offline dictionary, footnote popovers.
5. Spoiler-safe cast/glossary/map keyed to the furthest paragraph (the tracker already stores `st.reach`).
6. Reading stats as art, year-in-books, lock-screen quote widget, backup/restore.
7. Settings: master "calm mode", battery-saver mode (drop animation), per-book overrides, onboarding, accessibility pass (TalkBack, contrast, reduced motion).
8. Release concerns if it ever leaves personal use: signing, launcher icon polish, removing debug WebView inspection, privacy (already no internet permission).

## 13. Mockup index (all in `/Users/vanity/claude/reader-mockups`, served at `http://localhost:5178/<file>` once `reader-mockups` is started from `/Users/vanity/claude/.claude/launch.json`)
- `index.html`: the four original design directions (Reading Room, Living Bookshelf, Paper & Ink, Aurora Glass).
- `reader.html`, `reader2.html`, `reader3.html`: the interactive reading prototypes that the app was ported from (typography sheet and quote cards; bookmarks, wear, wall, sound, haptics; emotion words, silent bookmark reveal, read ticks). `reader3.html`'s stylesheet was the base of `app.css`.
- `themes.html`: seven-theme palette mockup and the first fire redesign (flames behind the word).
- `forest.html`: Midnight plus four matte-green options (A Wet Fern, B Rain Canopy, C Moss Stone, D Wet Leaf). **B was chosen.**
- `burn.html`: the burn-mark fire options A and B (**undecided**).

## 14. Gotchas checklist for the next session
- `app.css` was originally **generated** by a script (`tools/buildcss.py.NOTE-generator-only-reference`) that copied the prototype CSS from `reader-mockups/reader3.html` and appended patches. **Do not re-run it**; it would overwrite later hand edits. Edit `app.css` directly from now on. (The copy in `tools/` is for reference only and its paths point at a temporary folder.)
- Several helper scripts used a temporary scratch folder that may no longer exist; the useful ones were copied to `tools/`.
- Always syntax-check `app.js` before installing (section 4).
- The wireless-debugging port changes; reconnect with `adb mdns services` and try each entry.
- `adb install -r` keeps the app's data (settings, books, positions). To reset a book's state or settings, clear them in the page through `cdp.py` (`localStorage.removeItem('b:<id>')`) or uninstall.
- The installed APK predates the v9 source edits (section 2); do not assume the phone shows what the source says.
- Fonts are bundled in `assets/web/fonts` and referenced by `fonts.css`; the app has no internet permission, so any new font must be bundled.
