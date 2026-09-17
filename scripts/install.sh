#!/usr/bin/env bash
# Install Browser Management System native host for Chromium browsers on macOS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST_SRC="$ROOT/native/bms-host"
HOST_DST="$HOME/.local/share/browser-management-system/bms-host"
EXT_ID="occkalmjgdilhnphpbjopodjkpppcddj"
HOST_NAME="com.browsermanagement.system"

mkdir -p "$(dirname "$HOST_DST")"
cp "$HOST_SRC" "$HOST_DST"
chmod +x "$HOST_DST"

MANIFEST=$(cat <<EOF
{
  "name": "$HOST_NAME",
  "description": "Browser Management System RAM helper",
  "path": "$HOST_DST",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF
)

install_manifest() {
  local dir="$1"
  if [ -d "$(dirname "$dir")" ] || [ -d "$dir" ]; then
    mkdir -p "$dir"
    echo "$MANIFEST" > "$dir/$HOST_NAME.json"
    echo "  host -> $dir"
  fi
}

echo "Installing Browser Management System native host..."
install_manifest "$HOME/Library/Application Support/net.imput.helium/NativeMessagingHosts"
install_manifest "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
install_manifest "$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
install_manifest "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
install_manifest "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
install_manifest "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
install_manifest "$HOME/Library/Application Support/Arc/User Data/NativeMessagingHosts"
install_manifest "$HOME/Library/Application Support/Vivaldi/NativeMessagingHosts"

SHARE="$HOME/.local/share/browser-management-system"
APP_SUPPORT="$HOME/Library/Application Support/Browser Management System"
mkdir -p "$SHARE" "$APP_SUPPORT"
cp "$ROOT/scripts/clear-site-cache.py" "$SHARE/clear-site-cache.py"
chmod +x "$SHARE/clear-site-cache.py"
if [ ! -f "$APP_SUPPORT/POLICY.md" ]; then
  cp "$ROOT/POLICY.md" "$APP_SUPPORT/POLICY.md"
fi

PLIST_SRC="$ROOT/scripts/com.browsermanagement.cache.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.browsermanagement.cache.plist"
sed -e "s|CACHE_SCRIPT|$SHARE/clear-site-cache.py|g" \
    -e "s|HOME|$HOME|g" \
    "$PLIST_SRC" > "$PLIST_DST"

UID_NUM="$(id -u)"
launchctl bootout "gui/$UID_NUM/com.gokul.clear-riverside-cache" 2>/dev/null || true
launchctl bootout "gui/$UID_NUM/com.browsermanagement.cache" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST_DST"
launchctl enable "gui/$UID_NUM/com.browsermanagement.cache"

# old one-off helper now points at BMS
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/clear-helium-riverside-cache" <<EOF
#!/bin/bash
exec /usr/bin/python3 "$SHARE/clear-site-cache.py"
EOF
chmod +x "$HOME/.local/bin/clear-helium-riverside-cache"

echo
echo "Native helper installed."
echo "Nightly site-cache job installed (see POLICY.md Disk cache)."
echo "Load the unpacked extension from:"
echo "  $ROOT/extension"
echo
echo "Helium:  helium://extensions  → Developer mode → Load unpacked"
echo
echo "Policy (edit this to add sites):"
echo "  $APP_SUPPORT/POLICY.md"
echo "Sleeping tabs:"
echo "  $APP_SUPPORT/hibernated.json"
