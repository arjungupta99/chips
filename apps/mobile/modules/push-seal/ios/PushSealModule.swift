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
 * `sealKey(deviceId)` makes a key the first time it is asked for that device, this phone's in one
 * workspace, and answers the same one after: each server holds only its own (the stranger review,
 * 4 November 2026). One key for the whole phone, as before, went to every server it joined, and any
 * of them could seal words that opened as another's. Asked with no device, it is that one key, for
 * a server still holding it. Nil when the keychain would not keep it: a build without the group,
 * which then gets fixed words.
 */
public class PushSealModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChipsPushSeal")

    Function("sealKey") { (deviceId: String?) -> String? in
      SealKeychain.key(for: deviceId)?.base64EncodedString()
    }
  }
}

/** The keys in the shared keychain. Read the same way by the extension: keep the two in step. */
enum SealKeychain {
  static let service = "chat.chips.push-seal"
  /** The phone's one key, from before each device had its own. */
  static let account = "seal-key"

  /** Where a device's own key is kept; the phone's one key when there is no device. */
  static func account(for deviceId: String?) -> String {
    guard let deviceId, !deviceId.isEmpty else { return account }
    return "\(account).\(deviceId)"
  }

  /** `<team>.chat.chips.app.shared`, which the config plugin writes into Info.plist. */
  static var group: String? {
    Bundle.main.object(forInfoDictionaryKey: "ChipsKeychainGroup") as? String
  }

  static func key(for deviceId: String?) -> Data? {
    let account = account(for: deviceId)
    if let kept = read(account) { return kept }
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

  private static func read(_ account: String) -> Data? {
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
