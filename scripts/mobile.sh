#!/usr/bin/env bash
#
# mobile.sh: ciclo de la app movil de TallaYa (Capacitor, Android) en un telefono fisico.
#
#   TallaYa   cu.tallaya.app   frontend/ (web React + Vite) + frontend/android/ (Capacitor)
#
# Uso:
#   ./scripts/mobile.sh doctor                    # comprueba el entorno completo
#   ./scripts/mobile.sh devices                   # dispositivos conectados por adb
#   ./scripts/mobile.sh use-api <prod|local|URL|none>  # servidor que la app propone al conectar
#   ./scripts/mobile.sh dev [--device SERIAL]     # build movil debug, instala y abre la app
#   ./scripts/mobile.sh live [--device SERIAL]    # recarga en caliente (Vite + cap run --live-reload)
#   ./scripts/mobile.sh logs [--device SERIAL]    # logcat filtrado por la app
#   ./scripts/mobile.sh screenshot [salida.png]
#   ./scripts/mobile.sh keystore                  # crea el keystore de firma (1a vez)
#   ./scripts/mobile.sh version [patch|minor|major|X.Y.Z]
#   ./scripts/mobile.sh build [apk|aab|all]       # release firmado (default apk)
#   ./scripts/mobile.sh install [--device SERIAL] # instala el ultimo APK release
#   ./scripts/mobile.sh ship [--device SERIAL]    # build apk release + install
#   ./scripts/mobile.sh check                     # tests + chequeos de idiomas (sin build)
#   ./scripts/mobile.sh list | uninstall | clean
#
# Servidor: la app funciona sola, sin servidor. `use-api` solo rellena la direccion en
# «Conectar a un servidor» (VITE_DEFAULT_SERVER en frontend/.env.local, que no se commitea).
#
# Firma: el keystore vive FUERA del repo (~/.tallaya/keystores) y no se commitea.
# Su huella identifica la app: si cambia, Android no deja actualizar encima.
#
# Animaciones: el build movil copia solo las de 180 px del catalogo (licencia de Gym visual).
# TallaYa necesita su propia licencia antes de publicar la app (docs/marca/nombre-tallaya.md).
#
set -euo pipefail

# --- Rutas -------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO/frontend"
ANDROID_DIR="$APP_DIR/android"
RELEASE_DIR="$APP_DIR/release"
ENV_LOCAL="$APP_DIR/.env.local"

APP_NAME="TallaYa"
APP_ID="cu.tallaya.app"
PROD_URL="${TALLAYA_PROD_URL:-https://tallaya.qvaarbi.com}"

KEYSTORE_DIR="${TALLAYA_KEYSTORE_DIR:-$HOME/.tallaya/keystores}"
KEYSTORE="$KEYSTORE_DIR/tallaya-release.keystore"
KEYSTORE_ENV="$KEYSTORE_DIR/tallaya-release.env"   # alias + contrasenas (chmod 600)
KEY_ALIAS="tallaya"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
ADB="$ANDROID_HOME/platform-tools/adb"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

DEVICE="${TALLAYA_DEVICE:-}"

# --- Colores -----------------------------------------------------------------
c_ok=$'\e[32m'; c_err=$'\e[31m'; c_info=$'\e[36m'; c_warn=$'\e[33m'; c_dim=$'\e[2m'; c_off=$'\e[0m'
log()  { echo "${c_info}▶${c_off} $*"; }
ok()   { echo "${c_ok}✓${c_off} $*"; }
err()  { echo "${c_err}✗${c_off} $*" >&2; }
warn() { echo "${c_warn}!${c_off} $*"; }
dim()  { echo "${c_dim}  $*${c_off}"; }

need() { command -v "$1" >/dev/null 2>&1 || { err "Falta '$1' en el PATH"; return 1; }; }

REST_ARGS=()
parse_device_flag() {
  REST_ARGS=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --device|-d) DEVICE="${2:-}"; shift 2 ;;
      *) REST_ARGS+=("$1"); shift ;;
    esac
  done
}

adb_() { if [[ -n "$DEVICE" ]]; then "$ADB" -s "$DEVICE" "$@"; else "$ADB" "$@"; fi; }

require_device() {
  [[ -x "$ADB" ]] || { err "No encuentro adb en $ADB (¿ANDROID_HOME?)"; exit 1; }
  local n
  n=$("$ADB" devices | awk 'NR>1 && $2=="device"' | wc -l)
  if [[ -z "$DEVICE" && "$n" -gt 1 ]]; then err "Hay $n dispositivos: elige uno con --device SERIAL"; "$ADB" devices; exit 1; fi
  if [[ "$n" -eq 0 ]]; then err "No hay ningun telefono conectado (activa la depuracion USB)"; exit 1; fi
}

gradle() { (cd "$ANDROID_DIR" && ./gradlew --no-daemon "$@"); }

app_version() { node -p "require('$APP_DIR/package.json').version"; }

# --- Comandos ----------------------------------------------------------------
cmd_doctor() {
  local bad=0
  log "Entorno de TallaYa movil"
  for c in node npm java; do
    if command -v "$c" >/dev/null 2>&1; then ok "$c $("$c" --version 2>&1 | head -1)"; else err "Falta $c"; bad=1; fi
  done
  local nv; nv=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
  [[ "$nv" -ge 22 ]] && ok "Node $nv (CI y Docker usan 22)" || { warn "Node $nv: usa Node 22"; }
  if java -version 2>&1 | grep -qE 'version "(1[7-9]|2[0-9])'; then ok "JDK 17 o superior"; else err "Android necesita JDK 17+"; bad=1; fi
  [[ -d "$ANDROID_HOME" ]] && ok "ANDROID_HOME=$ANDROID_HOME" || { err "No existe ANDROID_HOME ($ANDROID_HOME)"; bad=1; }
  [[ -x "$ADB" ]] && ok "adb $("$ADB" version | head -1 | awk '{print $NF}')" || { err "Falta adb (platform-tools)"; bad=1; }
  [[ -d "$APP_DIR/node_modules" ]] && ok "frontend/node_modules" || warn "Sin dependencias: cd frontend && npm ci"
  if [[ -x "$ADB" ]]; then
    local n; n=$("$ADB" devices | awk 'NR>1 && $2=="device"' | wc -l)
    [[ "$n" -gt 0 ]] && ok "$n telefono(s) conectado(s)" || warn "Ningun telefono conectado"
  fi
  if [[ -f "$ENV_LOCAL" ]] && grep -q '^VITE_DEFAULT_SERVER=' "$ENV_LOCAL"; then
    ok "Servidor propuesto: $(sed -n 's/^VITE_DEFAULT_SERVER=//p' "$ENV_LOCAL")"
  else
    dim "Sin servidor propuesto (la app arranca sola). ./scripts/mobile.sh use-api prod"
  fi
  if curl -fsS --max-time 8 "$PROD_URL/api/health" >/dev/null 2>&1; then ok "Produccion responde: $PROD_URL"; else warn "Produccion no responde: $PROD_URL"; fi
  [[ -f "$KEYSTORE" ]] && ok "Keystore: $KEYSTORE" || dim "Sin keystore de release (./scripts/mobile.sh keystore)"
  return $bad
}

cmd_devices() { "$ADB" devices -l; }

cmd_use_api() {
  local target="${1:-}" url
  case "$target" in
    prod) url="$PROD_URL" ;;
    local) url="http://10.0.2.2:8080"; dim "10.0.2.2 es el host visto desde el emulador; en un telefono usa la IP de tu PC" ;;
    none) url="" ;;
    http://*|https://*) url="${target%/}" ;;
    *) err "Uso: use-api <prod|local|URL|none>"; exit 2 ;;
  esac
  touch "$ENV_LOCAL"
  grep -v '^VITE_DEFAULT_SERVER=' "$ENV_LOCAL" > "$ENV_LOCAL.tmp" || true
  [[ -n "$url" ]] && echo "VITE_DEFAULT_SERVER=$url" >> "$ENV_LOCAL.tmp"
  mv "$ENV_LOCAL.tmp" "$ENV_LOCAL"
  ok "Servidor propuesto: ${url:-ninguno}. Vuelve a compilar (dev / build) para que lo tome."
}

build_mobile() {
  log "Build movil (VITE_MOBILE=1, 180 px, cap sync)"
  (cd "$APP_DIR" && npm run build:mobile)
}

cmd_dev() {
  parse_device_flag "$@"
  require_device
  build_mobile
  log "Instalando debug en el telefono"
  gradle installSideloadDebug
  adb_ shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null
  ok "$APP_NAME abierta en el telefono"
}

cmd_live() {
  parse_device_flag "$@"
  require_device
  local ip; ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  [[ -n "$ip" ]] || { err "No encuentro la IP de este equipo"; exit 1; }
  log "Recarga en caliente desde http://$ip:5173"
  (cd "$APP_DIR" && VITE_MOBILE=1 npx vite --host 0.0.0.0 --port 5173) &
  local vite=$!
  trap 'kill $vite 2>/dev/null' EXIT
  (cd "$APP_DIR" && npx cap run android --live-reload --host "$ip" --port 5173 ${DEVICE:+--target "$DEVICE"})
  wait $vite
}

cmd_logs() {
  parse_device_flag "$@"
  require_device
  local pid; pid=$(adb_ shell pidof -s "$APP_ID" | tr -d '\r' || true)
  if [[ -n "$pid" ]]; then adb_ logcat --pid="$pid"; else warn "La app no esta abierta: muestro Capacitor y Chromium"; adb_ logcat -s Capacitor:* chromium:* "Capacitor/Console":*; fi
}

cmd_screenshot() {
  require_device
  local out="${1:-tallaya-$(date +%Y%m%d-%H%M%S).png}"
  adb_ exec-out screencap -p > "$out"
  ok "Captura: $out"
}

cmd_keystore() {
  need keytool
  if [[ -f "$KEYSTORE" ]]; then warn "Ya existe $KEYSTORE: no lo sobrescribo (cambiarlo impide actualizar la app)"; return; fi
  mkdir -p "$KEYSTORE_DIR"; chmod 700 "$KEYSTORE_DIR"
  local pass; pass=$(openssl rand -base64 30 | tr -d '/+=' | cut -c1-32)
  keytool -genkeypair -v -keystore "$KEYSTORE" -alias "$KEY_ALIAS" -keyalg RSA -keysize 4096 -validity 10000 \
    -storepass "$pass" -keypass "$pass" -dname "CN=TallaYa, O=TallaYa, C=CU"
  printf 'TALLAYA_KEY_ALIAS=%s\nTALLAYA_KEYSTORE_PASSWORD=%s\n' "$KEY_ALIAS" "$pass" > "$KEYSTORE_ENV"
  chmod 600 "$KEYSTORE" "$KEYSTORE_ENV"
  ok "Keystore creado en $KEYSTORE"
  warn "Haz copia de $KEYSTORE_DIR fuera de esta maquina: sin el, no podras actualizar la app."
}

cmd_version() {
  local bump="${1:-patch}" cur new code
  cur=$(app_version)
  if [[ "$bump" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then new="$bump"
  else
    IFS=. read -r a b c <<<"$cur"
    case "$bump" in major) new="$((a+1)).0.0" ;; minor) new="$a.$((b+1)).0" ;; patch) new="$a.$b.$((c+1))" ;; *) err "Uso: version [patch|minor|major|X.Y.Z]"; exit 2 ;; esac
  fi
  code=$(sed -n 's/.*versionCode \([0-9]*\).*/\1/p' "$ANDROID_DIR/app/build.gradle")
  (cd "$APP_DIR" && npm version "$new" --no-git-tag-version >/dev/null)
  sed -i "s/versionName \"[^\"]*\"/versionName \"$new\"/; s/versionCode $code/versionCode $((code+1))/" "$ANDROID_DIR/app/build.gradle"
  ok "Version $cur -> $new (versionCode $((code+1)))"
}

sign_apk() {
  local unsigned="$1" out="$2"
  [[ -f "$KEYSTORE" && -f "$KEYSTORE_ENV" ]] || { err "Falta el keystore: ./scripts/mobile.sh keystore"; exit 1; }
  # shellcheck disable=SC1090
  source "$KEYSTORE_ENV"
  local bt; bt=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
  "$bt/zipalign" -f -p 4 "$unsigned" "$out.aligned"
  "$bt/apksigner" sign --ks "$KEYSTORE" --ks-key-alias "$TALLAYA_KEY_ALIAS" \
    --ks-pass "pass:$TALLAYA_KEYSTORE_PASSWORD" --key-pass "pass:$TALLAYA_KEYSTORE_PASSWORD" --out "$out" "$out.aligned"
  rm -f "$out.aligned"
  "$bt/apksigner" verify "$out" >/dev/null && ok "Firmado: $out"
}

cmd_build() {
  local kind="${1:-apk}" ver
  ver=$(app_version)
  mkdir -p "$RELEASE_DIR"
  build_mobile
  if [[ "$kind" == apk || "$kind" == all ]]; then
    gradle clean assembleSideloadRelease
    sign_apk "$ANDROID_DIR/app/build/outputs/apk/sideload/release/app-sideload-release-unsigned.apk" "$RELEASE_DIR/TallaYa-$ver.apk"
    (cd "$RELEASE_DIR" && sha256sum "TallaYa-$ver.apk" > "TallaYa-$ver.apk.sha256")
  fi
  if [[ "$kind" == aab || "$kind" == all ]]; then
    gradle bundlePlayRelease
    [[ -f "$KEYSTORE_ENV" ]] || { err "Falta el keystore"; exit 1; }
    # shellcheck disable=SC1090
    source "$KEYSTORE_ENV"
    cp "$ANDROID_DIR/app/build/outputs/bundle/playRelease/app-play-release.aab" "$RELEASE_DIR/TallaYa-$ver.aab"
    jarsigner -keystore "$KEYSTORE" -storepass "$TALLAYA_KEYSTORE_PASSWORD" "$RELEASE_DIR/TallaYa-$ver.aab" "$TALLAYA_KEY_ALIAS" >/dev/null
    ok "Bundle de Play: $RELEASE_DIR/TallaYa-$ver.aab"
  fi
}

latest_apk() { ls -t "$RELEASE_DIR"/TallaYa-*.apk 2>/dev/null | head -1; }

cmd_install() {
  parse_device_flag "$@"
  require_device
  local apk; apk=$(latest_apk)
  [[ -n "$apk" ]] || { err "No hay APK en $RELEASE_DIR (./scripts/mobile.sh build)"; exit 1; }
  adb_ install -r "$apk" && ok "Instalado $(basename "$apk")"
}

cmd_ship() { cmd_build apk; cmd_install "$@"; }

cmd_check() {
  log "Tests y chequeos (no compila: regla del repo)"
  (cd "$APP_DIR" && npx vitest run && node scripts/check-locales.mjs && node scripts/check-source-strings.mjs --strict)
}

cmd_list() { require_device; adb_ shell pm list packages | grep -i tallaya || warn "TallaYa no esta instalada"; }
cmd_uninstall() { require_device; adb_ uninstall "$APP_ID" && ok "Desinstalada"; }
cmd_clean() { gradle clean; rm -rf "$APP_DIR/dist"; ok "Limpio"; }

usage() { sed -n '3,30p' "$0" | sed 's/^# \{0,1\}//'; }

cmd="${1:-help}"; shift || true
case "$cmd" in
  doctor) cmd_doctor ;;
  devices) cmd_devices ;;
  use-api) cmd_use_api "$@" ;;
  dev|run) cmd_dev "$@" ;;
  live) cmd_live "$@" ;;
  logs) cmd_logs "$@" ;;
  screenshot) cmd_screenshot "$@" ;;
  keystore) cmd_keystore ;;
  version) cmd_version "$@" ;;
  build) cmd_build "$@" ;;
  install) cmd_install "$@" ;;
  ship) cmd_ship "$@" ;;
  check) cmd_check ;;
  list) cmd_list ;;
  uninstall) cmd_uninstall ;;
  clean) cmd_clean ;;
  help|-h|--help) usage ;;
  *) err "Comando desconocido: $cmd"; usage; exit 2 ;;
esac
