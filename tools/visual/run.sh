#!/bin/sh
# The visual regression suite, in the container CI uses.
#
# Snapshots are compared pixel for pixel, and a laptop's own Chromium renders text a few
# pixels differently from a Linux one, so the suite only ever runs in one place: the
# Playwright image whose version matches @playwright/test. This script runs it there from
# any machine with Docker, against a copy of the working tree, and copies new or updated
# snapshots back. Nothing in the repository's own node_modules is touched.
#
#   pnpm visual                 compare against the committed snapshots
#   pnpm visual:update          rewrite the snapshots (then look at the diff before committing)
#
# The copy lives under ~/.cache/chips-visual (or $CHIPS_VISUAL_CACHE) and keeps its
# node_modules and pnpm store between runs, so the second run is quick. Lifecycle scripts are
# skipped on install: the image has no compiler, and rendering the kitchen sink needs nothing
# native — not better-sqlite3, which is the server's.

set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
VERSION=$(node -e "process.stdout.write(require('$ROOT/apps/web/package.json').devDependencies['@playwright/test'])")
IMAGE="mcr.microsoft.com/playwright:v${VERSION}-noble"
CACHE="${CHIPS_VISUAL_CACHE:-$HOME/.cache/chips-visual}"
TREE="$CACHE/tree"

mkdir -p "$TREE"

# The suite needs the web app, the packages it imports, the lockfile and every workspace
# package.json (for the frozen install) — not what the phone, the Mac app or other worktrees
# build beside them, which runs to tens of gigabytes on a disk that keeps filling. The anchored
# excludes are gitignored output only: the Expo prebuild's native projects, Gradle's builds of
# the app's own modules, Cargo's target, and the worktrees Claude Code keeps in the checkout.
rsync -a --delete \
  --exclude .git --exclude node_modules --exclude dist --exclude coverage --exclude .turbo \
  --exclude .astro --exclude test-results --exclude test-results-visual \
  --exclude playwright-report --exclude playwright-report-visual \
  --exclude .chips --exclude .playwright-chips \
  --exclude /.claude/worktrees/ \
  --exclude /apps/mobile/ios/ --exclude /apps/mobile/android/ \
  --exclude '/apps/mobile/modules/*/android/build/' --exclude '/apps/mobile/modules/*/android/.cxx/' \
  --exclude /apps/desktop/src-tauri/target/ \
  "$ROOT/" "$TREE/"

status=0
docker run --rm \
  -v "$TREE:/work" \
  -w /work \
  -e CI=1 \
  "$IMAGE" \
  bash -lc "corepack enable >/dev/null 2>&1 && pnpm install --frozen-lockfile --prefer-offline --ignore-scripts && pnpm --filter @chipschat/web run visual $*" \
  || status=$?

if [ -d "$TREE/apps/web/visual/__snapshots__" ]; then
  rsync -a "$TREE/apps/web/visual/__snapshots__/" "$ROOT/apps/web/visual/__snapshots__/"
fi

rm -rf "$ROOT/apps/web/test-results-visual"
if [ -d "$TREE/apps/web/test-results-visual" ]; then
  rsync -a "$TREE/apps/web/test-results-visual/" "$ROOT/apps/web/test-results-visual/"
  echo "Diffs, if any, are in apps/web/test-results-visual/"
fi

exit "$status"
