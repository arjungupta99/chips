/**
 * `chips build mobile a`'s decisions, without an emulator: the device, the SDK, the native
 * project, the address and Gradle's words (`tools/phone/android-plan.mjs`).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  chooseDevice,
  devicesFrom,
  gradleFailure,
  missingPackages,
  pairLink,
  prebuildNeeded,
  sdkWanted,
  serverForDevice,
} from "../phone/android-plan.mjs";

const LISTING = `List of devices attached
emulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:2
R5CT1234ABC            device usb:1-1 product:e3q model:SM_S928B device:e3q transport_id:3
0A1B2C3D               unauthorized usb:1-2 transport_id:4
`;

describe("the device", () => {
  const devices = devicesFrom(LISTING);

  it("reads adb's listing: serial, state, model, and whether it is an emulator", () => {
    expect(devices).toEqual([
      { serial: "emulator-5554", state: "device", model: "sdk_gphone64_arm64", emulator: true },
      { serial: "R5CT1234ABC", state: "device", model: "SM_S928B", emulator: false },
      { serial: "0A1B2C3D", state: "unauthorized", model: "0A1B2C3D", emulator: false },
    ]);
  });

  it("takes a phone before an emulator, and the one named before either", () => {
    expect(chooseDevice(devices, undefined)?.serial).toBe("R5CT1234ABC");
    expect(chooseDevice(devices, "emulator-5554")?.serial).toBe("emulator-5554");
  });

  it("never takes a device adb cannot talk to", () => {
    expect(chooseDevice(devices, "0A1B2C3D")).toBeUndefined();
    expect(chooseDevice(devicesFrom("List of devices attached\n\n"), undefined)).toBeUndefined();
  });
});

describe("the SDK", () => {
  it("wants what this React Native's own catalogue names", () => {
    const catalogue = readFileSync(
      fileURLToPath(
        new URL(
          "../../apps/mobile/node_modules/react-native/gradle/libs.versions.toml",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    const ids = sdkWanted(catalogue).map((one) => one.id);
    expect(ids).toContain("platform-tools");
    expect(ids.some((id) => /^platforms;android-\d+$/.test(id))).toBe(true);
    expect(ids.some((id) => /^build-tools;\d+\.\d+\.\d+$/.test(id))).toBe(true);
    expect(ids.some((id) => /^ndk;\d+\.\d+\.\d+$/.test(id))).toBe(true);
  });

  it("says which packages are missing, by the ids sdkmanager takes", () => {
    const wanted = sdkWanted(
      'compileSdk = "36"\nbuildTools = "36.0.0"\nndkVersion = "27.1.12297006"\n',
    );
    const present = new Set(["platform-tools/adb", "emulator/emulator", "platforms/android-36"]);
    expect(missingPackages(wanted, (path) => present.has(path))).toEqual([
      "build-tools;36.0.0",
      "ndk;27.1.12297006",
    ]);
  });
});

describe("the native project", () => {
  it("is made again when it is missing, or older than app.json or the dependencies", () => {
    expect(prebuildNeeded({ project: undefined, config: 1, dependencies: 1 })).toBe(true);
    expect(prebuildNeeded({ project: 10, config: 11, dependencies: 5 })).toBe(true);
    expect(prebuildNeeded({ project: 10, config: 5, dependencies: 11 })).toBe(true);
    expect(prebuildNeeded({ project: 10, config: 5, dependencies: 5 })).toBe(false);
  });
});

describe("the server, as the device reaches it", () => {
  const emulator = { serial: "emulator-5554", state: "device", model: "x", emulator: true };
  const phone = { serial: "R5CT1234ABC", state: "device", model: "x", emulator: false };

  it("is the Mac's loopback as 10.0.2.2 from an emulator", () => {
    expect(serverForDevice("http://127.0.0.1:4431", emulator)).toBe("http://10.0.2.2:4431");
    expect(serverForDevice("http://localhost:4434/", emulator)).toBe("http://10.0.2.2:4434/");
  });

  it("is unreachable from a phone when it is loopback, and untouched when it is not", () => {
    expect(serverForDevice("http://127.0.0.1:4431", phone)).toBeUndefined();
    expect(serverForDevice("https://mini.tail1234.ts.net", phone)).toBe(
      "https://mini.tail1234.ts.net",
    );
    expect(serverForDevice("http://100.64.0.7:4431", emulator)).toBe("http://100.64.0.7:4431");
  });

  it("goes to the app as the link pnpm phone hands an iPhone", () => {
    expect(pairLink("ABC-234", "http://10.0.2.2:4434")).toBe(
      "chips://pair?pair=ABC-234&v=1&lan=http%3A%2F%2F10.0.2.2%3A4434",
    );
  });
});

describe("a Gradle failure", () => {
  it("is what Gradle says went wrong, without the advice after it", () => {
    const output = [
      "> Task :app:compileReleaseKotlin FAILED",
      "",
      "FAILURE: Build failed with an exception.",
      "",
      "* What went wrong:",
      "Execution failed for task ':app:createBundleReleaseJsAndAssets'.",
      "> Process 'command 'node'' finished with non-zero exit value 1",
      "",
      "* Try:",
      "> Run with --stacktrace option to get the stack trace.",
    ].join("\n");
    expect(gradleFailure(output)).toEqual([
      "Execution failed for task ':app:createBundleReleaseJsAndAssets'.",
      "> Process 'command 'node'' finished with non-zero exit value 1",
    ]);
  });

  it("is the last lines when Gradle never got as far as saying", () => {
    expect(gradleFailure("one\ntwo\n\nthree\n")).toEqual(["one", "two", "three"]);
  });
});
