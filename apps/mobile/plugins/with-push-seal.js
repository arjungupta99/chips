/**
 * The phone's notification extension, for words sealed to it (ADR 0158).
 *
 * `ios/` is generated from `app.json` and never edited, so the extension is made here, at each
 * prebuild: a notification service extension target, `ChipsNotifications`, embedded in the app,
 * built from `push-seal/NotificationService.swift`. It opens what the server sealed to the key
 * `modules/push-seal` made, which both keep in one keychain group:
 *
 * - the app's entitlements list its own group first, which keeps where its other keychain items go
 *   as it was, then the shared one;
 * - the extension's list the shared one;
 * - both Info.plists name it as `ChipsKeychainGroup`, which is how the Swift finds it.
 *
 * Signed by the app's team (`ios.appleTeamId`), automatically, as the app is. The team and the
 * bundle id are whatever `app.config.js` resolved, and are written again at every prebuild, so an
 * `ios/` made for another team is signed for this one.
 */

const fs = require("node:fs");
const path = require("node:path");
const {
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require("expo/config-plugins");

const TARGET = "ChipsNotifications";
const SWIFT = "NotificationService.swift";
const INFO = `${TARGET}-Info.plist`;
const ENTITLEMENTS = `${TARGET}.entitlements`;

/** `<team>.<bundle id>.shared`: the group the app and the extension both read. */
function sharedGroup(config) {
  return `${config.ios.appleTeamId}.${config.ios.bundleIdentifier}.shared`;
}

function infoPlist(config, group) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>${config.name}</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <key>CFBundleShortVersionString</key>
  <string>${config.version ?? "1.0.0"}</string>
  <key>CFBundleVersion</key>
  <string>${config.ios.buildNumber ?? "1"}</string>
  <key>ChipsKeychainGroup</key>
  <string>${group}</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.usernotifications.service</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).NotificationService</string>
  </dict>
</dict>
</plist>
`;
}

function entitlementsPlist(group) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>keychain-access-groups</key>
  <array>
    <string>${group}</string>
  </array>
</dict>
</plist>
`;
}

/** A target's build settings, one for each configuration: Debug and Release. */
function settingsOf(project, target) {
  const list = project.pbxXCConfigurationList()[target.buildConfigurationList];
  const section = project.pbxXCBuildConfigurationSection();
  return list.buildConfigurations.map((one) => section[one.value].buildSettings);
}

/** The app target's build settings, for what the extension must match. */
function appSettings(project) {
  return settingsOf(project, project.getFirstTarget().firstTarget)[0];
}

/** The target, its files, and how it is built, on the first prebuild; its id. */
function addTarget(project, config) {
  const app = appSettings(project);
  const objects = project.hash.project.objects;
  // The library assumes both sections exist; a project with no extension yet has neither.
  objects.PBXTargetDependency ??= {};
  objects.PBXContainerItemProxy ??= {};

  const group = project.addPbxGroup([SWIFT, INFO, ENTITLEMENTS], TARGET, TARGET);
  const main = project.getFirstProject().firstProject.mainGroup;
  project.addToPbxGroup(group.uuid, main);

  const bundleId = `${config.ios.bundleIdentifier}.notifications`;
  const target = project.addTarget(TARGET, "app_extension", TARGET, bundleId);
  project.addBuildPhase([SWIFT], "PBXSourcesBuildPhase", "Sources", target.uuid);
  project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target.uuid);
  project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", target.uuid);

  for (const build of settingsOf(project, target.pbxNativeTarget)) {
    Object.assign(build, {
      CODE_SIGN_ENTITLEMENTS: `${TARGET}/${ENTITLEMENTS}`,
      CODE_SIGN_STYLE: "Automatic",
      DEVELOPMENT_TEAM: config.ios.appleTeamId,
      INFOPLIST_FILE: `${TARGET}/${INFO}`,
      IPHONEOS_DEPLOYMENT_TARGET: app.IPHONEOS_DEPLOYMENT_TARGET ?? "16.4",
      PRODUCT_BUNDLE_IDENTIFIER: bundleId,
      SWIFT_VERSION: "5.0",
      TARGETED_DEVICE_FAMILY: app.TARGETED_DEVICE_FAMILY ?? '"1,2"',
    });
  }
  return target.uuid;
}

/**
 * Whose the target is: the app's team, and a bundle id under the app's, which Xcode insists on for
 * an extension. Written at every prebuild, not only the first, because a target made for one team
 * is otherwise signed for it ever after.
 */
function nameTarget(project, config, uuid) {
  project.addTargetAttribute("DevelopmentTeam", config.ios.appleTeamId, { uuid });
  for (const build of settingsOf(project, project.pbxNativeTargetSection()[uuid])) {
    Object.assign(build, {
      DEVELOPMENT_TEAM: config.ios.appleTeamId,
      PRODUCT_BUNDLE_IDENTIFIER: `${config.ios.bundleIdentifier}.notifications`,
    });
  }
}

/** @param {import("expo/config").ExpoConfig} config */
function withPushSeal(config) {
  const group = sharedGroup(config);
  const own = `${config.ios.appleTeamId}.${config.ios.bundleIdentifier}`;

  let made = withInfoPlist(config, (mod) => {
    mod.modResults.ChipsKeychainGroup = group;
    return mod;
  });
  made = withEntitlementsPlist(made, (mod) => {
    // A group is its team's, by its prefix, and no other team can sign it: a group left by a
    // prebuild for another team goes.
    const groups = (mod.modResults["keychain-access-groups"] ?? []).filter(
      (one) => !/^[A-Z0-9]{10}\./.test(one) || one.startsWith(`${config.ios.appleTeamId}.`),
    );
    mod.modResults["keychain-access-groups"] = [
      ...new Set([own, ...groups.filter((one) => one !== own), group]),
    ];
    return mod;
  });
  made = withDangerousMod(made, [
    "ios",
    (mod) => {
      const folder = path.join(mod.modRequest.platformProjectRoot, TARGET);
      fs.mkdirSync(folder, { recursive: true });
      fs.copyFileSync(path.join(__dirname, "push-seal", SWIFT), path.join(folder, SWIFT));
      fs.writeFileSync(path.join(folder, INFO), infoPlist(config, group));
      fs.writeFileSync(path.join(folder, ENTITLEMENTS), entitlementsPlist(group));
      return mod;
    },
  ]);
  return withXcodeProject(made, (mod) => {
    const uuid = mod.modResults.findTargetKey(TARGET) ?? addTarget(mod.modResults, config);
    nameTarget(mod.modResults, config, uuid);
    return mod;
  });
}

module.exports = withPushSeal;
