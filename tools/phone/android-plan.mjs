/**
 * The decisions `chips build mobile a` makes, apart from the doing of them: which device, which
 * SDK packages are missing, whether the native project is older than its config, the address a
 * device can reach the server at, and what Gradle actually said when it failed. Pure, so they are
 * tested (`tools/guardrails/phone-android.test.ts`) without an emulator.
 */

/** The devices `adb devices -l` lists, with whether each is ready and whether it is an emulator. */
export function devicesFrom(listing) {
  return listing
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("*"))
    .map((line) => {
      const [serial = "", state = ""] = line.split(/\s+/);
      const model = /\bmodel:(\S+)/.exec(line)?.[1] ?? serial;
      return { serial, state, model, emulator: serial.startsWith("emulator-") };
    });
}

/**
 * The device to build for: the one named, or a phone before an emulator, since a phone plugged in
 * is somebody saying where they want it. Only a device adb can talk to counts — `unauthorized`
 * (the phone has not trusted this Mac) and `offline` do not.
 */
export function chooseDevice(devices, wanted) {
  const ready = devices.filter((device) => device.state === "device");
  if (wanted !== undefined) return ready.find((device) => device.serial === wanted);
  return ready.find((device) => !device.emulator) ?? ready[0];
}

/**
 * The SDK packages this React Native wants, read from its own version catalogue, so an upgrade
 * that moves the NDK or the platform moves this with it.
 */
export function sdkWanted(catalogue) {
  const version = (name) => new RegExp(`^${name} = "([^"]+)"`, "m").exec(catalogue)?.[1];
  const platform = version("compileSdk");
  const tools = version("buildTools");
  const ndk = version("ndkVersion");
  return [
    { id: "platform-tools", path: "platform-tools/adb" },
    { id: "emulator", path: "emulator/emulator" },
    ...(platform
      ? [{ id: `platforms;android-${platform}`, path: `platforms/android-${platform}` }]
      : []),
    ...(tools ? [{ id: `build-tools;${tools}`, path: `build-tools/${tools}` }] : []),
    ...(ndk ? [{ id: `ndk;${ndk}`, path: `ndk/${ndk}` }] : []),
  ];
}

/** Which of them are not in the SDK. `exists` is handed a path inside it. */
export function missingPackages(wanted, exists) {
  return wanted.filter((one) => !exists(one.path)).map((one) => one.id);
}

/**
 * Whether `android/` has to be generated again: it is not there, or `app.json` or the app's
 * dependencies changed after it was. Generated, never edited (`apps/mobile/.gitignore`), so
 * making it again loses nothing.
 */
export function prebuildNeeded({ project, config, dependencies }) {
  if (project === undefined) return true;
  return (config ?? 0) > project || (dependencies ?? 0) > project;
}

/**
 * When the config a prebuild reads last changed: `app.json`, `app.config.js`, and the config
 * plugins in `plugins/` with the sources they copy into the project. A copied source changed after
 * the project was made stays as it was in the build otherwise: the notification extension that
 * still read the phone's one seal key (4 November 2026), so every push sealed to a workspace's
 * own key showed the fixed words.
 */
export function configTime(mobile, { mtime, filesUnder }) {
  const files = [
    `${mobile}/app.json`,
    `${mobile}/app.config.js`,
    ...filesUnder(`${mobile}/plugins`),
  ];
  return Math.max(0, ...files.map((file) => mtime(file) ?? 0));
}

const LOOPBACK = /^(https?:\/\/)(127\.0\.0\.1|localhost|\[::1\])(?=[:/]|$)/i;

/**
 * The server's address as this device can reach it. An emulator reaches the Mac's loopback as
 * `10.0.2.2`; a phone cannot reach it at all, which is `undefined` and the caller's to say.
 */
export function serverForDevice(server, device) {
  if (!LOOPBACK.test(server)) return server;
  return device.emulator ? server.replace(LOOPBACK, "$110.0.2.2") : undefined;
}

/** What a launch carries to the app, the same link `pnpm phone` hands an iPhone. */
export function pairLink(code, server) {
  return `chips://pair?${new URLSearchParams({ pair: code, v: "1", lan: server })}`;
}

/** Gradle's own account of a failure: what went wrong, without the advice to run it with --stacktrace. */
export function gradleFailure(output) {
  const lines = output.split("\n");
  const start = lines.findIndex((line) => line.startsWith("* What went wrong:"));
  if (start === -1) return lines.filter((line) => line.trim() !== "").slice(-8);
  const end = lines.findIndex((line, at) => at > start && line.startsWith("* Try:"));
  return lines
    .slice(start + 1, end === -1 ? start + 12 : end)
    .map((line) => line.trimEnd())
    .filter((line) => line !== "");
}
