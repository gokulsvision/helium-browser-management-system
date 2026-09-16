#!/usr/bin/env bash
# Build a double-clickable macOS app that runs the installer.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/dist/Browser Management System.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Browser Management System</string>
  <key>CFBundleDisplayName</key><string>Browser Management System</string>
  <key>CFBundleIdentifier</key><string>com.browsermanagement.system</string>
  <key>CFBundleVersion</key><string>1.1.0</string>
  <key>CFBundleShortVersionString</key><string>1.1.0</string>
  <key>CFBundleExecutable</key><string>BMS</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

cat > "$APP/Contents/MacOS/BMS" <<'EXEC'
#!/bin/bash
DIR="$(cd "$(dirname "$0")/../Resources/browser-management-system" && pwd)"
osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  do script "bash '$DIR/scripts/install.sh'; echo; echo 'Then load unpacked: $DIR/extension'; echo"
end tell
APPLESCRIPT
open "helium://extensions" 2>/dev/null || open -a Helium "helium://extensions" 2>/dev/null || true
EXEC
chmod +x "$APP/Contents/MacOS/BMS"

# Copy project into Resources so the app is self-contained
rm -rf "$APP/Contents/Resources/browser-management-system"
mkdir -p "$APP/Contents/Resources/browser-management-system"
rsync -a --exclude dist --exclude .git --exclude '*.pem' "$ROOT/" "$APP/Contents/Resources/browser-management-system/"

echo "Built $APP"
