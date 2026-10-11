#!/usr/bin/env bash
# ============================================================================
#  install-klipper-unoq.sh
#  Klipper + Moonraker + Mainsail auf dem Arduino UNO Q (Debian 13, arm64)
#
#  Ein fertiges "MainsailOS"-Image gibt es fuer das UNO Q nicht (Qualcomm-
#  Bootkette, Arduino liefert nur sein eigenes Debian-Image). Dieses Skript
#  installiert deshalb denselben Stack auf dem vorhandenen Debian - mit der
#  gleichen Ordnerstruktur, den gleichen Diensten und den gleichen nginx-
#  Vorlagen wie MainsailOS bzw. KIAUH. KIAUH laesst sich danach weiter benutzen.
#
#  Aufruf (als Benutzer "arduino", NICHT als root, in einer interaktiven
#  Shell - per ssh oder "adb shell"):
#
#    bash install-klipper-unoq.sh check          nur pruefen, nichts aendern
#    bash install-klipper-unoq.sh install        Klipper+Moonraker+Mainsail+Touch-Setup
#    bash install-klipper-unoq.sh firmware uart  M8P-V2.0-Firmware bauen: UART (USART1 PA10/PA9)
#    bash install-klipper-unoq.sh firmware usb   M8P-V2.0-Firmware bauen: USB (PA11/PA12, fuer CM4)
#    bash install-klipper-unoq.sh status         Dienste, Ports, USB-Geraete, Touch anzeigen
#
#  Optionen:  --port N   Port fuer Mainsail (Standard 80)
#             -y         keine Rueckfrage vor der Installation
#             --force    Fehler der Systempruefung ignorieren
# ============================================================================
# shellcheck disable=SC1091,SC2001,SC2012
set -Eeuo pipefail
export PATH="${PATH}:/usr/sbin:/sbin"

# ------------------------------------------------------------ Einstellungen
PORT=80
ASSUME_YES=0
FORCE=0
CMD=""
FW_MODE=""

USER_NAME="$(id -un)"
DATA_DIR="${HOME}/printer_data"
KLIPPER_DIR="${HOME}/klipper"
KLIPPER_ENV="${HOME}/klippy-env"
MOONRAKER_DIR="${HOME}/moonraker"
MAINSAIL_DIR="${HOME}/mainsail"
MAINSAIL_CFG_DIR="${HOME}/mainsail-config"
FW_DIR="${HOME}/m8p-firmware"
LOG_FILE="${HOME}/klipper-install.log"
MIN_FREE_MB=3000       # frei im Home-Verzeichnis (Quellcode, Python-Umgebungen, Firmware-Build)
MIN_FREE_ROOT_MB=1700  # Rueckfall fuer die Root-Partition, wenn apt den Bedarf nicht berechnen kann
ROOT_MARGIN_MB=500     # Reserve fuer die Pakete, die Moonraker selbst per apt nachinstalliert

# Ohne "Recommends" installieren: apt wuerde sonst libstdc++-arm-none-eabi-newlib (C++-Bibliothek
# fuer den ARM-Compiler, ~2 GB entpackt) mitziehen. Klipper-Firmware ist reines C; die C-Bibliothek
# libnewlib-arm-none-eabi wird dagegen zum Linken gebraucht (sonst "cannot find -lc_nano").
APT_PKGS=(
  git curl wget unzip ca-certificates
  build-essential python3 python3-dev python3-virtualenv libffi-dev libncurses-dev
  dfu-util stm32flash gcc-arm-none-eabi binutils-arm-none-eabi libnewlib-arm-none-eabi
  nginx usbutils libinput-tools xinput evtest xserver-xorg-input-libinput
)

M8P_CFG_NAME="generic-bigtreetech-manta-m8p-V2_0.cfg"
M8P_CFG_URL="https://raw.githubusercontent.com/bigtreetech/Manta-M8P/master/V2.0/Firmware/${M8P_CFG_NAME}"
MAINSAIL_ZIP_URL="https://github.com/mainsail-crew/mainsail/releases/latest/download/mainsail.zip"

NGINX_SITES_DIR=/etc/nginx/sites-enabled

HAVE_SYSTEMD=0
[ -d /run/systemd/system ] && HAVE_SYSTEMD=1

# ------------------------------------------------------------------ Ausgabe
if [ -t 1 ]; then
  C_B=$'\033[1m'; C_R=$'\033[31m'; C_G=$'\033[32m'; C_Y=$'\033[33m'; C_C=$'\033[36m'; C_N=$'\033[0m'
else
  C_B=''; C_R=''; C_G=''; C_Y=''; C_C=''; C_N=''
fi
PROBLEMS=0
WARNINGS=0
say()  { printf '\n%s==> %s%s\n' "${C_B}${C_C}" "$*" "$C_N"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '  %s✔%s %s\n' "$C_G" "$C_N" "$*"; }
warn() { printf '  %s!%s %s\n' "$C_Y" "$C_N" "$*"; WARNINGS=$((WARNINGS + 1)); }
bad()  { printf '  %s✘%s %s\n' "$C_R" "$C_N" "$*"; PROBLEMS=$((PROBLEMS + 1)); }
die()  { printf '\n%sFEHLER:%s %s\n' "$C_R" "$C_N" "$*" >&2; exit 1; }

on_err() {
  local code="$1" line="$2" cmd="$3"
  printf '\n%sABBRUCH%s in Zeile %s (Exit-Code %s): %s\n' "$C_R" "$C_N" "$line" "$code" "$cmd" >&2
  printf 'Protokoll: %s - die Installation laesst sich gefahrlos erneut starten.\n' "$LOG_FILE" >&2
  printf 'Freier Platz (apt installiert nach /, nicht nach %s):\n' "$HOME" >&2
  df -h / "$HOME" 2>&1 | sed 's/^/    /' >&2 || true
}
trap 'on_err "$?" "$LINENO" "$BASH_COMMAND"' ERR

usage() { sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; }

# ------------------------------------------------------------------ Helfer
# Kernelmodul geladen, ladbar oder fest eingebaut?
have_kmod() {
  local m="$1" pat
  [ -d "/sys/module/${m}" ] && return 0
  [ -d "/sys/module/${m//-/_}" ] && return 0
  modinfo "$m" >/dev/null 2>&1 && return 0
  pat="${m//[-_]/[-_]}"
  grep -qE "(^|/)${pat}\.ko" "/lib/modules/$(uname -r)/modules.builtin" 2>/dev/null && return 0
  return 1
}

port_in_use() {
  local listeners
  listeners="$(ss -ltnH 2>/dev/null | awk '{print $4}' || true)"
  grep -qE "[:.]$1\$" <<<"$listeners"
}

# Laeuft nginx und kennt er nur die Debian-Standardseite und/oder die Mainsail-Seite?
nginx_ours_only() {
  local f
  pgrep -x nginx >/dev/null 2>&1 || return 1
  for f in "$NGINX_SITES_DIR"/*; do
    [ -e "$f" ] || [ -L "$f" ] || continue   # leeres/fehlendes Verzeichnis: Glob bleibt woertlich stehen
    case "${f##*/}" in default|mainsail) ;; *) return 1 ;; esac
  done
  return 0
}

detect_serial() {
  # genau ein Eintrag in /dev/serial/by-id -> wahrscheinlich der UART-Adapter
  local list n
  list="$(ls -1 /dev/serial/by-id/ 2>/dev/null || true)"
  n="$(grep -c . <<<"$list" || true)"
  if [ "${n:-0}" -eq 1 ]; then printf '/dev/serial/by-id/%s' "$list"; fi
}

confirm() {
  [ "$ASSUME_YES" -eq 1 ] && return 0
  [ -t 0 ] || die "Keine interaktive Eingabe moeglich - bitte mit -y starten."
  local a
  read -r -p "$1 [j/N] " a
  case "$a" in j|J|y|Y|ja|Ja|JA) return 0 ;; *) return 1 ;; esac
}

sudo_keepalive() {
  sudo -v || die "sudo funktioniert nicht - Passwort des Benutzers '${USER_NAME}' pruefen."
  ( while true; do sleep 50; sudo -n true 2>/dev/null || exit 0; done ) &
  SUDO_KEEP_PID=$!
  trap 'kill "${SUDO_KEEP_PID}" 2>/dev/null || true' EXIT
}

# ------------------------------------------------- Platz auf der Root-Partition
# apt schreibt nach /usr und /var. Auf dem UNO Q liegt "/" auf einer anderen (kleineren)
# Partition als /home/arduino - der freie Platz im Home-Verzeichnis sagt dazu nichts.
to_mb() {  # "3,499 MB" | "615 kB" | "1.2 GB"  ->  ganze MB
  awk -v s="$1" 'BEGIN {
    split(s, a, " "); v = a[1]; gsub(",", "", v); u = a[2]
    if (u == "kB") v /= 1024; else if (u == "GB") v *= 1024; else if (u == "B") v /= 1048576
    printf "%d", v + 0.5 }'
}

# Download + entpackte Groesse der noch fehlenden Pakete laut "apt-get -s" (leer/Fehler: unbekannt)
apt_need_mb() {
  local sim dl inst mb=0
  sim="$(LC_ALL=C apt-get -s install --no-install-recommends "${APT_PKGS[@]}" 2>&1 || true)"
  if grep -q '^E:' <<<"$sim"; then return 1; fi
  # "Need to get 176 MB of archives." oder, bei teilweise geladenen Paketen, "... 12.3 MB/615 MB of archives."
  dl="$(sed -n 's/^Need to get \(.*\) of archives.*/\1/p' <<<"$sim" | head -n1)"
  dl="${dl##*/}"
  inst="$(sed -n 's/^After this operation, \(.*\) of additional disk space will be used.*/\1/p' <<<"$sim" | head -n1)"
  if [ -n "$dl" ]; then mb=$((mb + $(to_mb "$dl"))); fi
  if [ -n "$inst" ]; then mb=$((mb + $(to_mb "$inst"))); fi
  printf '%d' "$mb"
}

dpkg_unfinished() { [ -n "$(dpkg --audit 2>/dev/null)" ]; }

check_root_space() {
  local free_mb need_mb total src
  free_mb="$(df -Pm / | awk 'NR==2 {print $4}')"
  if dpkg_unfinished; then
    warn "dpkg meldet eine abgebrochene Paketinstallation - 'install' repariert das und prueft den Platz auf / danach erneut."
    return 0
  fi
  if need_mb="$(apt_need_mb)"; then
    src="berechnet mit apt"
  else
    need_mb="$MIN_FREE_ROOT_MB"
    src="Schaetzwert - apt-Paketlisten nicht lesbar"
  fi
  total=$((need_mb + ROOT_MARGIN_MB))
  info "Root-Partition (/): ${free_mb} MB frei; apt braucht ca. ${need_mb} MB + ${ROOT_MARGIN_MB} MB Reserve (${src})"
  if [ "${free_mb:-0}" -ge "$total" ]; then
    ok "Platz auf der Root-Partition (/) reicht"
  else
    bad "Zu wenig Platz auf der Root-Partition (/): ${free_mb} MB frei, benoetigt ca. ${total} MB (apt installiert nach /usr und /var, nicht nach ${HOME}). Platz schaffen z. B. mit: sudo apt-get clean; sudo apt-get autoremove; sudo journalctl --vacuum-size=50M  (Docker-Daten nur nach eigener Pruefung: docker system df)"
  fi
}

# Nach einer abgebrochenen Installation (z. B. "No space left on device") bleiben Pakete halb
# entpackt zurueck. Diese werden entfernt (apt installiert sie bei Bedarf sauber neu) und der
# Rest fertig konfiguriert; zusaetzlich wird der apt-Zwischenspeicher geleert.
repair_dpkg() {
  dpkg_unfinished || return 0
  say "Abgebrochene Paketinstallation reparieren"
  local half
  half="$(dpkg-query -W -f='${db:Status-Abbrev} ${Package}\n' 2>/dev/null | awk '$1 ~ /^.H/ {print $2}')"
  sudo apt-get clean
  if [ -n "$half" ]; then
    info "Halb installierte Pakete werden entfernt: $(tr '\n' ' ' <<<"$half")"
    # shellcheck disable=SC2086
    sudo dpkg --purge --force-remove-reinstreq $half || true
  fi
  sudo dpkg --configure -a || true
  if dpkg_unfinished; then
    warn "dpkg ist noch nicht sauber - 'sudo apt-get -f install --no-install-recommends' kann den Rest beheben."
  else
    ok "dpkg-Zustand repariert"
  fi
}

# ------------------------------------------------------------- Systempruefung
check_system() {
  say "Systempruefung"
  local arch os_id os_like os_ver os_pretty model pyver mem_mb free_mb

  if [ "$(id -u)" -eq 0 ]; then
    bad "Als root gestartet - bitte als normaler Benutzer (z. B. 'arduino') ausfuehren."
  else
    ok "Benutzer: ${USER_NAME}"
  fi
  if ! command -v sudo >/dev/null 2>&1; then bad "sudo ist nicht installiert."; fi

  arch="$(uname -m)"
  if [ "$arch" = "aarch64" ]; then ok "Architektur: aarch64 (arm64)"; else warn "Architektur ist ${arch} - das Skript ist fuer das UNO Q (aarch64) gedacht."; fi

  os_id="$(. /etc/os-release 2>/dev/null; printf '%s' "${ID:-}")"
  os_like="$(. /etc/os-release 2>/dev/null; printf '%s' "${ID_LIKE:-}")"
  os_ver="$(. /etc/os-release 2>/dev/null; printf '%s' "${VERSION_ID:-0}")"
  os_pretty="$(. /etc/os-release 2>/dev/null; printf '%s' "${PRETTY_NAME:-unbekannt}")"
  case " ${os_id} ${os_like} " in
    *" debian "*)
      if [ "$os_id" = "debian" ] && [ "${os_ver%%.*}" -lt 12 ] 2>/dev/null; then
        warn "${os_pretty}: aelter als Debian 12 - Python/Pakete koennten zu alt sein."
      else
        ok "Betriebssystem: ${os_pretty}"
      fi ;;
    *) bad "Kein Debian-System (${os_pretty}) - das Skript nutzt apt." ;;
  esac
  info "Kernel: $(uname -r)"

  model=""
  [ -r /proc/device-tree/model ] && model="$(tr -d '\0' </proc/device-tree/model)"
  case "$model" in
    *[Uu][Nn][Oo]*|*[Aa]rduino*) ok "Board: ${model}" ;;
    "") warn "Boardmodell nicht lesbar." ;;
    *) warn "Board: '${model}' - sieht nicht nach einem UNO Q aus." ;;
  esac

  if python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
    pyver="$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
    ok "Python ${pyver}"
  else
    bad "python3 fehlt oder ist aelter als 3.9."
  fi

  mem_mb="$(awk '/^MemTotal:/ {print int($2/1024)}' /proc/meminfo)"
  free_mb="$(df -Pm "$HOME" | awk 'NR==2 {print $4}')"
  info "RAM: ${mem_mb} MB   frei im Home-Verzeichnis: ${free_mb} MB"
  if [ "${free_mb:-0}" -ge "$MIN_FREE_MB" ]; then ok "Speicherplatz in ${HOME} reicht (>= ${MIN_FREE_MB} MB frei)"; else bad "Zu wenig freier Speicher in ${HOME} (${free_mb} MB, benoetigt ${MIN_FREE_MB} MB)."; fi
  check_root_space

  if ! command -v curl >/dev/null 2>&1; then
    # curl wird erst in install_packages nachinstalliert - ohne curl laesst sich GitHub hier nicht testen.
    warn "curl fehlt noch - GitHub-Erreichbarkeit kann erst nach der Paketinstallation geprueft werden."
  elif curl -fsS -m 12 -o /dev/null https://github.com 2>/dev/null; then
    ok "Internet/GitHub erreichbar"
  else
    bad "GitHub nicht erreichbar - WLAN/Internet pruefen."
  fi

  if port_in_use "$PORT"; then
    if nginx_ours_only; then
      # Nach einer abgebrochenen oder wiederholten Installation laeuft nginx schon mit der
      # Debian-Standardseite auf Port 80; die Mainsail-Seite loest sie spaeter ab.
      ok "Port ${PORT} wird von nginx genutzt (nur Standard-/Mainsail-Seite) - das passt"
    else
      bad "Port ${PORT} ist von einem anderen Dienst belegt - mit '--port 8080' ausweichen."
    fi
  else
    ok "Port ${PORT} (Mainsail) ist frei"
  fi
  if port_in_use 7125 && ! pgrep -f moonraker >/dev/null 2>&1; then
    bad "Port 7125 (Moonraker) ist von einem anderen Dienst belegt."
  fi

  local d
  for d in "$KLIPPER_DIR" "$MOONRAKER_DIR" "$MAINSAIL_DIR" "$DATA_DIR"; do
    if [ -e "$d" ]; then info "bereits vorhanden: ${d} (wird nicht ueberschrieben)"; fi
  done
}

check_usb_touch() {
  say "USB, Seriell-Treiber und Touch"
  local role m found adapters dmode="" dbg=/sys/kernel/debug/usb/4e00000.usb/mode

  # Der debugfs-Eintrag ist verlaesslicher als typec/data_role (Arduino-Forum), braucht aber root.
  if [ -r "$dbg" ]; then
    dmode="$(cat "$dbg" 2>/dev/null || true)"
  elif sudo -n true 2>/dev/null; then
    dmode="$(sudo -n cat "$dbg" 2>/dev/null || true)"
  fi

  if [ -n "$dmode" ]; then
    case "$dmode" in
      host) ok "USB-C-Controller arbeitet als Host (debugfs: ${dmode})" ;;
      *) warn "USB-C-Controller steht auf '${dmode}', nicht auf 'host'. Normal, solange das UNO Q per USB am Rechner haengt (adb). Am Dock mit Netzteil muss 'host' stehen - sonst tauchen USB-Geraete nicht auf (bekannter dwc3-Fehler bei Versorgung ueber VIN; neueres Image oder github.com/Psalmustrack/arduino-uno-q-usb-fix; Notbehelf: echo host | sudo tee ${dbg})." ;;
    esac
  elif [ -r /sys/class/typec/port0/data_role ]; then
    role="$(cat /sys/class/typec/port0/data_role)"
    case "$role" in
      *"[host]"*) ok "USB-C arbeitet als Host (${role})" ;;
      *) warn "USB-C steht nicht auf Host (${role}) - dieser Wert ist laut Arduino-Forum nicht immer verlaesslich. Normal, solange das UNO Q per USB am Rechner haengt (adb). Am Dock mit Netzteil muessen USB-Geraete in 'lsusb' auftauchen (bekannter dwc3-Fehler bei Versorgung ueber VIN, Hinweise: github.com/Psalmustrack/arduino-uno-q-usb-fix)." ;;
    esac
  else
    info "USB-C-Rolle nicht lesbar (/sys/class/typec/port0/data_role fehlt)."
  fi

  if command -v lsusb >/dev/null 2>&1; then
    found="$(lsusb 2>/dev/null | grep -vi 'root hub' || true)"
    if [ -n "$found" ]; then
      info "Angeschlossene USB-Geraete:"
      sed 's/^/      /' <<<"$found"
    else
      info "Keine externen USB-Geraete erkannt."
    fi
  else
    info "lsusb fehlt (Paket usbutils) - wird bei der Installation nachgeholt."
  fi

  if ls /dev/serial/by-id/* >/dev/null 2>&1; then
    info "Serielle Geraete (/dev/serial/by-id):"
    ls -1 /dev/serial/by-id/ | sed 's/^/      /'
  else
    info "Noch kein serielles Geraet (Klipper-MCU bzw. USB-UART-Adapter) erkannt."
  fi

  if have_kmod cdc_acm; then ok "Treiber cdc_acm vorhanden (Klipper-MCU per USB, z. B. mit CM4)"; else warn "Treiber cdc_acm fehlt - MCU per USB-CDC waere nicht nutzbar."; fi
  adapters=""
  for m in cp210x ch341 ftdi_sio pl2303; do
    if have_kmod "$m"; then adapters="${adapters} ${m}"; fi
  done
  if [ -n "$adapters" ]; then
    ok "Treiber fuer USB-UART-Adapter vorhanden:${adapters}"
  else
    warn "Kein Treiber fuer USB-UART-Adapter (cp210x/ch341/ftdi_sio/pl2303) gefunden - der UART-Weg zur M8P braeuchte einen davon."
  fi
  if ! have_kmod ch341; then
    warn "Kein CH340/CH341-Treiber im Kernel: Billig-Adapter mit CH340-Chip funktionieren hier NICHT. Nimm einen USB-UART-Adapter mit CP2102 oder FT232."
  fi

  for m in usbhid hid_multitouch; do
    if have_kmod "$m"; then ok "Touch-Treiber '${m}' vorhanden"; else warn "Kernelmodul '${m}' fehlt - der Touch des HDMI5 koennte nicht funktionieren."; fi
  done

  found="$(grep -i -E '^N: Name=.*(touch|goodix|ilitek|multi)' /proc/bus/input/devices 2>/dev/null || true)"
  if [ -n "$found" ]; then
    ok "Touch-Eingabegeraet erkannt:"
    sed 's/^N: Name=/      /' <<<"$found"
  else
    info "Noch kein Touch-Eingabegeraet erkannt (HDMI5 neben HDMI auch per USB anschliessen - Datenkabel am Type-C-Port bzw. USB-Header des Displays, siehe Handbuch)."
  fi

  if dpkg -s brltty >/dev/null 2>&1; then
    warn "brltty ist installiert - es kann CH340/CP210x-Adapter belegen. Bei Problemen: sudo apt purge brltty"
  fi
  if systemctl is-active --quiet ModemManager 2>/dev/null; then
    warn "ModemManager laeuft - er kann serielle Geraete kurz blockieren. Bei Verbindungsproblemen: sudo systemctl disable --now ModemManager"
  fi
}

preflight() {
  PROBLEMS=0
  WARNINGS=0
  check_system
  check_usb_touch
  say "Ergebnis der Pruefung"
  if [ "$PROBLEMS" -eq 0 ]; then
    ok "Keine Hindernisse gefunden (${WARNINGS} Hinweis(e))"
  else
    bad "${PROBLEMS} Problem(e) gefunden, ${WARNINGS} Hinweis(e)"
  fi
}

# ------------------------------------------------------------- Installation
install_packages() {
  say "Systempakete (apt)"
  repair_dpkg
  sudo apt-get -o DPkg::Lock::Timeout=300 update
  # Genauer Platzbedarf erst jetzt, nach "update" und einer eventuellen Reparatur.
  PROBLEMS=0
  check_root_space
  if [ "$PROBLEMS" -gt 0 ] && [ "$FORCE" -ne 1 ]; then
    die "Nicht genug Platz auf / - nichts wurde installiert. Platz schaffen oder mit --force fortfahren."
  fi
  sudo DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 install -y --no-install-recommends "${APT_PKGS[@]}"
}

install_klipper() {
  say "Klipper"
  if [ -d "${KLIPPER_DIR}/.git" ]; then
    ok "Quellcode vorhanden (${KLIPPER_DIR}) - wird nicht neu geklont"
  else
    git clone https://github.com/Klipper3d/klipper.git "$KLIPPER_DIR"
  fi
  if [ ! -x "${KLIPPER_ENV}/bin/python" ]; then
    virtualenv -p python3 "$KLIPPER_ENV"
  fi
  "${KLIPPER_ENV}/bin/pip" install --disable-pip-version-check -U pip
  "${KLIPPER_ENV}/bin/pip" install --disable-pip-version-check -r "${KLIPPER_DIR}/scripts/klippy-requirements.txt"

  mkdir -p "${DATA_DIR}"/{config,logs,gcodes,systemd,comms,database}
  # Zugriff auf /dev/ttyUSB* und /dev/ttyACM*
  sudo usermod -aG tty,dialout "$USER_NAME"

  cat > "${DATA_DIR}/systemd/klipper.env" <<EOF
KLIPPER_ARGS="${KLIPPER_DIR}/klippy/klippy.py ${DATA_DIR}/config/printer.cfg -I ${DATA_DIR}/comms/klippy.serial -l ${DATA_DIR}/logs/klippy.log -a ${DATA_DIR}/comms/klippy.sock"
EOF

  if [ -f /etc/systemd/system/klipper.service ]; then
    ok "klipper.service vorhanden - unveraendert"
  else
    sudo tee /etc/systemd/system/klipper.service >/dev/null <<EOF
[Unit]
Description=Klipper 3D Printer Firmware SV1
Documentation=https://www.klipper3d.org/
After=network-online.target
Wants=udev.target

[Install]
WantedBy=multi-user.target

[Service]
Type=simple
User=${USER_NAME}
RemainAfterExit=yes
WorkingDirectory=${KLIPPER_DIR}
EnvironmentFile=${DATA_DIR}/systemd/klipper.env
ExecStart=${KLIPPER_ENV}/bin/python \$KLIPPER_ARGS
Restart=always
RestartSec=10
EOF
    ok "klipper.service angelegt"
  fi
}

write_printer_cfg() {
  local f="${DATA_DIR}/config/printer.cfg" serial
  serial="$(detect_serial)"
  if [ -n "$serial" ]; then
    info "Serielles Geraet erkannt und in printer.cfg eingetragen: ${serial}"
  else
    serial="/dev/serial/by-id/HIER-ADAPTER-EINTRAGEN"
  fi

  if [ -e "$f" ]; then
    ok "printer.cfg vorhanden - unveraendert"
  else
    cat > "$f" <<EOF
# printer.cfg - Minimal-Konfiguration zum Testen der BTT Manta M8P V2.0 am UNO Q.
# kinematics: none = es wird kein kompletter Drucker benoetigt, Klipper prueft nur,
# ob die MCU-Verbindung steht.

[include mainsail.cfg]

[mcu]
# UART-Weg: 3,3-V-USB-UART-Adapter am TFT-Header der M8P (USART1 PA10/PA9),
# Firmware aus "install-klipper-unoq.sh firmware uart".
# Den genauen Namen zeigt:  ls -l /dev/serial/by-id/
serial: ${serial}
baud: 250000
restart_method: command
# USB-Weg (nur mit CM4 auf dem Board, Firmware "usb"):
#serial: /dev/serial/by-id/usb-Klipper_stm32h723xx_XXXXXXXXXXXX-if00

[printer]
kinematics: none
max_velocity: 1000
max_accel: 1000

[virtual_sdcard]
path: ${DATA_DIR}/gcodes
on_error_gcode: CANCEL_PRINT

[pause_resume]

[display_status]

# Spaeter, fuer den echten Drucker: BTT-Pinbelegung einbinden und dann die
# Abschnitte [mcu] und [printer] oben entfernen:
#[include ${M8P_CFG_NAME}]
EOF
    ok "printer.cfg angelegt"
  fi

  if [ ! -e "${DATA_DIR}/config/${M8P_CFG_NAME}" ]; then
    if curl -fsSL -m 30 -o "${DATA_DIR}/config/${M8P_CFG_NAME}" "$M8P_CFG_URL"; then
      ok "BTT-Referenzkonfiguration abgelegt (${M8P_CFG_NAME}, noch nicht eingebunden)"
    else
      rm -f "${DATA_DIR}/config/${M8P_CFG_NAME}"
      warn "BTT-Referenzkonfiguration konnte nicht geladen werden (nicht kritisch)."
    fi
  fi
}

install_moonraker() {
  say "Moonraker"
  if [ -d "${MOONRAKER_DIR}/.git" ]; then
    ok "Quellcode vorhanden (${MOONRAKER_DIR}) - wird nicht neu geklont"
  else
    git clone https://github.com/Arksine/moonraker.git "$MOONRAKER_DIR"
  fi

  local f="${DATA_DIR}/config/moonraker.conf"
  if [ -e "$f" ]; then
    ok "moonraker.conf vorhanden - unveraendert"
  else
    cat > "$f" <<EOF
[server]
host: 0.0.0.0
port: 7125
klippy_uds_address: ${DATA_DIR}/comms/klippy.sock

[authorization]
trusted_clients:
    10.0.0.0/8
    127.0.0.0/8
    169.254.0.0/16
    172.16.0.0/12
    192.168.0.0/16
    FC00::/7
    FE80::/10
    ::1/128
cors_domains:
    *.lan
    *.local
    *://localhost
    *://localhost:*
    *://my.mainsail.xyz
    *://app.fluidd.xyz

[octoprint_compat]

[history]

[announcements]
subscriptions:
    mainsail

[update_manager]
channel: dev
refresh_interval: 168
EOF
    ok "moonraker.conf angelegt"
  fi

  # Das offizielle Moonraker-Installationsskript uebernimmt Abhaengigkeiten,
  # virtuelle Umgebung, systemd-Dienst und PolicyKit-Regeln.
  local flags=(-d "$DATA_DIR")
  [ "$HAVE_SYSTEMD" -eq 1 ] || flags+=(-z)
  "${MOONRAKER_DIR}/scripts/install-moonraker.sh" "${flags[@]}"
}

install_mainsail() {
  say "Mainsail (Web-Oberflaeche)"
  local tmp site="/etc/nginx/sites-available/mainsail"

  tmp="$(mktemp -d)"
  curl -fsSL -o "${tmp}/mainsail.zip" "$MAINSAIL_ZIP_URL"
  mkdir -p "$MAINSAIL_DIR"
  unzip -q -o "${tmp}/mainsail.zip" -d "$MAINSAIL_DIR"
  rm -rf "$tmp"
  ok "Mainsail nach ${MAINSAIL_DIR} entpackt"

  if [ -d "${MAINSAIL_CFG_DIR}/.git" ]; then
    ok "mainsail-config vorhanden - wird nicht neu geklont"
  else
    git clone https://github.com/mainsail-crew/mainsail-config.git "$MAINSAIL_CFG_DIR"
  fi
  ln -sfn "${MAINSAIL_CFG_DIR}/mainsail.cfg" "${DATA_DIR}/config/mainsail.cfg"

  # Update-Eintraege in moonraker.conf (wie KIAUH)
  local mc="${DATA_DIR}/config/moonraker.conf"
  if ! grep -q '^\[update_manager mainsail\]' "$mc"; then
    cat >> "$mc" <<EOF

[update_manager mainsail]
type: web
channel: stable
repo: mainsail-crew/mainsail
path: ~/mainsail
EOF
  fi
  if ! grep -q '^\[update_manager mainsail-config\]' "$mc"; then
    { printf '\n'; cat "${MAINSAIL_CFG_DIR}/mainsail-moonraker-update.conf"; } >> "$mc"
  fi

  # nginx muss das Home-Verzeichnis durchlaufen duerfen
  chmod o+x "$HOME"

  if [ ! -e /etc/nginx/conf.d/upstreams.conf ]; then
    sudo tee /etc/nginx/conf.d/upstreams.conf >/dev/null <<'NGINX'
upstream apiserver {
    ip_hash;
    server 127.0.0.1:7125;
}

upstream mjpgstreamer1 {
    ip_hash;
    server 127.0.0.1:8080;
}

upstream mjpgstreamer2 {
    ip_hash;
    server 127.0.0.1:8081;
}

upstream mjpgstreamer3 {
    ip_hash;
    server 127.0.0.1:8082;
}

upstream mjpgstreamer4 {
    ip_hash;
    server 127.0.0.1:8083;
}
NGINX
  fi
  if [ ! -e /etc/nginx/conf.d/common_vars.conf ]; then
    sudo tee /etc/nginx/conf.d/common_vars.conf >/dev/null <<'NGINX'
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}
NGINX
  fi

  sed -e "s|__PORT__|${PORT}|g" -e "s|__ROOT__|${MAINSAIL_DIR}|g" <<'NGINX' | sudo tee "$site" >/dev/null
server {
    listen __PORT__;

    access_log /var/log/nginx/mainsail-access.log;
    error_log /var/log/nginx/mainsail-error.log;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_proxied expired no-cache no-store private auth;
    gzip_comp_level 4;
    gzip_buffers 16 8k;
    gzip_http_version 1.1;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/x-javascript application/json application/xml;

    root __ROOT__;

    index index.html;
    server_name _;

    client_max_body_size 0;
    proxy_request_buffering off;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    location /websocket {
        proxy_pass http://apiserver/websocket;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }

    location ~ ^/(printer|api|access|machine|server)/ {
        proxy_pass http://apiserver$request_uri;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Scheme $scheme;
    }

    location /webcam/ {
        postpone_output 0;
        proxy_buffering off;
        proxy_ignore_headers X-Accel-Buffering;
        access_log off;
        error_log off;
        proxy_pass http://mjpgstreamer1/;
    }
}
NGINX

  # Die Standard-Seite von nginx wuerde sonst auf Port 80 vorgehen.
  if [ -L /etc/nginx/sites-enabled/default ] && [ "$PORT" = "80" ]; then
    sudo rm -f /etc/nginx/sites-enabled/default
  fi
  sudo ln -sfn "$site" /etc/nginx/sites-enabled/mainsail
  if ! sudo nginx -t; then
    sudo rm -f /etc/nginx/sites-enabled/mainsail
    die "nginx-Konfiguration fehlerhaft - Mainsail-Seite wurde wieder entfernt."
  fi
  if [ "$HAVE_SYSTEMD" -eq 1 ]; then
    sudo systemctl enable nginx
    sudo systemctl restart nginx
  fi
  ok "nginx liefert Mainsail auf Port ${PORT} aus"
}

setup_touch() {
  say "Touchscreen (BTT HDMI5 V1.1)"
  info "Laut Hersteller braucht der HDMI5 keinen eigenen Treiber: er meldet sich per USB"
  info "als normales USB-HID-Touchgeraet (Kernel: usbhid + hid_multitouch). Ob der Touch am"
  info "Type-C-Port oder am USB-Header haengt, steht im Handbuch - pruefen mit 'lsusb' und"
  info "'libinput list-devices'. Eingebunden wird er ueber libinput (Pakete oben installiert)."
  local m
  for m in usbhid hid_multitouch; do
    if have_kmod "$m"; then
      sudo modprobe -q "$m" 2>/dev/null || true
      ok "Kernel-Treiber ${m} vorhanden"
    else
      warn "Kernelmodul ${m} fehlt im Kernel dieses Images - dann hilft nur ein Image-/Kernel-Update."
    fi
  done
}

start_services() {
  say "Dienste starten"
  if [ "$HAVE_SYSTEMD" -ne 1 ]; then
    warn "systemd laeuft hier nicht - Dienste wurden nicht aktiviert."
    return
  fi
  sudo systemctl daemon-reload
  sudo systemctl enable klipper
  sudo systemctl restart klipper
  sudo systemctl restart moonraker
  sleep 3
  local s
  for s in klipper moonraker nginx; do
    if systemctl is-active --quiet "$s"; then ok "${s} laeuft"; else warn "${s} laeuft nicht - 'journalctl -u ${s} -n 30' zeigt den Grund."; fi
  done
}

print_summary() {
  local ip host url
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  host="$(hostname 2>/dev/null || true)"
  url="http://${ip:-<IP-des-UNO-Q>}"
  [ "$PORT" = "80" ] || url="${url}:${PORT}"
  say "Fertig"
  cat <<EOF
  Mainsail:     ${url}
                (oder http://${host}.local$([ "$PORT" = "80" ] || printf ':%s' "$PORT"))
  Konfiguration: ${DATA_DIR}/config/   (printer.cfg, moonraker.conf)
  Protokoll:     ${LOG_FILE}

  Naechste Schritte fuer den Test mit der Manta M8P V2.0:
   1. Ohne CM4 ist der MCU der M8P per USB NICHT erreichbar (USB-C und Hub enden
      im CM4-Sockel). Weg ueber UART: 3,3-V-USB-UART-Adapter am TFT-Header
      Adapter-GND -> GND | Adapter-TX -> PA10 | Adapter-RX -> PA9 | kein 5 V!
      (Wenn nichts verbindet: TX/RX tauschen - das richtet keinen Schaden an.)
   2. Firmware bauen:   bash $(basename "$0") firmware uart
      -> ${FW_DIR}/uart/firmware.bin auf die microSD im MCU-CARD-Slot der M8P
         kopieren (nicht der SOC-Slot), Board aus- und einschalten.
   3. Adapter ins Dock stecken, 'ls -l /dev/serial/by-id/' ausfuehren und den
      Namen in printer.cfg unter [mcu] eintragen, dann in Mainsail
      "FIRMWARE_RESTART" druecken.
   4. Gruppenrechte (dialout) gelten nach einmaligem Ab- und Anmelden bzw.
      Neustart in der eigenen Shell; die Dienste sind davon nicht betroffen.
EOF
}

do_install() {
  preflight
  if [ "$PROBLEMS" -gt 0 ] && [ "$FORCE" -ne 1 ]; then
    die "Die Systempruefung hat Probleme gefunden. Erst beheben oder mit --force fortfahren."
  fi
  say "Geplant: Klipper + Moonraker + Mainsail (Port ${PORT}) in ${HOME}"
  confirm "Jetzt installieren?" || die "Abgebrochen."
  sudo_keepalive
  install_packages
  install_klipper
  write_printer_cfg
  install_moonraker
  install_mainsail
  setup_touch
  start_services
  sudo apt-get clean   # heruntergeladene .deb-Dateien wieder freigeben (liegen auf /)
  print_summary
}

# ----------------------------------------------------------------- Firmware
build_firmware() {
  local mode="$1" extra desc cfg out
  [ -d "${KLIPPER_DIR}/.git" ] || die "Klipper fehlt - erst 'install' ausfuehren."
  command -v arm-none-eabi-gcc >/dev/null 2>&1 || die "ARM-Compiler fehlt - erst 'install' ausfuehren."
  case "$mode" in
    uart)
      extra=$'CONFIG_STM32_SERIAL_USART1=y\nCONFIG_SERIAL_BAUD=250000'
      desc="Serial USART1 PA10/PA9, 250000 Baud (TFT-Header, externer Host ueber USB-UART-Adapter)" ;;
    usb)
      extra='CONFIG_STM32_USB_PA11_PA12=y'
      desc="USB PA11/PA12 (Betrieb mit CM4 auf dem Board)" ;;
    *) die "Bitte 'uart' oder 'usb' angeben:  bash $(basename "$0") firmware uart" ;;
  esac
  say "MCU-Firmware fuer die M8P V2.0: ${desc}"
  cfg=".config-m8p-${mode}"
  out="out-m8p-${mode}/"
  (
    cd "$KLIPPER_DIR"
    cat > "$cfg" <<EOF
CONFIG_LOW_LEVEL_OPTIONS=y
CONFIG_MACH_STM32=y
CONFIG_MACH_STM32H723=y
CONFIG_STM32_FLASH_START_20000=y
CONFIG_STM32_CLOCK_REF_25M=y
${extra}
EOF
    make KCONFIG_CONFIG="$cfg" OUT="$out" olddefconfig
    make KCONFIG_CONFIG="$cfg" OUT="$out" -j"$(nproc)"
  )
  mkdir -p "${FW_DIR}/${mode}"
  cp "${KLIPPER_DIR}/${out}klipper.bin" "${FW_DIR}/${mode}/firmware.bin"
  ok "Fertig: ${FW_DIR}/${mode}/firmware.bin ($(stat -c %s "${FW_DIR}/${mode}/firmware.bin") Bytes)"
  cat <<EOF

  Einstellungen: STM32H723, 128-KiB-Bootloader, 25-MHz-Quarz, ${desc}
  Auf den Rechner holen (am Mac):
    scp ${USER_NAME}@$(hostname).local:${FW_DIR}/${mode}/firmware.bin ~/Downloads/
  Aufspielen: Datei "firmware.bin" in das Hauptverzeichnis einer microSD kopieren,
  in den MCU-CARD-Slot der M8P (nicht SOC) stecken, Board aus-/einschalten. Nach
  erfolgreichem Update heisst die Datei auf der Karte FIRMWARE.CUR.
  Hinweis: Die Firmware passt zum Verbindungsweg. Fuer den spaeteren Betrieb mit
  dem CM4 wieder die Variante 'usb' bauen und aufspielen.
EOF
}

# ------------------------------------------------------------------- Status
show_status() {
  say "Dienste"
  local s
  for s in klipper moonraker nginx; do
    if systemctl is-active --quiet "$s" 2>/dev/null; then ok "${s} laeuft"; else warn "${s} laeuft nicht"; fi
  done
  if port_in_use "$PORT"; then ok "Port ${PORT} (Mainsail) lauscht"; else warn "Port ${PORT} lauscht nicht"; fi
  if port_in_use 7125; then ok "Port 7125 (Moonraker) lauscht"; else warn "Port 7125 lauscht nicht"; fi
  if curl -fsS -m 4 http://127.0.0.1:7125/printer/info 2>/dev/null; then printf '\n'; else info "Moonraker antwortet nicht auf /printer/info."; fi
  if [ -r "${DATA_DIR}/logs/klippy.log" ]; then
    info "Letzte Zeilen aus klippy.log:"
    tail -n 6 "${DATA_DIR}/logs/klippy.log" | sed 's/^/      /'
  fi
  check_usb_touch
}

# --------------------------------------------------------------------- Start
while [ $# -gt 0 ]; do
  case "$1" in
    check|install|status) CMD="$1" ;;
    firmware) CMD="firmware"; shift; FW_MODE="${1:-}" ;;
    --port) shift; PORT="${1:-}" ;;
    -y|--yes) ASSUME_YES=1 ;;
    --force) FORCE=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; die "Unbekannte Eingabe: $1" ;;
  esac
  shift
done
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || die "Ungueltiger Port: ${PORT}"

if [ -z "$CMD" ]; then
  CMD="check"
  info "Kein Befehl angegeben - es wird nur geprueft. Zum Installieren: bash $(basename "$0") install"
fi

case "$CMD" in
  install|firmware) exec > >(tee -a "$LOG_FILE") 2>&1 ;;
esac

case "$CMD" in
  check)    preflight ;;
  install)  do_install ;;
  firmware) build_firmware "$FW_MODE" ;;
  status)   show_status ;;
esac
