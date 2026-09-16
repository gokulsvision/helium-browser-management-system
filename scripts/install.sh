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

mkdir -p "$HOME/Library/Application Support/Browser Management System"

echo
echo "Native helper installed."
echo "Load the unpacked extension from:"
echo "  $ROOT/extension"
echo
echo "Helium:  helium://extensions  → Developer mode → Load unpacked"
echo "Chrome:  chrome://extensions  → Developer mode → Load unpacked"
echo
echo "Sleeping tabs are saved to:"
echo "  $HOME/Library/Application Support/Browser Management System/hibernated.json"
