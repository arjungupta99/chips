#!/bin/sh
# Chips, on a machine that has none (ADR 0119).
#
# It says what it will do, then does it: works out this machine's platform, fetches that
# platform's release, checks that SHA256SUMS is signed with Chips's release key and that the
# release matches its SHA-256, unpacks it under ~/.local/lib/chips/<version>, and
# points ~/.local/lib/chips/current and ~/.local/bin/chips at it. The release carries its own Node,
# so nothing else is needed: no Node, no compiler, no checkout. It never uses sudo.
#
#   curl -fsSL https://chipschat.ai/install | sh
#   sh install.sh --from ./chips-0.2.0-darwin-arm64.tar.gz     a release you already have
#
# With `connect`, it connects a harness on this machine once Chips is here (ADR 0218): it installs
# Chips when it isn't installed, skips the install when it is, then runs `chips connect` with the
# rest of the line. The card in Chips gives the whole line, the link in the environment, which
# other users on this machine can't list as they can a command's words:
#
#   curl -fsSL https://chipschat.ai/install | CHIPS_JOIN_LINK='<link>' sh -s -- connect hermes
#
# Options:
#   --from <tarball>   install this file instead of downloading one, checked by the SHA256SUMS
#                      and SHA256SUMS.sig beside it when they are there
#   --version <v>      a version other than the latest
#   --no-path          leave your shell profile alone
#   --yes              add ~/.local/bin to your shell profile without asking
#   connect <id>       then connect that harness, with the link Chips made (always last)
# Environment:
#   CHIPS_JOIN_LINK      the link, which `chips connect` reads
#   CHIPS_DOWNLOAD_BASE  where releases are, laid out as GitHub's are
#                        (https://github.com/arjungupta99/chips/releases)
#   CHIPS_PREFIX         where Chips goes (~/.local)
#
# Read it before you run it. That is the point of it being this short.

set -eu

# The repository's GitHub releases: the newest at latest/download/<file>, each version at
# download/v<version>/<file>.
BASE="${CHIPS_DOWNLOAD_BASE:-https://github.com/arjungupta99/chips/releases}"

# The key Chips's releases are signed with (SEC-36). Its private half stays on the machine
# releases are made on, where `pnpm release:sign` signs each release's SHA256SUMS with it. A
# release is installed from the web only when SHA256SUMS carries its signature, so whoever holds
# the download host cannot hand out a release of their own. Change it only with that key.
SIGNER='release@chipschat.ai namespaces="chips-release" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIE4Hjm5JMEWp9mJ6b4ITUf6RFa2kDX5R2C7X5ZaQbNDa'
PREFIX="${CHIPS_PREFIX:-$HOME/.local}"
BIN="$PREFIX/bin"
LIB="$PREFIX/lib/chips"
FROM=""
VERSION="latest"
PATH_EDIT="ask"
MODE="install"

say() { printf '  %s\n' "$1"; }
die() { printf '\n  %s\n\n' "$1" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --from) FROM="${2:-}"; shift 2 ;;
    --version) VERSION="${2:-}"; shift 2 ;;
    --no-path) PATH_EDIT="no"; shift ;;
    --yes|-y) PATH_EDIT="yes"; shift ;;
    connect) MODE="connect"; shift; break ;;
    *) die "Unknown option: $1" ;;
  esac
done

# `connect`: the Chips already here when there is one, the harness connected with it, and nothing
# installed. What follows `connect` goes to `chips connect` as it was given.
if [ "$MODE" = connect ]; then
  [ $# -gt 0 ] || die "Say which harness to connect: connect <id>, as Chips's card gives it."
  if [ -x "$BIN/chips" ]; then CHIPS="$BIN/chips"
  else CHIPS=$(command -v chips 2>/dev/null || true)
  fi
  if [ -n "$CHIPS" ] && "$CHIPS" --version >/dev/null 2>&1; then
    printf '\n  Chips\n  ─────\n\n'
    say "$("$CHIPS" --version) is here already, at $CHIPS"
    printf '\n'
    exec "$CHIPS" connect "$@" < /dev/null
  fi
fi

case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  *) die "Chips installs on macOS and Linux. On Windows, use WSL." ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64 ;;
  x86_64|amd64) ARCH=x64 ;;
  *) die "Chips has no release for $(uname -m)." ;;
esac
if [ "$OS" = linux ] && (ldd --version 2>&1 || true) | grep -qi musl; then
  die "Chips has no release for musl (Alpine) yet. A Debian or Ubuntu image works."
fi
TARGET="$OS-$ARCH"

# How this machine gets OpenSSH's ssh-keygen, by its package manager: a sentence, or nothing.
openssh_how() {
  sudo="sudo "
  [ "$(id -u)" = 0 ] && sudo=""
  if command -v apt-get >/dev/null 2>&1; then how="apt-get install openssh-client"
  elif command -v dnf >/dev/null 2>&1; then how="dnf install openssh-clients"
  elif command -v yum >/dev/null 2>&1; then how="yum install openssh-clients"
  elif command -v zypper >/dev/null 2>&1; then how="zypper install openssh-clients"
  elif command -v pacman >/dev/null 2>&1; then how="pacman -S openssh"
  else return 0
  fi
  printf ' Install it with "%s%s", then run this again.' "$sudo" "$how"
}

# Whether SHA256SUMS ($1) carries the release key's signature ($2). OpenSSH's ssh-keygen checks
# it, 8.1 or later, which macOS and every current Linux have.
signed() {
  command -v ssh-keygen >/dev/null 2>&1 || die "Checking the release's signature needs \
ssh-keygen, which comes with OpenSSH.$(openssh_how)"
  printf '%s\n' "$SIGNER" > "$TMP/signers"
  ssh-keygen -Y verify -f "$TMP/signers" -I release@chipschat.ai -n chips-release -s "$2" \
    < "$1" > /dev/null 2>&1
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

printf '\n  Chips\n  ─────\n\n'
if [ -n "$FROM" ]; then
  [ -f "$FROM" ] || die "No such file: $FROM"
  TARBALL="$FROM"
  NAME=$(basename "$FROM" .tar.gz)
  say "Installing $NAME from $FROM into $LIB"
else
  if [ "$VERSION" = latest ]; then DIR="$BASE/latest/download"
  else DIR="$BASE/download/v$VERSION"
  fi
  curl -fsSL "$DIR/SHA256SUMS" -o "$TMP/SHA256SUMS" \
    || die "No release at $DIR: its SHA256SUMS could not be downloaded."
  curl -fsSL "$DIR/SHA256SUMS.sig" -o "$TMP/SHA256SUMS.sig" \
    || die "Could not download the release's signature, SHA256SUMS.sig. Not installed."
  # SHA256SUMS names this machine's tarball, and with it the version. What it says is believed only
  # once its signature is checked, below, before anything is installed.
  NAME=$(sed -n "s/^[0-9a-f]\{64\}  \(chips-[0-9A-Za-z.+-]*-$TARGET\)\.tar\.gz\$/\1/p" "$TMP/SHA256SUMS" \
    | head -n 1)
  [ -n "$NAME" ] || die "The release at $DIR has nothing for this machine ($TARGET)."
  say "Downloading $NAME from $DIR into $LIB"
  curl -fsSL "$DIR/$NAME.tar.gz" -o "$TMP/$NAME.tar.gz" || die "Could not download $NAME."
  TARBALL="$TMP/$NAME.tar.gz"
fi

case "$NAME" in
  chips-*-"$TARGET") VERSION=${NAME#chips-}; VERSION=${VERSION%-"$TARGET"} ;;
  *) die "$NAME is not a release for this machine ($TARGET)." ;;
esac

SUMS="$TMP/SHA256SUMS"
[ -f "$SUMS" ] || SUMS="$(dirname "$TARBALL")/SHA256SUMS"
if [ -f "$SUMS" ]; then
  if [ -f "$SUMS.sig" ]; then
    signed "$SUMS" "$SUMS.sig" || die "SHA256SUMS is not signed with Chips's release key, as this \
machine's ssh-keygen reads it (OpenSSH 8.1 or later). Not installed."
    say "✓ Checked its signature"
  else
    say "! No SHA256SUMS.sig beside $SUMS, so who made the release was not checked"
  fi
  WANT=$(grep " $NAME.tar.gz\$" "$SUMS" | cut -d' ' -f1)
  [ -n "$WANT" ] || die "SHA256SUMS lists no $NAME.tar.gz."
  [ "$(sha256 "$TARBALL")" = "$WANT" ] || die "$NAME.tar.gz does not match its SHA-256. Not installed."
  say "✓ Checked its SHA-256"
else
  say "! No SHA256SUMS beside $TARBALL, so its SHA-256 was not checked"
fi

tar -xzf "$TARBALL" -C "$TMP"
[ -x "$TMP/$NAME/bin/chips" ] || die "$NAME.tar.gz does not hold a Chips release."
WAS=""
[ -L "$LIB/current" ] && WAS=$(basename "$(readlink "$LIB/current")")
mkdir -p "$LIB" "$BIN"
rm -rf "${LIB:?}/$VERSION"
mv "$TMP/$NAME" "$LIB/$VERSION"
ln -sfn "$LIB/$VERSION" "$LIB/current"
# Chips for Mac links ~/.local/bin/chips to the copy it carries, which updates with the app: that
# link is left as it is (ADR 0218, phase 5). Once the app is in the Trash the link leads nowhere,
# and is replaced.
APP=""
[ -L "$BIN/chips" ] && [ -e "$BIN/chips" ] && case "$(readlink "$BIN/chips")" in
  *.app/Contents/Resources/chips/bin/chips) APP=$(readlink "$BIN/chips") ;;
esac
if [ -n "$APP" ]; then
  say "✓ Installed $("$LIB/current/bin/chips" --version) in $LIB/$VERSION (no Node needed)"
  say "$BIN/chips stays as it is: it runs Chips for Mac's own, at $APP"
else
  ln -sf "$LIB/current/bin/chips" "$BIN/chips"
  say "✓ Installed $("$BIN/chips" --version) in $BIN/chips (no Node needed)"
fi

# An upgrade: each harness's bridge kept running here brought to the newest release its card names,
# and started again on the Node this release carries (ADR 0218). Nothing to do where none is.
if [ -n "$WAS" ] && [ "$WAS" != "$VERSION" ]; then
  "$LIB/current/bin/chips" connect --update < /dev/null || say "! A bridge didn't update: the lines above say which."
fi

case ":$PATH:" in
  *":$BIN:"*) ;;
  *)
    case "${SHELL:-}" in
      */zsh) PROFILE="$HOME/.zshrc" ;;
      */bash) [ "$OS" = darwin ] && PROFILE="$HOME/.bash_profile" || PROFILE="$HOME/.bashrc" ;;
      *) PROFILE="" ;;
    esac
    LINE="export PATH=\"$BIN:\$PATH\""
    if [ "$PATH_EDIT" = ask ] && [ -n "$PROFILE" ] && [ -r /dev/tty ]; then
      printf '  %s is not on your PATH. Add it to %s? [Y/n] ' "$BIN" "$PROFILE"
      read -r ANSWER < /dev/tty || ANSWER=n
      case "$ANSWER" in [nN]*) PATH_EDIT=no ;; *) PATH_EDIT=yes ;; esac
    fi
    if [ "$PATH_EDIT" = yes ] && [ -n "$PROFILE" ]; then
      printf '\n# Chips\n%s\n' "$LINE" >> "$PROFILE"
      say "✓ Added $BIN to your PATH in $PROFILE (open a new terminal for it)"
    else
      say "$BIN is not on your PATH. Add this to your shell profile:"
      printf '\n    %s\n\n' "$LINE"
    fi
    ;;
esac

if [ "$MODE" = connect ]; then
  printf '\n'
  exec "$BIN/chips" connect "$@" < /dev/null
fi

printf '\n  Next: chips up\n\n'
