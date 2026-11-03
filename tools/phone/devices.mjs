/**
 * A phone as CoreDevice lists it (`xcrun devicectl list devices`): the identifier `devicectl`
 * installs with, its state, and whether Xcode can reach it now. Pure, so it is tested
 * (`tools/guardrails/phone-devices.test.ts`) without a phone.
 *
 * Why it exists: a phone Xcode was paired with stays listed while it is away, and this tool took
 * it as there. On 16 October 2026 the phone was on 5G away from home: `pnpm phone build` ticked
 * "iPhone", and Xcode then said only "Unable to find a destination matching the provided
 * destination specifier". CoreDevice said "unavailable", and it is what `xcodebuild` goes by:
 * `xctrace` lists the phone under "Devices Offline" even while a build reaches it over the Wi-Fi.
 */

/** The phone's row, by the name `xctrace` gave it. A phone CoreDevice does not list is not refused. */
export function coreDeviceRowOf(listText, name) {
  const lines = listText.split("\n");
  const header = lines.find((line) => line.startsWith("Name")) ?? "";
  const row = lines.find((line) => line.startsWith(name)) ?? "";
  // Each cell is read where its header starts, up to the next run of spaces. Splitting the whole
  // row on spaces lost a column a phone leaves empty: with Xcode 27 it has no hostname, so its
  // state was taken for its identifier (2 November 2026).
  const cell = (column) => {
    const at = header.indexOf(column);
    return at < 0 ? "" : (row.slice(at).split(/\s{2,}/)[0] ?? "").trim();
  };
  // Xcode 27 writes `<udid> (UDID)`; `devicectl` takes the UDID.
  const identifier = cell("Identifier").split(" ")[0] || undefined;
  const state = cell("State");
  return { identifier, state, reachable: !/^unavailable/.test(state) };
}

/**
 * Which way `pnpm phone ship` sends a build (Arjun, 18 October 2026: "prefer direct app push when
 * you detect my iphone on wifi, else use Testflight. I think Test flight is feeling slow"). A
 * phone CoreDevice can reach now gets it installed from this Mac, minutes after it compiles; any
 * other gets it through TestFlight, which reaches it wherever it is, half an hour or more later.
 * Unlike `coreDeviceRowOf`, a phone CoreDevice does not list is not taken as there: `devicectl`
 * could not install on it. `details` is `devicectl device info details`, which says how.
 */
export function shipRoute(row, details = "") {
  if (row.identifier === undefined || !row.reachable) return { direct: false };
  const transport = /transportType:\s*(\w+)/.exec(details)?.[1];
  const via =
    transport === "wired"
      ? "plugged in"
      : transport === "localNetwork"
        ? "on this Mac's Wi-Fi"
        : "in reach";
  return { direct: true, via };
}
