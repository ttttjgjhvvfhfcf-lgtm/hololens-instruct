#!/bin/sh
# Öffnet die watt-champion-Oberfläche im Chromium-Kiosk-Modus (Vollbild, ohne Bedienelemente).
# Aufruf:  deploy/kiosk.sh [URL]      Standard-URL: http://127.0.0.1:8080/
URL="${1:-http://127.0.0.1:8080/}"

BROWSER="$(command -v chromium-browser || command -v chromium)"
if [ -z "$BROWSER" ]; then
  echo "Chromium nicht gefunden (sudo apt install chromium-browser)" >&2
  exit 1
fi

# Auf den Server warten (er startet evtl. parallel als systemd-Dienst)
until curl -fs -o /dev/null "$URL"; do sleep 1; done

exec "$BROWSER" --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
  --disable-pinch --overscroll-history-navigation=0 --autoplay-policy=no-user-gesture-required "$URL"
