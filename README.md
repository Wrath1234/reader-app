# Reader Proto (Android)

First on-device prototype of the reader. A Kotlin shell imports and serves EPUBs;
the reading UI is a WebView app in `app/src/main/assets/web/`.

- `MainActivity.kt` – WebView host, file picker import, haptics, image saving, back handling
- `Epub.kt` – EPUB 2/3 package parser (metadata, spine, cover, NCX / nav contents)
- `Library.kt` – imported books in app storage (`files/books/<id>/`)
- `assets/web/app.js` – library, EPUB cleanup, effects, read tracker, bookmarks, quotes, sound
- `assets/web/app.css` – generated from the HTML prototype plus app overrides

The app has no internet permission. Fonts are bundled.

## Build and install

There is no Gradle wrapper yet. Build with the cached Gradle and JDK 17:

```bash
export JAVA_HOME="$HOME/.gradle/jdks/eclipse_adoptium-17-aarch64-os_x.2/jdk-17.0.19+10/Contents/Home"
"$HOME/.gradle/wrapper/dists/gradle-9.1.0-bin/9agqghryom9wkf8r80qlhnts3/gradle-9.1.0/bin/gradle" --no-daemon -q :app:assembleDebug
"$HOME/Library/Android/sdk/platform-tools/adb" install -r app/build/outputs/apk/debug/app-debug.apk
```

JavaScript console output shows up in `adb logcat -s chromium`.
