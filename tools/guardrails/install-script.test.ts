/**
 * `packaging/install.sh`, run for real against a fake release in a temporary home: what it puts
 * where, that it checks the SHA-256, that it refuses another platform's release, that a second
 * version moves `current` and the link with it and updates the bridges, and that `connect` installs
 * when it must and then hands the rest of the line to `chips connect` (ADR 0218). And that a
 * release is installed from the download host only when its SHA256SUMS is signed with the release
 * key the script carries (SEC-36), against a copy of the script that carries a test's own key. No
 * network: `--from`, or a download host on `file://`.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = join(import.meta.dirname, "..", "..", "packaging", "install.sh");
const OS = process.platform === "darwin" ? "darwin" : "linux";
const ARCH = process.arch === "arm64" ? "arm64" : "x64";
const TARGET = `${OS}-${ARCH}`;

/**
 * A release that holds only a `bin/chips` that says its version, and otherwise what it was asked
 * and the link it was handed in `CHIPS_JOIN_LINK`, which it also writes to `~/ran`.
 */
function fakeRelease(where: string, version: string, target = TARGET, sums = true): string {
  const name = `chips-${version}-${target}`;
  mkdirSync(join(where, "src", name, "bin"), { recursive: true });
  writeFileSync(
    join(where, "src", name, "bin", "chips"),
    [
      "#!/bin/sh",
      `[ "$1" = --version ] && { echo "chips ${version}"; exit 0; }`,
      `echo "chips ${version} ran: $*" | tee -a "$HOME/ran"`,
      '[ -z "$CHIPS_JOIN_LINK" ] || echo "with CHIPS_JOIN_LINK=$CHIPS_JOIN_LINK" | tee -a "$HOME/ran"',
      "",
    ].join("\n"),
  );
  chmodSync(join(where, "src", name, "bin", "chips"), 0o755);
  const tarball = join(where, `${name}.tar.gz`);
  execFileSync("tar", ["-czf", tarball, "-C", join(where, "src"), name]);
  if (sums) {
    const hash = createHash("sha256").update(readFileSync(tarball)).digest("hex");
    writeFileSync(join(where, "SHA256SUMS"), `${hash}  ${name}.tar.gz\n`);
  }
  return tarball;
}

function install(home: string, ...args: string[]) {
  return installWith({}, home, ...args);
}

/** The card's line, `CHIPS_JOIN_LINK='<link>' sh -s -- …`: the link in the environment. */
function installWith(env: Record<string, string>, home: string, ...args: string[]) {
  return run(SCRIPT, env, home, ...args);
}

function run(script: string, env: Record<string, string>, home: string, ...args: string[]) {
  return spawnSync("sh", [script, ...args], {
    encoding: "utf8",
    env: { HOME: home, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", SHELL: "/bin/zsh", ...env },
  });
}

/**
 * A copy of install.sh that trusts a key of the test's own in place of Chips's release key, the
 * only line changed, and that key's private half to sign with.
 */
function trustingOwnKey(dir: string): { readonly script: string; readonly key: string } {
  const key = join(dir, "release-key");
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "test", "-f", key]);
  const pub = readFileSync(`${key}.pub`, "utf8").trim().split(" ").slice(0, 2).join(" ");
  const script = join(dir, "install.sh");
  const signer = `SIGNER='release@chipschat.ai namespaces="chips-release" ${pub}'`;
  writeFileSync(script, readFileSync(SCRIPT, "utf8").replace(/^SIGNER='[^']+'$/m, signer));
  return { script, key };
}

/** `SHA256SUMS.sig` beside `sums`, as `pnpm release:sign` makes it. */
function sign(key: string, sums: string): void {
  execFileSync("ssh-keygen", ["-Y", "sign", "-q", "-f", key, "-n", "chips-release", sums]);
}

/**
 * A folder for PATH with every program the system has but ssh-keygen and the package managers
 * install.sh names, so a test can stand in one of its own.
 */
function withoutSshKeygen(home: string): string {
  const bin = join(home, "bin");
  mkdirSync(bin);
  for (const dir of ["/usr/bin", "/bin", "/usr/sbin", "/sbin"]) {
    for (const name of readdirSync(dir)) {
      const there = join(bin, name);
      if (name === "ssh-keygen" || /^(apt-get|dnf|yum|zypper|pacman)$/.test(name)) continue;
      if (!existsSync(there)) symlinkSync(join(dir, name), there);
    }
  }
  return bin;
}

/**
 * A download host on `file://` laid out as GitHub's releases are, with one release on it: its files
 * at `download/v<version>/`, and `latest/download/` the same files, as GitHub redirects it.
 */
function host(dir: string, version: string): { readonly base: string; readonly sums: string } {
  const at = join(dir, "host", "download", `v${version}`);
  mkdirSync(at, { recursive: true });
  mkdirSync(join(dir, "host", "latest"));
  symlinkSync(at, join(dir, "host", "latest", "download"));
  const tarball = fakeRelease(dir, version);
  execFileSync("cp", [tarball, join(dir, "SHA256SUMS"), at]);
  return { base: `file://${join(dir, "host")}`, sums: join(at, "SHA256SUMS") };
}

describe("install.sh", () => {
  it("installs a release under ~/.local, checked, with current and the link pointing at it", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const tarball = fakeRelease(home, "0.2.0");
    const ran = install(home, "--from", tarball, "--no-path");
    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stdout).toContain("✓ Checked its SHA-256");
    expect(ran.stdout).toContain("✓ Installed chips 0.2.0");
    // The PATH here lacks ~/.local/bin, so `chips` alone would not be found in this terminal
    // (the onboarding audit, item 4).
    expect(ran.stdout).toContain("Next: ~/.local/bin/chips up");
    const lib = join(home, ".local", "lib", "chips");
    expect(readlinkSync(join(lib, "current"))).toBe(join(lib, "0.2.0"));
    expect(realpathSync(join(home, ".local", "bin", "chips"))).toBe(
      realpathSync(join(lib, "0.2.0", "bin", "chips")),
    );
    // --no-path: the profile is left alone, and the line to add is printed.
    expect(existsSync(join(home, ".zshrc"))).toBe(false);
    expect(ran.stdout).toContain(`export PATH="${join(home, ".local", "bin")}:$PATH"`);
  });

  it("moves current to a second version, and keeps the first", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    install(home, "--from", fakeRelease(join(home, "a"), "0.2.0"), "--no-path");
    const ran = install(home, "--from", fakeRelease(join(home, "b"), "0.3.0"), "--no-path");
    expect(ran.status, ran.stderr).toBe(0);
    const said = execFileSync(join(home, ".local", "bin", "chips"), ["--version"], {
      encoding: "utf8",
    });
    expect(said.trim()).toBe("chips 0.3.0");
    expect(existsSync(join(home, ".local", "lib", "chips", "0.2.0"))).toBe(true);
  });

  it("brings the bridges up to date after an upgrade, and not after the same version again", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const ran = () =>
      existsSync(join(home, "ran")) ? readFileSync(join(home, "ran"), "utf8") : "";
    install(home, "--from", fakeRelease(join(home, "a"), "0.2.0"), "--no-path");
    expect(ran()).toBe("");
    install(home, "--from", fakeRelease(join(home, "b"), "0.3.0"), "--no-path");
    expect(ran()).toBe("chips 0.3.0 ran: connect --update\n");
    install(home, "--from", fakeRelease(join(home, "c"), "0.3.0"), "--no-path");
    expect(ran()).toBe("chips 0.3.0 ran: connect --update\n");
  });

  it("with connect, installs Chips and then connects the harness, the link handed on in its environment", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const link = "https://chips.example/j/chips_j_abc&def";
    const ran = installWith(
      { CHIPS_JOIN_LINK: link },
      home,
      "--from",
      fakeRelease(home, "0.2.0"),
      "--no-path",
      "connect",
      "hermes",
    );
    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stdout).toContain("✓ Installed chips 0.2.0");
    // Never among the words, where `ps` lists it for anybody on the machine (SEC-50).
    expect(ran.stdout).toContain(`chips 0.2.0 ran: connect hermes\nwith CHIPS_JOIN_LINK=${link}`);
    // Another computer connects a harness to a Chips elsewhere: a second Chips here is not next.
    expect(ran.stdout).not.toContain("Next: chips up");
  });

  it("with connect, skips the install when Chips is here already", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    install(home, "--from", fakeRelease(home, "0.2.0"), "--no-path");
    // No `--from`: an install would go to the network, and this one never does.
    const link = "https://chips.example/j/chips_j_abc";
    const ran = installWith({ CHIPS_JOIN_LINK: link }, home, "connect", "codex");
    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stdout).toContain(
      `chips 0.2.0 is here already, at ${join(home, ".local", "bin", "chips")}`,
    );
    expect(ran.stdout).toContain(`chips 0.2.0 ran: connect codex\nwith CHIPS_JOIN_LINK=${link}`);
    // A line copied before, with the link after the id, is handed on as it was given.
    const before = install(home, "connect", "codex", link);
    expect(before.stdout).toContain(`chips 0.2.0 ran: connect codex ${link}`);
    expect(ran.stdout).not.toContain("Downloading");
  });

  it("with connect and nothing after it, says what to give", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const ran = install(home, "connect");
    expect(ran.status).not.toBe(0);
    expect(ran.stderr).toContain("Say which harness to connect: connect <id>, as Chips's card");
  });

  it("leaves a chips command Chips for Mac linked as it is", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const app = join(home, "Applications", "Chips.app", "Contents", "Resources", "chips", "bin");
    mkdirSync(app, { recursive: true });
    writeFileSync(join(app, "chips"), '#!/bin/sh\necho "chips 0.1.0 (the app\'s)"\n');
    chmodSync(join(app, "chips"), 0o755);
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    symlinkSync(join(app, "chips"), join(home, ".local", "bin", "chips"));
    const ran = install(home, "--from", fakeRelease(home, "0.2.0"), "--no-path");
    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stdout).toContain("✓ Installed chips 0.2.0 in");
    expect(ran.stdout).toContain("stays as it is: it runs Chips for Mac's own");
    expect(readlinkSync(join(home, ".local", "bin", "chips"))).toBe(join(app, "chips"));
    expect(readlinkSync(join(home, ".local", "lib", "chips", "current"))).toBe(
      join(home, ".local", "lib", "chips", "0.2.0"),
    );
  });

  it("replaces a link to Chips for Mac once the app has gone to the Trash", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const gone = join(home, "Applications", "Chips.app", "Contents", "Resources", "chips", "bin");
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    symlinkSync(join(gone, "chips"), join(home, ".local", "bin", "chips"));
    const ran = install(home, "--from", fakeRelease(home, "0.2.0"), "--no-path");
    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stdout).not.toContain("stays as it is");
    expect(readlinkSync(join(home, ".local", "bin", "chips"))).toBe(
      join(home, ".local", "lib", "chips", "current", "bin", "chips"),
    );
  });

  it("adds ~/.local/bin to the profile with --yes, once however often it runs", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const ran = install(home, "--from", fakeRelease(home, "0.2.0"), "--yes");
    expect(ran.status, ran.stderr).toBe(0);
    expect(readFileSync(join(home, ".zshrc"), "utf8")).toContain(join(home, ".local", "bin"));
    // Run again from the same terminal, whose PATH still lacks it (the onboarding audit, item 38).
    const again = install(home, "--from", fakeRelease(join(home, "b"), "0.2.0"), "--yes");
    expect(again.status, again.stderr).toBe(0);
    expect(readFileSync(join(home, ".zshrc"), "utf8").match(/# Chips/g)).toHaveLength(1);
    expect(again.stdout).toContain("already adds");
  });

  it("says just chips up where the PATH finds it", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const bin = join(home, ".local", "bin");
    const ran = run(
      SCRIPT,
      { PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin` },
      home,
      "--from",
      fakeRelease(home, "0.2.0"),
    );
    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stdout).toContain("Next: chips up\n");
  });

  it("refuses a tarball that does not match its SHA-256, and installs nothing", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const tarball = fakeRelease(home, "0.2.0");
    writeFileSync(join(home, "SHA256SUMS"), `${"0".repeat(64)}  chips-0.2.0-${TARGET}.tar.gz\n`);
    const ran = install(home, "--from", tarball, "--no-path");
    expect(ran.status).not.toBe(0);
    expect(ran.stderr).toContain("does not match its SHA-256");
    expect(existsSync(join(home, ".local", "bin", "chips"))).toBe(false);
  });

  it("refuses another platform's release", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const other = OS === "darwin" ? "linux-x64" : "darwin-arm64";
    const ran = install(home, "--from", fakeRelease(home, "0.2.0", other), "--no-path");
    expect(ran.status).not.toBe(0);
    expect(ran.stderr).toContain(`not a release for this machine (${TARGET})`);
  });

  it("installs from the download host a release whose SHA256SUMS the release key signed (SEC-36)", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const { script, key } = trustingOwnKey(home);
    const { base, sums } = host(home, "0.2.0");
    sign(key, sums);
    const ran = run(script, { CHIPS_DOWNLOAD_BASE: base }, home, "--no-path");
    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stdout).toContain("✓ Checked its signature");
    expect(ran.stdout).toContain("✓ Checked its SHA-256");
    expect(existsSync(join(home, ".local", "bin", "chips"))).toBe(true);
  });

  it("installs a version asked for from its own release, and says when there is no such release", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const { script, key } = trustingOwnKey(home);
    const { base, sums } = host(home, "0.2.0");
    sign(key, sums);
    rmSync(join(home, "host", "latest"), { recursive: true });
    const ran = run(script, { CHIPS_DOWNLOAD_BASE: base }, home, "--version", "0.2.0", "--no-path");
    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stdout).toContain(`Downloading chips-0.2.0-${TARGET} from ${base}/download/v0.2.0`);
    expect(ran.stdout).toContain("✓ Installed chips 0.2.0");
    const none = run(
      script,
      { CHIPS_DOWNLOAD_BASE: base },
      home,
      "--version",
      "0.9.0",
      "--no-path",
    );
    expect(none.status).not.toBe(0);
    expect(none.stderr).toContain(`No release at ${base}/download/v0.9.0`);
  });

  it("says so when the release has no tarball for this machine", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const { script, key } = trustingOwnKey(home);
    const { base, sums } = host(home, "0.2.0");
    const other = OS === "darwin" ? "linux-x64" : "darwin-arm64";
    writeFileSync(sums, `${"0".repeat(64)}  chips-0.2.0-${other}.tar.gz\n`);
    sign(key, sums);
    const ran = run(script, { CHIPS_DOWNLOAD_BASE: base }, home, "--no-path");
    expect(ran.status).not.toBe(0);
    expect(ran.stderr).toContain(`has nothing for this machine (${TARGET})`);
  });

  it("refuses a release from the download host that is unsigned, signed by another key, or changed after", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const { script, key } = trustingOwnKey(home);
    const { base, sums } = host(home, "0.2.0");
    const tryIt = () => run(script, { CHIPS_DOWNLOAD_BASE: base }, home, "--no-path");

    // No signature at all: whoever holds the host could have put up anything.
    const unsigned = tryIt();
    expect(unsigned.status).not.toBe(0);
    expect(unsigned.stderr).toContain("Could not download the release's signature");

    // Signed, but not with the key the script carries.
    const other = mkdtempSync(join(tmpdir(), "chips-other-key-"));
    execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", join(other, "key")]);
    sign(join(other, "key"), sums);
    const stranger = tryIt();
    expect(stranger.status).not.toBe(0);
    expect(stranger.stderr).toContain("not signed with Chips's release key");

    // Signed with it, then a line changed: a tarball of somebody else's under the same name.
    sign(key, sums);
    writeFileSync(sums, `${"0".repeat(64)}  chips-0.2.0-${TARGET}.tar.gz\n`);
    const changed = tryIt();
    expect(changed.status).not.toBe(0);
    expect(changed.stderr).toContain("not signed with Chips's release key");
    expect(existsSync(join(home, ".local", "bin", "chips"))).toBe(false);
  });

  it("installs the version asked for and no other, whatever the host serves under its name", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const { script, key } = trustingOwnKey(home);
    // An older release's signed files, put up where 0.3.0's belong.
    const { base, sums } = host(home, "0.2.0");
    sign(key, sums);
    execFileSync("mv", [
      join(home, "host", "download", "v0.2.0"),
      join(home, "host", "download", "v0.3.0"),
    ]);
    const ran = run(script, { CHIPS_DOWNLOAD_BASE: base }, home, "--version", "0.3.0", "--no-path");
    expect(ran.status).not.toBe(0);
    expect(ran.stderr).toContain("You asked for 0.3.0, and the release there is 0.2.0.");
    expect(existsSync(join(home, ".local", "bin", "chips"))).toBe(false);
  });

  it("never takes an older release as the latest over a newer one here, unless asked by version", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const { script, key } = trustingOwnKey(home);
    install(home, "--from", fakeRelease(join(home, "here"), "0.10.0"), "--no-path");
    const { base, sums } = host(home, "0.9.0");
    sign(key, sums);
    const back = run(script, { CHIPS_DOWNLOAD_BASE: base }, home, "--no-path");
    expect(back.status).not.toBe(0);
    expect(back.stderr).toContain("The latest release there is 0.9.0, older than the 0.10.0 here.");
    const lib = join(home, ".local", "lib", "chips");
    expect(readlinkSync(join(lib, "current"))).toBe(join(lib, "0.10.0"));
    // Asked for by its version, it is what the person wants.
    const asked = run(
      script,
      { CHIPS_DOWNLOAD_BASE: base },
      home,
      "--version",
      "0.9.0",
      "--no-path",
    );
    expect(asked.status, asked.stderr).toBe(0);
    expect(readlinkSync(join(lib, "current"))).toBe(join(lib, "0.9.0"));
  });

  it("says chips up starts the server again after an upgrade", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    install(home, "--from", fakeRelease(join(home, "a"), "0.2.0"), "--no-path");
    const ran = install(home, "--from", fakeRelease(join(home, "b"), "0.3.0"), "--no-path");
    expect(ran.stdout).toContain(
      "Next: ~/.local/bin/chips up, which starts a server running here again on 0.3.0",
    );
    const again = install(home, "--from", fakeRelease(join(home, "c"), "0.3.0"), "--no-path");
    expect(again.stdout).toContain("Next: ~/.local/bin/chips up\n");
  });

  it("says an ssh-keygen too old to check a signature is too old, not that the release isn't signed", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const { script, key } = trustingOwnKey(home);
    const { base, sums } = host(home, "0.2.0");
    sign(key, sums);
    const bin = withoutSshKeygen(home);
    // OpenSSH 7.9's, as Debian 10 has it.
    writeFileSync(
      join(bin, "ssh-keygen"),
      "#!/bin/sh\necho \"ssh-keygen: invalid option -- 'Y'\" >&2\necho 'usage: ssh-keygen [-q] [-b bits]' >&2\nexit 1\n",
      { mode: 0o755 },
    );
    const ran = run(script, { CHIPS_DOWNLOAD_BASE: base, PATH: bin }, home, "--no-path");
    expect(ran.status).not.toBe(0);
    expect(ran.stderr).toContain("ssh-keygen is older than OpenSSH 8.1");
    expect(ran.stderr).not.toContain("not signed with Chips's release key");
  });

  it("says how to get ssh-keygen where it's missing, in this machine's package manager's words", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const { script, key } = trustingOwnKey(home);
    const { base, sums } = host(home, "0.2.0");
    sign(key, sums);
    const bin = withoutSshKeygen(home);
    const without = (manager?: string) => {
      for (const name of ["apt-get", "dnf"]) rmSync(join(bin, name), { force: true });
      if (manager !== undefined) writeFileSync(join(bin, manager), "#!/bin/sh\n", { mode: 0o755 });
      return run(script, { CHIPS_DOWNLOAD_BASE: base, PATH: bin }, home, "--no-path");
    };
    const apt = without("apt-get");
    expect(apt.status).not.toBe(0);
    expect(apt.stderr).toContain("needs ssh-keygen, which comes with OpenSSH.");
    expect(apt.stderr).toContain('Install it with "sudo apt-get install openssh-client"');
    expect(without("dnf").stderr).toContain('"sudo dnf install openssh-clients"');
    // No package manager it knows: the sentence alone.
    expect(without().stderr).toContain("comes with OpenSSH.\n");
    expect(existsSync(join(home, ".local", "bin", "chips"))).toBe(false);
  });

  it("checks a file you have by the signature beside its SHA256SUMS, and says when there is none", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const { script, key } = trustingOwnKey(home);
    const tarball = fakeRelease(home, "0.2.0");
    const plain = run(script, {}, home, "--from", tarball, "--no-path");
    expect(plain.status, plain.stderr).toBe(0);
    expect(plain.stdout).toContain("who made the release was not checked");
    sign(key, join(home, "SHA256SUMS"));
    const signed = run(script, {}, home, "--from", tarball, "--no-path");
    expect(signed.status, signed.stderr).toBe(0);
    expect(signed.stdout).toContain("✓ Checked its signature");
  });

  it("says when there is no SHA256SUMS to check against, and installs anyway", () => {
    const home = mkdtempSync(join(tmpdir(), "chips-install-"));
    const ran = install(home, "--from", fakeRelease(home, "0.2.0", TARGET, false), "--no-path");
    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stdout).toContain("its SHA-256 was not checked");
  });
});
