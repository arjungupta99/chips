/**
 * The app's window in a scene, as iOS 27 asks of every app built with its SDK (ADR 0259).
 *
 * Built with Xcode 27 the app opened and was stopped at once on iOS 27, before drawing anything:
 * UIKit traps an app that has not adopted the scene lifecycle
 * (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`, the iPhone Duo simulator, 2
 * November 2026). Expo 57 and React Native 0.86 make the window in the app delegate, so the scene
 * is made here, at each prebuild:
 *
 * - Info.plist declares one window scene, whose delegate is `SceneDelegate`, and no more than one;
 * - `SceneDelegate.swift` makes the window in the scene and starts React Native in it, with the
 *   launch options built from what the scene was opened with: a `chips://` link or a link to the
 *   relay (`applinks`), which is where React Native looks for the link the app was opened by;
 * - a link reaches the scene and not the app delegate, whether it opened the app or came while it
 *   runs, so the scene hands it to the app delegate's own two handlers, which hand it to Expo and
 *   to React Native as before. The link that opened the app goes first, before React Native
 *   starts: Expo keeps it as the link the router opens at, and without it a link that opened the
 *   app landed on Spaces (the iPhone Duo simulator, 2 November 2026);
 * - the app delegate makes the factory and no window.
 *
 * Nothing else changes: notifications, the device token and the app's state all still reach the
 * app delegate, and the modules find the window through the scene already.
 */

const fs = require("node:fs");
const path = require("node:path");
const {
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require("expo/config-plugins");

const FILE = "SceneDelegate.swift";

const SCENE_DELEGATE = `import React
import UIKit

/// The app's one window, made in its scene (\`plugins/with-scenes.js\`).
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let scene = scene as? UIWindowScene,
      let app = UIApplication.shared.delegate as? AppDelegate,
      let factory = app.reactNativeFactory
    else { return }
    let window = UIWindow(windowScene: scene)
    self.window = window
    app.window = window
    // The link the app was opened by, to the app delegate's handlers first, as iOS did before
    // scenes: Expo keeps it there as the link the router opens at.
    if let url = connectionOptions.urlContexts.first?.url {
      _ = app.application(UIApplication.shared, open: url, options: [:])
    } else if let activity = SceneDelegate.webLink(connectionOptions) {
      _ = app.application(UIApplication.shared, continue: activity) { _ in }
    }
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: SceneDelegate.launchOptions(connectionOptions))
  }

  /// A link to the relay (\`applinks\`) the scene was opened with.
  static func webLink(_ options: UIScene.ConnectionOptions) -> NSUserActivity? {
    return options.userActivities.first(where: { $0.activityType == NSUserActivityTypeBrowsingWeb })
  }

  /// What the scene was opened with, where React Native looks for the link the app was opened by.
  static func launchOptions(_ options: UIScene.ConnectionOptions) -> [UIApplication.LaunchOptionsKey: Any]? {
    if let url = options.urlContexts.first?.url {
      return [.url: url]
    }
    if let activity = webLink(options) {
      return [
        .userActivityDictionary: [
          UIApplication.LaunchOptionsKey.userActivityType.rawValue: activity.activityType,
          "UIApplicationLaunchOptionsUserActivityKey": activity,
        ] as [String: Any]
      ]
    }
    return nil
  }

  func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
    guard let app = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in contexts {
      _ = app.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let app = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = app.application(UIApplication.shared, continue: userActivity) { _ in }
  }
}
`;

/** The template's window, made in the app delegate; the scene makes it now. */
const WINDOW = `    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
`;

function withoutAppWindow(config) {
  return withAppDelegate(config, (mod) => {
    const source = mod.modResults.contents;
    if (source.includes("in its scene (`plugins/with-scenes.js`)")) return mod;
    if (!source.includes(WINDOW)) {
      throw new Error(
        "with-scenes: the app delegate no longer makes its window where this plugin expects. Read the template's AppDelegate.swift and move its window into SceneDelegate.swift again.",
      );
    }
    mod.modResults.contents = source.replace(
      WINDOW,
      "    // The window is made in its scene (`plugins/with-scenes.js`).\n",
    );
    return mod;
  });
}

function withSceneManifest(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return mod;
  });
}

function withSceneDelegateFile(config) {
  const written = withDangerousMod(config, [
    "ios",
    (mod) => {
      const name = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
      const dir = path.join(mod.modRequest.platformProjectRoot, name);
      fs.writeFileSync(path.join(dir, FILE), SCENE_DELEGATE);
      return mod;
    },
  ]);
  return withXcodeProject(written, (mod) => {
    const name = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    const filepath = `${name}/${FILE}`;
    if (!mod.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: name,
        project: mod.modResults,
      });
    }
    return mod;
  });
}

module.exports = (config) => withSceneDelegateFile(withSceneManifest(withoutAppWindow(config)));
