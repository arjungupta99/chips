/**
 * `pnpm phone testflight` (the first-run build plan, FR7): the app archived with Xcode on this Mac,
 * as `pnpm phone` builds it, signed by the team and sent to App Store Connect, from where
 * TestFlight puts it on the phone. An App Store Connect API key signs and sends it when there is
 * one (`apiKeyFrom`), and Xcode's own account when there is not (17 October 2026, Arjun: "fix my
 * Xcode TestFlight so that new builds can be pushed to my phone"; on 15 October it stopped at an
 * `.ipa` nobody sent; on 26 October Xcode stopped keeping his Apple ID). `--export` sends the
 * archive the last run made, without archiving again: for an upload that failed after the
 * archive's quarter of an hour.
 *
 * Pure, so it is tested without Xcode (`tools/guardrails/phone-testflight.test.ts`).
 */

/** Where the archive and Xcode's upload logs land, under `apps/mobile/ios`, generated and ignored. */
export const TESTFLIGHT_DIR = "build/testflight";

/**
 * The build number, from the clock: TestFlight refuses a build number it has seen for the same
 * version, and a minute's resolution rises with every build. `202610150215` for 02:15 UTC on
 * 15 October 2026.
 */
export function buildNumber(now = new Date()) {
  const two = (n) => String(n).padStart(2, "0");
  return [
    now.getUTCFullYear(),
    two(now.getUTCMonth() + 1),
    two(now.getUTCDate()),
    two(now.getUTCHours()),
    two(now.getUTCMinutes()),
  ].join("");
}

/**
 * Xcode's export options for App Store Connect: signed by the team and uploaded. The build number
 * is the one stamped before the archive, so Xcode is told to leave it alone. The app's record in
 * App Store Connect has to be there already: Xcode 26 does not make one (`uploadFailure`).
 */
export function exportOptions(team) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>upload</string>
  <key>teamID</key>
  <string>${team}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>uploadSymbols</key>
  <true/>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
</dict>
</plist>
`;
}

/**
 * Where the App Store Connect API key's two IDs are kept, under the home folder: `{"keyId": "…",
 * "issuerId": "…"}`. The key itself is the `.p8` App Store Connect lets its maker download once,
 * in `~/.appstoreconnect/private_keys/` where Apple's tools look for it, named as it came. Neither
 * ID is a secret; the key is, and it is only ever named by its path.
 */
export const API_KEY_CONFIG = ".appstoreconnect/chips.json";

/**
 * The API key that config names, or nothing: no config, one that is not JSON, or IDs that are not
 * App Store Connect's (a Key ID is ten capitals and digits, an Issuer ID a UUID). An export with
 * it needs no account in Xcode: on 26 October 2026 Xcode dropped his Apple ID at each restart, and
 * every export failed "Failed to Use Accounts".
 */
export function apiKeyFrom(config, home) {
  let read;
  try {
    read = JSON.parse(config);
  } catch {
    return undefined;
  }
  const keyId = typeof read?.keyId === "string" ? read.keyId.trim() : "";
  const issuerId = typeof read?.issuerId === "string" ? read.issuerId.trim().toLowerCase() : "";
  if (!/^[A-Z0-9]{10}$/.test(keyId)) return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(issuerId))
    return undefined;
  return { keyId, issuerId, path: `${home}/.appstoreconnect/private_keys/AuthKey_${keyId}.p8` };
}

/** What tells `xcodebuild` to sign in with the key rather than Xcode's account: nothing, with none. */
export function keyArgs(key) {
  if (key === undefined) return [];
  return [
    "-authenticationKeyPath",
    key.path,
    "-authenticationKeyID",
    key.keyId,
    "-authenticationKeyIssuerID",
    key.issuerId,
  ];
}

/** `xcodebuild` archiving the app for any iPhone, its provisioning updated as a build's is. */
export function archiveArgs(archivePath, key) {
  return [
    "-workspace",
    "Chips.xcworkspace",
    "-scheme",
    "Chips",
    "-configuration",
    "Release",
    "-destination",
    "generic/platform=iOS",
    "-archivePath",
    archivePath,
    "-allowProvisioningUpdates",
    ...keyArgs(key),
    "COMPILER_INDEX_STORE_ENABLE=NO",
    "archive",
  ];
}

/** `xcodebuild` exporting that archive by the options above, which send it to App Store Connect. */
export function exportArgs(archivePath, optionsPath, outDir, key) {
  return [
    "-exportArchive",
    "-archivePath",
    archivePath,
    "-exportOptionsPlist",
    optionsPath,
    "-exportPath",
    outDir,
    "-allowProvisioningUpdates",
    ...keyArgs(key),
  ];
}

/**
 * Whether Xcode has an Apple ID to sign and send with (`defaults read com.apple.dt.Xcode
 * DVTDeveloperAccountManagerAppleIDLists`): the upload goes as that account, and the export makes
 * the Apple Distribution certificate with it when this Mac has none. Without one the export fails
 * after the archive's quarter of an hour: "No signing certificate "iOS Distribution" found", "No
 * Accounts" (15 October 2026).
 */
export function signedInToXcode(accounts) {
  // A list with something in it: `( { identifier = "…"; … } )`, not `( )`.
  return /=\s*\(\s*[^)\s]/.test(accounts);
}

/** What to do when it is not: the Apple ID the team is under, signed in to Xcode, or a key. */
export const XCODE_ACCOUNT_FIX =
  'Xcode → Settings → Accounts → + → Apple Account: the Apple ID in the Developer Program.\nXcode signs and uploads as that account. Or an App Store Connect API key (Users and\nAccess → Integrations → Team Keys, Admin): its .p8 in ~/.appstoreconnect/private_keys/,\nits IDs in ~/.appstoreconnect/chips.json as {"keyId": "…", "issuerId": "…"}.\nThen `pnpm phone testflight --export` sends the archive already made.';

/** The key's config is there and its `.p8` is not: what the preflight says. */
export function keyMissing(key) {
  return `the API key ${key.keyId} has no file at ${key.path}`;
}

/**
 * What a failed upload means, in words that say what to do, from `xcodebuild`'s output. The first
 * one is the app's record: App Store Connect takes a build only for an app it has a record of, and
 * Xcode 26 makes none. It says "Error Downloading App Information", and its log says
 * `missingApp(bundleId: "chat.chips.app")` (17 October 2026).
 */
export function uploadFailure(out) {
  if (/Error Downloading App Information|missingApp|App Name you entered is already/i.test(out)) {
    return [
      "App Store Connect has no app for chat.chips.app yet, and Xcode does not make one. Once:",
      "  appstoreconnect.apple.com → Apps → + → New App: iOS, a name (Chips, or another if",
      "  that is taken), bundle ID chat.chips.app, SKU chat.chips.app, full access",
      "Then `pnpm phone testflight --export` sends the archive already made.",
    ];
  }
  if (
    /NOT_AUTHORIZED|authentication ?key|Authentication credentials are missing or invalid/i.test(
      out,
    )
  ) {
    return [
      "App Store Connect refused the API key. Check its Key ID and Issuer ID in",
      "~/.appstoreconnect/chips.json against Users and Access → Integrations → Team Keys, and that",
      "the key is not revoked. Then `pnpm phone testflight --export` sends the archive already made.",
    ];
  }
  if (
    /No Accounts|Failed to Use Accounts|not signed in|Unable to authenticate|session has expired/i.test(
      out,
    )
  ) {
    return [
      "Xcode's Apple ID could not sign in to App Store Connect.",
      ...XCODE_ACCOUNT_FIX.split("\n"),
    ];
  }
  if (/bundle version must be higher|has already been (used|uploaded)|ITMS-90189/i.test(out)) {
    return [
      "App Store Connect already has this build number. A new archive takes a new one:",
      "  pnpm phone testflight",
    ];
  }
  return [
    ...out.trim().split("\n").slice(-8),
    "The archive is kept: `pnpm phone testflight --export` sends it again.",
  ];
}

/** What happens next, and the two things only the account holder does, once. */
export function uploadWords(build) {
  return [
    `Build ${build} is uploaded to App Store Connect.`,
    "Apple processes it for five to thirty minutes, then TestFlight has it. The first time only:",
    "  App Store Connect → Chips → TestFlight → Internal Testing → +: a group with you in it,",
    "  automatic distribution on, so every build after this one reaches the phone by itself",
    "  On the iPhone: TestFlight from the App Store, signed in with that Apple ID",
    "If the build says Missing Compliance, answer its encryption question in App Store Connect.",
  ];
}
