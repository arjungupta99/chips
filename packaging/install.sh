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

# The four bytes at $2 in file $1, as the number they are (big-endian), and the $3 bytes at $2.
u32_at() { od -An -tu1 -j "$2" -N4 "$1" | awk 'NF == 4 { print (($1 * 256 + $2) * 256 + $3) * 256 + $4 }'; }
bytes_at() { dd if="$1" bs=1 skip="$2" count="$3" 2>/dev/null; }
# The number $1 as four bytes, big-endian.
u32() {
  printf "$(printf '\\%03o\\%03o\\%03o\\%03o' $(($1 >> 24 & 255)) $(($1 >> 16 & 255)) \
    $(($1 >> 8 & 255)) $(($1 & 255)))"
}

# The same check by OpenSSL 1.1.1 or later, for a machine whose OpenSSH is older than 8.1, as
# RHEL 8's 8.0 is (the onboarding audit, Part 2, item 12). The signature is OpenSSH's SSHSIG
# (PROTOCOL.sshsig): read apart here, and the release key's Ed25519 signature checked over what
# ssh-keygen signs. 0 when it is the release key's, 1 when it isn't or doesn't read as one, and 2
# when this openssl can't check Ed25519 at all.
openssl_signed() {
  command -v openssl >/dev/null 2>&1 || return 2
  openssl pkeyutl -help 2>&1 | grep -q -- -rawin || return 2
  d="$TMP/sshsig"
  mkdir -p "$d"
  # The release key: the 32 bytes inside the ssh-ed25519 key the script carries, as DER.
  printf '%s\n' "${SIGNER##* }" | base64 -d > "$d/key.ssh" 2>/dev/null || return 2
  [ "$(u32_at "$d/key.ssh" 15)" = 32 ] || return 2
  { printf '\060\052\060\005\006\003\053\145\160\003\041\000'; bytes_at "$d/key.ssh" 19 32; } > "$d/key.der"
  openssl pkey -pubin -inform DER -in "$d/key.der" -noout 2>/dev/null || return 2
  # The signature, its fields in order: the key, the namespace, nothing reserved, the hash's name,
  # and the signature itself.
  sed '/-----/d' "$2" | tr -d ' \r\n' | base64 -d > "$d/sig" 2>/dev/null || return 1
  [ "$(bytes_at "$d/sig" 0 6)" = SSHSIG ] && [ "$(u32_at "$d/sig" 6)" = 1 ] || return 1
  at=10
  for field in key namespace reserved hash signature; do
    n=$(u32_at "$d/sig" "$at")
    [ -n "$n" ] && [ "$n" -le 4096 ] || return 1
    bytes_at "$d/sig" $((at + 4)) "$n" > "$d/$field"
    at=$((at + 4 + n))
  done
  [ "$(cat "$d/namespace")" = chips-release ] && [ "$(cat "$d/hash")" = sha512 ] || return 1
  [ "$(wc -c < "$d/signature" | tr -d ' ')" = 83 ] || return 1
  [ "$(bytes_at "$d/signature" 4 11)" = ssh-ed25519 ] || return 1
  bytes_at "$d/signature" 19 64 > "$d/raw"
  openssl dgst -sha512 -binary < "$1" > "$d/digest" || return 1
  { printf SSHSIG; u32 13; printf chips-release; u32 0; u32 6; printf sha512; u32 64
    cat "$d/digest"; } > "$d/signed"
  openssl pkeyutl -verify -pubin -keyform DER -inkey "$d/key.der" -rawin -in "$d/signed" \
    -sigfile "$d/raw" > /dev/null 2>&1 || return 1
}

# Whether SHA256SUMS ($1) carries the release key's signature ($2). OpenSSH's ssh-keygen checks
# it, 8.1 or later, which macOS and every current Linux have. One older than that has no -Y, so
# OpenSSL checks it instead; with neither, that is said as itself, not as a release that isn't
# signed.
signed() {
  if command -v ssh-keygen >/dev/null 2>&1; then
    printf '%s\n' "$SIGNER" > "$TMP/signers"
    ssh-keygen -Y verify -f "$TMP/signers" -I release@chipschat.ai -n chips-release -s "$2" \
      < "$1" > "$TMP/verified" 2>&1 && return 0
    grep -Eq -- "option -- '?Y'?" "$TMP/verified" || return 1
    old="This machine's ssh-keygen is older than OpenSSH 8.1, and its openssl can't check \
the release's signature either. Install OpenSSH 8.1 or later, then run this again."
  else
    old="Checking the release's signature needs ssh-keygen, which comes with OpenSSH.$(openssh_how)"
  fi
  checked=0
  openssl_signed "$1" "$2" || checked=$?
  [ "$checked" = 0 ] && return 0
  [ "$checked" = 1 ] && return 1
  die "$old"
}

# Whether version $1 comes before version $2, by their numbers: 1.0.9 before 1.0.10.
older() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    split(a, x, /[.+-]/); split(b, y, /[.+-]/)
    for (i = 1; i <= 3; i++) {
      if (x[i] + 0 < y[i] + 0) exit 0
      if (x[i] + 0 > y[i] + 0) exit 1
    }
    exit 1
  }'
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

printf '\n  Chips\n  ─────\n\n'

# Chips for Mac links ~/.local/bin/chips to the copy it carries, which updates with the app (ADR
# 0218, phase 5). A release unpacked here beside it would be one nothing runs, about 170 MB (the
# onboarding audit, item 25), so nothing is downloaded. Once the app is in the Trash the link
# leads nowhere, and this installs as on any other machine.
if [ -z "$FROM" ] && [ -L "$BIN/chips" ] && [ -e "$BIN/chips" ]; then
  case "$(readlink "$BIN/chips")" in
    *.app/Contents/Resources/chips/bin/chips)
      APP=$(readlink "$BIN/chips")
      say "Chips for Mac is installed, and $BIN/chips runs the chips it carries,"
      say "at ${APP%/Contents/Resources/chips/bin/chips}. It updates with the app."
      say "To update, download Chips for Mac again from https://chipschat.ai/download and"
      say "replace the copy in Applications. Nothing was installed."
      printf '\n'
      exit 0
      ;;
  esac
fi

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

ASKED="$VERSION"
case "$NAME" in
  chips-*-"$TARGET") VERSION=${NAME#chips-}; VERSION=${VERSION%-"$TARGET"} ;;
  *) die "$NAME is not a release for this machine ($TARGET)." ;;
esac
WAS=""
[ -L "$LIB/current" ] && WAS=$(basename "$(readlink "$LIB/current")")

# From the download host, what is installed is what was asked for. The signature says who made a
# release, not which one it is, so whoever holds the host could serve an older signed release, with
# the holes it had, under a newer version's name or as the latest. A version asked for is that
# version; the latest is never older than the one here, unless it is asked for by its version.
if [ -z "$FROM" ]; then
  if [ "$ASKED" != latest ] && [ "$ASKED" != "$VERSION" ]; then
    die "You asked for $ASKED, and the release there is $VERSION. Not installed."
  fi
  if [ "$ASKED" = latest ] && [ -n "$WAS" ] && older "$VERSION" "$WAS"; then
    die "The latest release there is $VERSION, older than the $WAS here. Not installed. To go \
back to it, run this again with --version $VERSION."
  fi
fi

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

# What to type for `chips` in this terminal: its name when the PATH finds it, else where it is,
# since a profile's new line reaches only a terminal opened after it (the onboarding audit, item 4).
RUN=chips
case ":$PATH:" in
  *":$BIN:"*) ;;
  *)
    case "$BIN" in
      "$HOME"/*) RUN="~${BIN#"$HOME"}/chips" ;;
      *) RUN="$BIN/chips" ;;
    esac
    case "${SHELL:-}" in
      */zsh) PROFILE="$HOME/.zshrc" ;;
      */bash) [ "$OS" = darwin ] && PROFILE="$HOME/.bash_profile" || PROFILE="$HOME/.bashrc" ;;
      *) PROFILE="" ;;
    esac
    LINE="export PATH=\"$BIN:\$PATH\""
    # Run again from the same terminal, the PATH still lacks it: the line written last time is
    # found, not written twice (item 38).
    if [ -n "$PROFILE" ] && [ -f "$PROFILE" ] && grep -qsF "$LINE" "$PROFILE"; then
      PATH_EDIT=already
    fi
    if [ "$PATH_EDIT" = ask ] && [ -n "$PROFILE" ] && [ -r /dev/tty ]; then
      printf '  %s is not on your PATH. Add it to %s? [Y/n] ' "$BIN" "$PROFILE"
      read -r ANSWER < /dev/tty || ANSWER=n
      case "$ANSWER" in [nN]*) PATH_EDIT=no ;; *) PATH_EDIT=yes ;; esac
    fi
    if [ "$PATH_EDIT" = already ]; then
      say "✓ $PROFILE already adds $BIN to your PATH (in a new terminal)"
    elif [ "$PATH_EDIT" = yes ] && [ -n "$PROFILE" ]; then
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

# An upgrade leaves a server that was running on the release before until it starts again, which
# `chips up` does when it finds one older than itself.
if [ -n "$WAS" ] && [ "$WAS" != "$VERSION" ]; then
  printf '\n  Next: %s up, which starts a server running here again on %s\n\n' "$RUN" "$VERSION"
else
  printf '\n  Next: %s up\n\n' "$RUN"
fi
