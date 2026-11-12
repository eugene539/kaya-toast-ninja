#!/bin/sh
# Regenerates the native app icons and splash images from resources/icon-1024.png with macOS sips
# (no extra npm dependency). Run from the repo root on a Mac: sh tools/native-assets.sh
# The source is a copy of Art/10-kaya-toast-ninja/_lock/exports/icon-1024.png (never edit Art/).
set -eu
SRC=resources/icon-1024.png
ICON_BG=FF844F     # the icon's own orange background, sampled from the corners
SPLASH_BG=2B1D14   # the game's background colour (index.html, capacitor.config.ts)
RES=android/app/src/main/res
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

resize() { sips -z "$2" "$2" "$SRC" --out "$3" >/dev/null; }
# pad <in> <h> <w> <hex> <out>: centre the image on a filled canvas
pad() { sips -p "$2" "$3" --padColor "$4" "$1" --out "$5" >/dev/null 2>&1; }

# Android legacy and round launcher icons (48dp) and adaptive foreground (108dp canvas, art in
# the 66dp safe zone, padded with the icon orange so any mask shape shows only icon colours).
for d in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  name=${d%%:*}; rest=${d#*:}; legacy=${rest%%:*}; fg=${rest#*:}
  resize x "$legacy" "$RES/mipmap-$name/ic_launcher.png"
  resize x "$legacy" "$RES/mipmap-$name/ic_launcher_round.png"
  inner=$(( fg * 66 / 108 ))
  resize x "$inner" "$TMP/fg.png"
  pad "$TMP/fg.png" "$fg" "$fg" "$ICON_BG" "$RES/mipmap-$name/ic_launcher_foreground.png"
done

# Android splash (pre Android 12 window background): icon at 40 percent of the short side.
splash() { # <out> <w> <h>
  short=$2; [ "$3" -lt "$short" ] && short=$3
  s=$(( short * 2 / 5 ))
  resize x "$s" "$TMP/s.png"
  pad "$TMP/s.png" "$3" "$2" "$SPLASH_BG" "$1"
}
splash "$RES/drawable/splash.png" 480 320
for d in mdpi:320:480 hdpi:480:800 xhdpi:720:1280 xxhdpi:960:1600 xxxhdpi:1280:1920; do
  name=${d%%:*}; rest=${d#*:}; w=${rest%%:*}; h=${rest#*:}
  splash "$RES/drawable-port-$name/splash.png" "$w" "$h"
  splash "$RES/drawable-land-$name/splash.png" "$h" "$w"
done

# iOS app icon (1024, no alpha) and the launch-screen splash (2732 square, aspect fill).
cp "$SRC" ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
for f in splash-2732x2732.png splash-2732x2732-1.png splash-2732x2732-2.png; do
  splash "ios/App/App/Assets.xcassets/Splash.imageset/$f" 2732 2732
done
echo "native icons and splash regenerated from $SRC"
