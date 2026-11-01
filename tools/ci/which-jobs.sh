#!/bin/sh
# Which of CI's jobs have something to check, given the paths a push or a pull request changed,
# one to a line on stdin. Minutes on a private repository are counted, and the month's ran out on
# 13 September 2026 at about fifty a push, so a job runs only where it can find something.
#
#   code     the tests and the end-to-end suites: anything but prose. The
#            architecture page is prose that lint checks, so it counts as code.
#   web      the visual regression suite: the web app, the packages it draws with, and the
#            installs, the workflow and the container image they are pinned to.
#   desktop  the macOS shell, on the runner counted at ten minutes a minute: the shell, whose
#            Rust and JavaScript dependencies are both locked under apps/desktop, and the
#            workflow. The web app it embeds, and the root lockfile, are built and tested by
#            `code`.
#
# `--all` says every job does: a manual run, or a push whose base is not in the history.
# Prints `code=`, `web=` and `desktop=` lines for $GITHUB_OUTPUT.
set -eu

if [ "${1:-}" = "--all" ]; then
  printf 'code=true\nweb=true\ndesktop=true\n'
  exit 0
fi

paths=$(cat)

# Whether any changed path matches the extended regular expression.
any() {
  printf '%s\n' "$paths" | grep -Eq "$1"
}

# Whether any changed path is not prose.
beyond_prose() {
  printf '%s\n' "$paths" | grep -Ev '^(docs/|[^/]*\.md$|LICENSE$)' | grep -q . ||
    any '^docs/architecture\.md$'
}

WORKFLOW='^\.github/workflows/'
INSTALLS='^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc|\.node-version)$'

code=false
web=false
desktop=false
if beyond_prose; then code=true; fi
if any '^(apps/web|packages|tools/visual)/' || any "$INSTALLS" || any "$WORKFLOW"; then web=true; fi
if any '^apps/desktop/' || any "$WORKFLOW"; then desktop=true; fi
printf 'code=%s\nweb=%s\ndesktop=%s\n' "$code" "$web" "$desktop"
