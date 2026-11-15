/**
 * Which build this is, as About Chips (ADR 0295) and Send feedback's form say it: the app's
 * version, its build number and the commit it was built from, which `pnpm phone` bakes in
 * (`EXPO_PUBLIC_CHIPS_COMMIT`), so what is on a phone can be told apart from what is on main. The
 * version moves only for the App Store (1.0.0 from 1 November 2026, when Chips went public): Apple
 * reviews the first TestFlight build of a version and later ones reach testers at once. The build
 * number is the one that rises (`tools/phone/testflight.mjs`), so it is said as TestFlight says it,
 * in brackets after the version.
 */

import Constants from "expo-constants";
import { Platform } from "react-native";
import { BUILD_COMMIT } from "../build";

/** This build: its version, its build number where there is one, and its commit. */
export interface AppBuild {
  readonly version: string;
  readonly build: string | undefined;
  readonly commit: string;
}

export function appBuild(): AppBuild {
  const build = Constants.platform?.ios?.buildNumber;
  return {
    version: Constants.expoConfig?.version ?? "0.0.0",
    build: build === null || build === undefined || build === "" ? undefined : build,
    commit: BUILD_COMMIT === undefined || BUILD_COMMIT === "" ? "dev" : BUILD_COMMIT,
  };
}

/**
 * What this app is, for the computer to know who is behind (everything in step): `chips-iphone`
 * or `chips-ipad`, with this build's version.
 */
export function appClient(): { readonly name: string; readonly version: string } {
  const name =
    Platform.OS === "ios"
      ? Platform.isPad
        ? "chips-ipad"
        : "chips-iphone"
      : `chips-${Platform.OS}`;
  return { name, version: appBuild().version };
}

/**
 * The version, the build number and the commit, as the capsule says them: "1.0.0 (202611010718) ·
 * b888e96", or "1.0.0 · dev" where there is no build number, on the web and in Expo Go.
 */
export function buildWords(
  version: string | undefined,
  build: string | null | undefined,
  commit: string | undefined,
): string {
  const number = build === null || build === undefined || build === "" ? "" : ` (${build})`;
  return `${version ?? "0.0.0"}${number} · ${commit === undefined || commit === "" ? "dev" : commit}`;
}

/** The system, as a bug report says it after the build: "iOS 26.1". */
export function systemWords(): string {
  if (Platform.OS === "ios") return `${Platform.isPad ? "iPadOS" : "iOS"} ${Platform.Version}`;
  return Platform.OS === "android" ? "Android" : "web";
}
