#!/bin/sh
# Build the macOS app, and sign and notarize it when there is an identity to do it with.
#
# The split matters. An unsigned `.dmg` is a real build and a useful artifact — it runs on the
# machine that made it, and it is what CI can produce with no secrets at all — but Gatekeeper
# will refuse it on anybody else's Mac. So this builds either way and says plainly which of the
# two you have, rather than silently producing something that will not open.
#
#   apps/desktop/scripts/build.sh
#
# To sign and notarize, all four must be set:
#   APPLE_SIGNING_IDENTITY   "Developer ID Application: Name (TEAMID)"
#   APPLE_ID                 the Apple ID that owns the Developer Program membership
#   APPLE_PASSWORD           an app-specific password for that Apple ID
#   APPLE_TEAM_ID            the ten-character team id

set -eu

cd "$(dirname "$0")/.."

signed=0
if [ -n "${APPLE_SIGNING_IDENTITY:-}" ] && [ -n "${APPLE_ID:-}" ] &&
   [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
  signed=1
fi

printf '\n  Building Chips for macOS\n  ────────────────────────\n\n'
if [ "$signed" -eq 1 ]; then
  printf '    signing      %s\n' "$APPLE_SIGNING_IDENTITY"
  printf '    notarizing   as %s (team %s)\n\n' "$APPLE_ID" "$APPLE_TEAM_ID"
else
  printf '    signing      no identity, so this build is unsigned\n'
  printf '    notarizing   skipped\n\n'
  printf '  It will run on this machine. Gatekeeper will refuse it on any other,\n'
  printf '  which is the honest state of an unsigned build rather than a failure.\n\n'
  # Tauri signs when it sees the variable and skips it when it does not; unset rather than
  # empty, because an empty identity is a signing attempt that fails halfway through.
  unset APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID 2>/dev/null || true
fi

pnpm exec tauri build "$@"

printf '\n  Built\n  ─────\n'
find src-tauri/target -name "*.dmg" -maxdepth 4 -print 2>/dev/null | sed 's/^/    /'
if [ "$signed" -eq 0 ]; then
  printf '\n  Unsigned. To check what a signed one would need: `codesign -dv --verbose=4 <app>`.\n\n'
else
  printf '\n  Signed and notarized. Check with: `spctl -a -vvv -t install <app>`.\n\n'
fi
