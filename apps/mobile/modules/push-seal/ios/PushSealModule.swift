import ExpoModulesCore
import Foundation
import Security

/**
 * The key the words of a push are sealed to (ADR 0158).
 *
 * An agent's @ reaches the lock screen through Expo's push service and Apple's. The server seals
 * what it says to a key this phone made, and the app's notification extension
 * (`plugins/push-seal/NotificationService.swift`) opens it there. So the key lives in a keychain
 * group the app and the extension share, readable after the first unlock since the extension runs
 * while the phone is locked, and never leaves this phone but once, to the server it registers
 * with.
 *
 * `sealKey()` makes the key the first time and answers the same one after. Nil when the keychain
 * would not keep it: a build without the group, which then gets fixed words.
 */
public class PushSealModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChipsPushSeal")

    Function("sealKey") { () -> String? in
      SealKeychain.key()?.base64EncodedString()
    }
  }
}

/** The key in the shared keychain. Read the same way by the extension: keep the two in step. */
enum SealKeychain {
  static let service = "chat.chips.push-seal"
  static let account = "seal-key"

  /** `<team>.chat.chips.app.shared`, which the config plugin writes into Info.plist. */
  static var group: String? {
    Bundle.main.object(forInfoDictionaryKey: "ChipsKeychainGroup") as? String
  }

  static func key() -> Data? {
    if let kept = read() { return kept }
    var bytes = Data(count: 32)
    let made = bytes.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 32, $0.baseAddress!) }
    guard made == errSecSuccess, let group else { return nil }
    let item: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: group,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
      kSecValueData as String: bytes,
    ]
    return SecItemAdd(item as CFDictionary, nil) == errSecSuccess ? bytes : nil
  }

  private static func read() -> Data? {
    guard let group else { return nil }
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecAttrAccessGroup as String: group,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var found: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &found) == errSecSuccess,
          let data = found as? Data, data.count == 32 else { return nil }
    return data
  }
}
