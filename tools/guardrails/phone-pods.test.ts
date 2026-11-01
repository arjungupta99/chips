/**
 * `pnpm phone doctor`'s Pods check, without CocoaPods (`tools/phone/pods.mjs`): the pods the
 * project lists against the pods it installed. On 16 September 2026 the check read only the list,
 * said every dependency was in the build while `ios/Pods` was gone, and the build failed at a
 * missing `Pods-Chips.release.xcconfig`.
 */

import { describe, expect, it } from "vitest";
import { podsSandbox } from "../phone/pods.mjs";

const LOCK = "PODS:\n  - ExpoHaptics (15.0.7)\n\nCOCOAPODS: 1.16.2\n";

describe("the installed pods", () => {
  it("are installed when Pods/Manifest.lock is the same file as Podfile.lock", () => {
    expect(podsSandbox(LOCK, LOCK)).toBe("installed");
  });

  it("are missing when the project lists pods and Pods/ is not there", () => {
    expect(podsSandbox(LOCK, undefined)).toBe("missing");
  });

  it("are stale when Pods/ was installed from another lockfile", () => {
    expect(podsSandbox(LOCK, LOCK.replace("15.0.7", "15.0.6"))).toBe("stale");
  });

  it("were never linked when there is no Podfile.lock", () => {
    expect(podsSandbox(undefined, undefined)).toBe("unlinked");
  });
});
