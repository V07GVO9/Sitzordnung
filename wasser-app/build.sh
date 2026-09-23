#!/usr/bin/env bash
# Baut die APK ohne Gradle mit den Ubuntu-Paketen:
#   sudo apt-get install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23 default-jdk
set -euo pipefail
cd "$(dirname "$0")"

SDK_JAR=/usr/lib/android-sdk/platforms/android-23/android.jar
OUT=build
rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/tools"

# App-Icon erzeugen
javac -d "$OUT/tools" tools/MakeIcon.java
java -Djava.awt.headless=true -cp "$OUT/tools" MakeIcon res/mipmap-xxxhdpi/ic_launcher.png

# Ressourcen + R.java
aapt package -f -m -J "$OUT/gen" -M AndroidManifest.xml -S res -I "$SDK_JAR" \
    -F "$OUT/app.unsigned.apk" -0 arsc

# Java kompilieren (Java 8, ohne Lambdas -> dx-kompatibel)
javac -source 8 -target 8 -Xlint:-options -encoding UTF-8 -bootclasspath "$SDK_JAR" \
    -d "$OUT/classes" $(find src "$OUT/gen" -name '*.java')

# Dex
dalvik-exchange --dex --min-sdk-version=24 --output="$OUT/classes.dex" "$OUT/classes"

# In APK packen, ausrichten, signieren
(cd "$OUT" && aapt add app.unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$OUT/app.unsigned.apk" "$OUT/app.aligned.apk"
if [ ! -f wasser.keystore ]; then
    keytool -genkeypair -keystore wasser.keystore -storepass wasser123 -keypass wasser123 \
        -alias wasser -keyalg RSA -keysize 2048 -validity 10000 \
        -dname "CN=Wasserprotokoll, C=DE" >/dev/null 2>&1
fi
apksigner sign --ks wasser.keystore --ks-pass pass:wasser123 --ks-key-alias wasser \
    --out Wasserprotokoll.apk "$OUT/app.aligned.apk"
apksigner verify --verbose Wasserprotokoll.apk | head -4
echo "Fertig: $(pwd)/Wasserprotokoll.apk"
