#!/usr/bin/env bash
#
# register.sh — get the Kiwi Podcast app registered with a local Kiwi.
#
# The registration order is strict (see KIWI_APP_DEVELOPER_GUIDE.md §4):
#
#     [admin] whitelist (approved)  ->  [dev] register  ->  [admin] enable in a class
#
# Steps 1 and 3 are admin-only, so you need an admin JWT. Step 2 is public but
# checks the whitelist + secret. This script runs whichever steps you have the
# inputs for and prints every response so you can see exactly what happened.
#
# Usage:
#     KIWI=http://localhost:3000 \
#     ADMIN_TOKEN=eyJ... \
#     KIWI_COOKIE='connect.sid=s%3A...' \
#     APP_URL=http://localhost:8000 \
#     CLASS_ID=<classId> \
#     ./register.sh
#
# Minimum to register (steps 1+2): ADMIN_TOKEN. Add CLASS_ID to also enable it.

set -euo pipefail

# ---- Config (override via env) ----
KIWI="${KIWI:-http://localhost:3000}"          # Kiwi backend base URL
SLUG="${SLUG:-kiwi-podcast}"                    # app id (must match the app's appSlug)
SECRET="${SECRET:-kiwi-podcast-local-dev-secret-0001}" # plaintext registration secret
APP_URL="${APP_URL:-http://localhost:8000}"     # where YOU serve the Vite web app
ADMIN_URL="${APP_URL%/}/admin"                  # global admin surface embedded by Kiwi
ADMIN_TOKEN="${ADMIN_TOKEN:-}"                  # admin JWT (for whitelist + enable)
KIWI_COOKIE="${KIWI_COOKIE:-}"                  # browser session cookie, e.g. connect.sid=s%3A...
CLASS_ID="${CLASS_ID:-}"                         # optional: enable the app in this class

SCOPES='["user:profile:read","class:info:read","class:enrollments:read","class:materials:chunks:read","podcast:manage"]'

COOKIE_ARGS=()
if [ -n "$KIWI_COOKIE" ]; then
  COOKIE_ARGS=(-H "Cookie: $KIWI_COOKIE")
fi

say()  { printf '\n\033[1;32m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }

# Pretty-print JSON if python3 is available, else passthrough.
pp() { if command -v python3 >/dev/null 2>&1; then python3 -m json.tool 2>/dev/null || cat; else cat; fi; }

# -----------------------------------------------------------------------------
say "1/3  Whitelist '$SLUG' (admin) — POST /api/kiwi-apps/whitelist"
if [ -z "$ADMIN_TOKEN" ]; then
  warn "ADMIN_TOKEN not set — skipping. An admin must whitelist '$SLUG' (status:approved) before you can register."
else
  curl -sS -X POST "$KIWI/api/kiwi-apps/whitelist" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "${COOKIE_ARGS[@]}" \
    -H "Content-Type: application/json" \
    -d "{
      \"slug\": \"$SLUG\",
      \"registrationSecret\": \"$SECRET\",
      \"baseUrl\": \"$APP_URL\",
      \"status\": \"approved\",
      \"description\": \"Kiwi Podcast external app\",
      \"maxScopes\": $SCOPES
    }" | pp || warn "whitelist create call failed (it may already exist — continuing with update)"

  say "1/3  Ensure '$SLUG' whitelist scopes — PATCH /api/kiwi-apps/whitelist/$SLUG"
  curl -sS -X PATCH "$KIWI/api/kiwi-apps/whitelist/$SLUG" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "${COOKIE_ARGS[@]}" \
    -H "Content-Type: application/json" \
    -d "{
      \"baseUrl\": \"$APP_URL\",
      \"registrationSecret\": \"$SECRET\",
      \"status\": \"approved\",
      \"description\": \"Kiwi Podcast external app\",
      \"maxScopes\": $SCOPES
    }" | pp || warn "whitelist update failed"
fi

# -----------------------------------------------------------------------------
say "2/3  Register '$SLUG' (public, idempotent) — POST /api/kiwi-apps/register"
if ! REG_RESPONSE=$(curl -sS --fail-with-body -X POST "$KIWI/api/kiwi-apps/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"slug\": \"$SLUG\",
    \"registrationSecret\": \"$SECRET\",
    \"name\": \"kiwi-podcast\",
    \"description\": \"External Kiwi App for podcast learning workflows\",
    \"baseUrl\": \"$APP_URL\",
    \"appType\": \"frontend_only\",
    \"capabilities\": [\"ai\", \"mcp\"],
    \"uis\": [
      {
        \"uiSlug\": \"student\",
        \"uiName\": \"kiwi-podcast\",
        \"uiUrl\": \"$APP_URL\",
        \"placement\": \"class-tab\",
        \"allowedRoles\": [\"student\", \"ta\", \"professor\", \"instructor\", \"admin\"],
        \"tabOrder\": 0
      },
      {
        \"uiSlug\": \"global-admin\",
        \"uiName\": \"Podcast Admin\",
        \"uiUrl\": \"$ADMIN_URL\",
        \"placement\": \"admin-panel\",
        \"allowedRoles\": [\"admin\"],
        \"tabOrder\": 0
      }
    ]
  }"); then
  echo "$REG_RESPONSE" | pp
  warn "App registration failed — verify the approved whitelist entry and registration secret."
  exit 1
fi
echo "$REG_RESPONSE" | pp

# Pull the registered app's id out of the response (needed to enable it in a class).
APP_ID=$(printf '%s' "$REG_RESPONSE" | python3 -c \
  'import sys,json; print(json.load(sys.stdin).get("id",""))' 2>/dev/null || true)

# -----------------------------------------------------------------------------
say "3/3  Enable in class (admin) — POST /api/classes/$CLASS_ID/apps"
if [ -z "$CLASS_ID" ]; then
  warn "CLASS_ID not set — skipping. Set CLASS_ID=<id> to enable '$SLUG' as a tab in that class."
elif [ -z "$ADMIN_TOKEN" ]; then
  warn "ADMIN_TOKEN not set — skipping the enable step."
elif [ -z "$APP_ID" ]; then
  warn "Could not read the app id from the register response — cannot enable. Check step 2 output."
else
  curl -sS -X POST "$KIWI/api/classes/$CLASS_ID/apps" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "${COOKIE_ARGS[@]}" \
    -H "Content-Type: application/json" \
    -d "{
      \"appId\": \"$APP_ID\",
      \"tabLabel\": \"Podcast\",
      \"enabledScopes\": $SCOPES
    }" | pp || warn "enable create call failed (it may already exist — continuing with update)"

  say "3/3  Ensure class scopes — PATCH /api/classes/$CLASS_ID/apps/$APP_ID"
  curl -sS -X PATCH "$KIWI/api/classes/$CLASS_ID/apps/$APP_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "${COOKIE_ARGS[@]}" \
    -H "Content-Type: application/json" \
    -d "{
      \"tabLabel\": \"Podcast\",
      \"isEnabled\": true,
      \"enabledScopes\": $SCOPES
    }" | pp || warn "class app scope update failed"
fi

say "Done."
echo "Next: make sure your app origin is allowed for CORS, then open the class."
echo "  • In kiwi/.env:  FRONTEND_URL=\"http://localhost:3001,$APP_URL,http://localhost:8010\"  (then restart the backend)"
echo "  • Start this app:  npm run dev"
echo "  • Open the class in Kiwi — the \"Podcast\" tab should appear."
echo "  • Open Kiwi's App Admin Panels — \"Podcast Admin\" should appear at /admin/app/$SLUG."
