/**
 * Whether the pods the iOS project lists are the pods it has installed. Pure, so it is tested
 * (`tools/guardrails/phone-pods.test.ts`) without CocoaPods.
 *
 * `Podfile.lock` says which pods the project is linked against. `Pods/Manifest.lock` is the copy
 * `pod install` leaves inside what it installed, and CocoaPods' own build phase compares the two.
 * Reading only the first is how the preflight said "every dependency with a native side is in the
 * build" on 16 September 2026 while `ios/Pods` did not exist. The build stopped a minute in, at
 * `Pods-Chips.release.xcconfig`, a file only `pod install` writes.
 */

/**
 * `unlinked`: no `Podfile.lock`, so `pod install` has never run for this project.
 * `missing`: the lockfile is there and `Pods/` is not.
 * `stale`: `Pods/` was installed from a different lockfile.
 * `installed`: the two agree.
 */
export function podsSandbox(podfileLock, manifestLock) {
  if (podfileLock === undefined) return "unlinked";
  if (manifestLock === undefined) return "missing";
  return podfileLock === manifestLock ? "installed" : "stale";
}
