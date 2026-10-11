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
#             --slim-newlib  die ARM-C-Bibliothek immer schlank installieren (spart ~360 MB auf /;
#                            sonst automatisch, wenn der Platz auf / knapp ist)
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
MIN_FREE_ROOT_MB=1700  # Rueckfall (entpackt) fuer die Root-Partition, wenn der apt-Bedarf nicht berechenbar ist
ROOT_MARGIN_MB=150     # Reserve auf / fuer Moonrakers eigene apt-Pakete (~35 MB), Protokolle usw.

# libnewlib-arm-none-eabi (C-Bibliothek fuer den ARM-Compiler) ist mit ~406 MB entpackt der groesste
# Brocken, weil es die Bibliothek fuer rund 50 ARM-Varianten enthaelt. Klipper braucht davon nur vier
# (alle ohne FPU): v6-m = Cortex-M0/M0+ (STM32F0/G0, RP2040, SAMD21), v7-m = M3 (STM32F1/F2, LPC176x),
# v7e-m = M4/M7 (STM32F4/G4/H7, SAMD51), v8-m.main = M33 (RP2350). Ist der Platz auf / knapp, wird das
# Paket deshalb schlank entpackt (~43 MB) - per dpkg-Filter, der auch spaetere Updates schlank haelt.
NEWLIB_PKG=libnewlib-arm-none-eabi
NEWLIB_DIR=/usr/lib/arm-none-eabi/newlib
NEWLIB_FULL_MB=406     # Rueckfall: entpackte Groesse des vollstaendigen Pakets (Debian 13)
NEWLIB_SLIM_MB=45      # entpackt mit nur den Varianten unten (gemessen: 43 MB)
NEWLIB_SLIM_CONF=/etc/dpkg/dpkg.cfg.d/90-klipper-slim-newlib
NEWLIB_KEEP=(thumb/v6-m/nofp thumb/v7-m/nofp thumb/v7e-m/nofp thumb/v8-m.main/nofp)
FORCE_SLIM=0           # 1 = immer schlank installieren (--slim-newlib)
USE_SLIM=0             # setzt check_root_space
PLAN_INSTALL_MB=0; PLAN_DOWNLOAD_MB=0; PLAN_NEWLIB_MB=0   # setzt apt_plan

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

usage() { sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; }

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
  # Ausgabe nach /dev/null: sonst haelt das verwaiste "sleep" die Protokoll-Leitung (tee) bis zu
  # 50 s offen und die letzten Zeilen erscheinen erst nach dem Shell-Prompt.
  ( while true; do sleep 50; sudo -n true 2>/dev/null || exit 0; done ) >/dev/null 2>&1 &
  SUDO_KEEP_PID=$!
  trap 'kill "${SUDO_KEEP_PID}" 2>/dev/null || true' EXIT
}

# ------------------------------------------------- Platz auf der Root-Partition
# apt schreibt nach /usr und /var. Auf dem UNO Q liegt "/" auf einer anderen (kleineren)
# Partition als /home/arduino - der freie Platz im Home-Verzeichnis sagt dazu nichts.
# Bedarf der noch fehlenden Pakete. "apt-get -s" nennt auf Debian 13 keine Groessen, nur Zeilen
# "Inst <paket> (<version> ...)"; Download- und entpackte Groesse kommen aus "apt-cache show".
# Setzt PLAN_INSTALL_MB (entpackt), PLAN_DOWNLOAD_MB und PLAN_NEWLIB_MB (Anteil von
# libnewlib-arm-none-eabi an PLAN_INSTALL_MB, 0 wenn es schon installiert ist), alles in MiB.
# Rueckgabe 1: nicht berechenbar (z. B. apt-Paketlisten fehlen).
apt_plan() {
  local sim recs
  local -a list
  PLAN_INSTALL_MB=0; PLAN_DOWNLOAD_MB=0; PLAN_NEWLIB_MB=0
  sim="$(LC_ALL=C apt-get -s install --no-install-recommends "${APT_PKGS[@]}" 2>&1 || true)"
  if grep -q '^E:' <<<"$sim"; then return 1; fi
  # neu:      Inst paket (1.2-3 Debian:13.1/stable [arm64])
  # Update:   Inst paket [1.2-2] (1.2-3 Debian-Security:13/stable-security [arm64])
  mapfile -t list < <(sed -nE 's/^Inst ([^ ]+) (\[[^]]*\] )?\(([^ ]+) .*/\1=\3/p' <<<"$sim")
  if [ "${#list[@]}" -eq 0 ]; then return 0; fi   # alles schon installiert
  recs="$(LC_ALL=C apt-cache show "${list[@]}" 2>/dev/null || true)"
  if [ -z "$recs" ]; then return 1; fi
  # Pro Paket nur der erste Eintrag (dieselbe Version kann aus mehreren Quellen stammen).
  read -r PLAN_INSTALL_MB PLAN_DOWNLOAD_MB PLAN_NEWLIB_MB < <(awk -v nl="$NEWLIB_PKG" '
    /^Package: /                 { p = $2; seen = (p in S) }
    /^Installed-Size: / && !seen { I += $2; if (p == nl) N = $2 }
    /^Size: /           && !seen { D += $2; S[p] = 1 }
    END { printf "%d %d %d\n", I / 1024 + 0.5, D / 1048576 + 0.5, N / 1024 + 0.5 }' <<<"$recs")
}

# Gibt es Pakete mit unfertigem Zustand (halb installiert H, entpackt U, halb konfiguriert F,
# Trigger offen W/t)? "dpkg --audit" taugt dafuer nicht: ohne root bricht es auf Debian 13 mit
# "unable to check lock file" ab. "dpkg-query" liest die Datenbank auch als normaler Benutzer.
dpkg_unfinished() {
  dpkg-query -W -f='${db:Status-Abbrev}\n' 2>/dev/null | awk '/^.[HUFWt]/ { f = 1 } END { exit (f ? 0 : 1) }'
}

# Prueft den Platz auf "/" und entscheidet, ob libnewlib-arm-none-eabi schlank installiert werden
# muss (USE_SLIM=1). Meldet bad(), wenn auch das nicht reicht.
check_root_space() {
  local free_mb full slim need src
  USE_SLIM=0
  free_mb="$(df -Pm / | awk 'NR==2 {print $4}')"
  if dpkg_unfinished; then
    warn "dpkg meldet eine abgebrochene Paketinstallation - 'install' repariert das und prueft den Platz auf / danach erneut."
    return 0
  fi
  if apt_plan; then
    src="berechnet mit apt"
  else
    PLAN_INSTALL_MB="$MIN_FREE_ROOT_MB"; PLAN_DOWNLOAD_MB=0; PLAN_NEWLIB_MB="$NEWLIB_FULL_MB"
    src="Schaetzwert - apt-Paketlisten nicht lesbar"
  fi
  full=$((PLAN_INSTALL_MB + PLAN_DOWNLOAD_MB + ROOT_MARGIN_MB))
  slim=$((full - PLAN_NEWLIB_MB + NEWLIB_SLIM_MB))
  info "Root-Partition (/): ${free_mb} MB frei; apt braucht ${PLAN_INSTALL_MB} MB entpackt + ${PLAN_DOWNLOAD_MB} MB Download + ${ROOT_MARGIN_MB} MB Reserve = ${full} MB (${src})"

  if [ "${free_mb:-0}" -ge "$full" ] && { [ "$FORCE_SLIM" -eq 0 ] || [ "$PLAN_NEWLIB_MB" -eq 0 ]; }; then
    ok "Platz auf der Root-Partition (/) reicht"
    return 0
  fi
  if [ "$PLAN_NEWLIB_MB" -gt 0 ] && { [ "$FORCE_SLIM" -eq 1 ] || [ "${free_mb:-0}" -ge "$slim" ]; }; then
    USE_SLIM=1
    if [ "$FORCE_SLIM" -eq 1 ]; then
      ok "libnewlib-arm-none-eabi wird schlank installiert (--slim-newlib): nur die ARM-Varianten, die Klipper braucht (~${NEWLIB_SLIM_MB} statt ~${PLAN_NEWLIB_MB} MB)"
    else
      warn "Platz auf / ist knapp (${free_mb} MB frei, volle Installation braeuchte ${full} MB). libnewlib-arm-none-eabi wird deshalb schlank installiert: nur die ARM-Varianten, die Klipper braucht (~${NEWLIB_SLIM_MB} statt ~${PLAN_NEWLIB_MB} MB), Bedarf dann ${slim} MB. Rueckgaengig: sudo rm ${NEWLIB_SLIM_CONF}; sudo apt-get install --reinstall ${NEWLIB_PKG}"
    fi
    return 0
  fi
  need="$full"
  if [ "$PLAN_NEWLIB_MB" -gt 0 ]; then need="$slim"; fi
  bad "Zu wenig Platz auf der Root-Partition (/): ${free_mb} MB frei, benoetigt ca. ${need} MB (apt installiert nach /usr und /var, nicht nach ${HOME}). Platz schaffen z. B. mit: sudo apt-get clean; sudo apt-get autoremove; sudo journalctl --vacuum-size=50M  (Docker-Daten nur nach eigener Pruefung: docker system df)"
}

# dpkg-Filter: von libnewlib-arm-none-eabi nur die Varianten aus NEWLIB_KEEP entpacken. Die
# Elternordner muessen einzeln wieder eingeschlossen werden, sonst legt dpkg sie nicht an.
write_slim_filter() {
  local k
  info "Schlanke newlib: dpkg-Filter ${NEWLIB_SLIM_CONF}"
  {
    printf '%s\n' \
      "# Angelegt von install-klipper-unoq.sh: ${NEWLIB_PKG} nur mit den ARM-Varianten entpacken, die Klipper" \
      "# braucht (Cortex-M0/M0+/M3/M4/M7/M33, ohne FPU). Rueckgaengig machen: diese Datei loeschen und" \
      "# 'sudo apt-get install --reinstall ${NEWLIB_PKG}' ausfuehren." \
      "path-exclude=${NEWLIB_DIR}/*" \
      "path-include=${NEWLIB_DIR}/thumb"
    for k in "${NEWLIB_KEEP[@]}"; do
      printf '%s\n' "path-include=${NEWLIB_DIR}/${k%/*}" "path-include=${NEWLIB_DIR}/${k}*"
    done
  } | sudo tee "$NEWLIB_SLIM_CONF" >/dev/null
}

# Gibt es fuer den H723 (Cortex-M7) die C-Bibliothek, die der Linker sucht (-lc_nano)?
check_toolchain() {
  local lib
  lib="$(arm-none-eabi-gcc -mthumb -mcpu=cortex-m7 -print-file-name=libc_nano.a 2>/dev/null || true)"
  case "$lib" in
    /*) if [ -f "$lib" ]; then ok "ARM-Toolchain vollstaendig (libc_nano fuer Cortex-M7 vorhanden)"; return 0; fi ;;
  esac
  die "ARM-Toolchain unvollstaendig: libc_nano fuer Cortex-M7 fehlt (${lib:-nicht gefunden}). Der Firmware-Build wuerde mit 'cannot find -lc_nano' scheitern. Reparieren: sudo apt-get install --reinstall ${NEWLIB_PKG}"
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
  if [ "$USE_SLIM" -eq 1 ]; then write_slim_filter; fi
  sudo DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 install -y --no-install-recommends "${APT_PKGS[@]}"
  check_toolchain
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

# Adresse, unter der das Board im Netz erreichbar ist: die der Standardroute. "hostname -I" waere
# falsch - es nennt zuerst die Docker-Bruecken (172.17.0.1 ...), die auf dem UNO Q vorhanden sind.
primary_ip() {
  local addr
  addr="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}' || true)"
  if [ -z "$addr" ]; then addr="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"; fi
  printf '%s' "$addr"
}

print_summary() {
  local ip host url
  ip="$(primary_ip)"
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
  if [ -e "$NEWLIB_SLIM_CONF" ]; then
    cat <<EOF

  Hinweis: ${NEWLIB_PKG} ist schlank installiert (nur ARM-Varianten ohne FPU, die Klipper
  braucht: Cortex-M0/M0+/M3/M4/M7/M33). Reicht das fuer ein spaeteres Projekt nicht aus
  (Fehler "cannot find -lc_nano" beim Firmware-Bau), vollstaendig nachinstallieren, wenn
  auf / mindestens ~450 MB frei sind:
    sudo rm ${NEWLIB_SLIM_CONF}; sudo apt-get install --reinstall ${NEWLIB_PKG}
EOF
  fi
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
    --slim-newlib) FORCE_SLIM=1 ;;
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
