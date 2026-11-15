#!/bin/sh
# Build the debug APK and install it on the connected phone.
set -e
cd "$(dirname "$0")"
export JAVA_HOME="$HOME/.gradle/jdks/eclipse_adoptium-17-aarch64-os_x.2/jdk-17.0.19+10/Contents/Home"
osascript -l JavaScript <<'JXA'
ObjC.import('Foundation');
['app.js', 'sources.js', 'motion-lab.js'].forEach(function(file) {
    var source = $.NSString.stringWithContentsOfFileEncodingError('app/src/main/assets/web/' + file, 4, null).js;
    new Function(source);
});
'Reader scripts: syntax OK';
JXA
"$HOME/.gradle/wrapper/dists/gradle-9.1.0-bin/9agqghryom9wkf8r80qlhnts3/gradle-9.1.0/bin/gradle" --no-daemon -q :app:assembleDebug
ADB="$HOME/Library/Android/sdk/platform-tools/adb"
"$ADB" install -r app/build/outputs/apk/debug/app-debug.apk
"$ADB" shell am force-stop app.reader.proto
"$ADB" shell am start -n app.reader.proto/.MainActivity >/dev/null 2>&1
echo "installed and launched"
