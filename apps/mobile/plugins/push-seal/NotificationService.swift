import CryptoKit
import Foundation
import Security
import UserNotifications

/**
 * Opens the words of a push sealed to this phone (ADR 0158).
 *
 * The server pushes an agent's @ with fixed words, "A message for you", and the real ones in
 * `data.sealed`: AES-256-GCM under the key this phone registered, as one base64 string of nonce,
 * ciphertext and tag (`server/src/application/seal.ts`). Expo puts a push's `data` under `body`
 * in what iOS hands over. This reads the key from the keychain group the app shares
 * (`modules/push-seal`), opens the words and shows them: who said it, where, and what.
 *
 * The key is the one the push's device has (`data.device_id`, this phone in that workspace), when
 * it has one of its own; the phone's one key from before, only when it hasn't. A server holding
 * that old key can't open, or seal words that open as, another workspace's push once that
 * workspace has its own key (the stranger review, 4 November 2026).
 *
 * Anything that doesn't open shows the server's fixed words for a message, whatever the push said
 * (SEC-29): anyone who can push to this phone through Expo could have written them, and they would
 * read as Chips's. A push sent without `mutable-content` never reaches here, so only Expo asking
 * for the server's access token (its Enhanced Security) keeps those off the lock screen.
 */
class NotificationService: UNNotificationServiceExtension {
  private var deliver: ((UNNotificationContent) -> Void)?
  private var shown: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    deliver = contentHandler
    let content = request.content.mutableCopy() as? UNMutableNotificationContent
    shown = content
    if let content {
      let words = Self.opened(request.content.userInfo) ?? Self.fixed(content.title)
      content.title = words.title
      content.subtitle = ""
      content.body = words.body
    }
    contentHandler(content ?? request.content)
  }

  override func serviceExtensionTimeWillExpire() {
    if let deliver, let shown { deliver(shown) }
  }

  private struct Words: Decodable {
    let title: String
    let body: String
  }

  /**
   * What a push that doesn't open shows: the server's fixed words for a message, "A message for
   * you" for an @ and "A new message" for the rest (`notify-message.ts`). Keep the two in step.
   */
  private static func fixed(_ title: String) -> Words {
    let said = title == "A message for you" ? title : "A new message"
    return Words(title: said, body: "Open Chips to read it.")
  }

  private static func opened(_ info: [AnyHashable: Any]) -> Words? {
    // Expo puts a push's data under `body`; a push sent to APNs by hand may put it at the top.
    let data = info["body"] as? [String: Any] ?? [:]
    let deviceId = (data["device_id"] ?? info["device_id"]) as? String
    guard let sealed = (data["sealed"] ?? info["sealed"]) as? String,
          let combined = Data(base64Encoded: sealed),
          let key = SealKeychain.read(deviceId) ?? SealKeychain.read(nil),
          let box = try? AES.GCM.SealedBox(combined: combined),
          let plain = try? AES.GCM.open(box, using: SymmetricKey(data: key)) else { return nil }
    return try? JSONDecoder().decode(Words.self, from: plain)
  }
}

/** The keys, read as the app's module keeps them (`modules/push-seal`): keep the two in step. */
enum SealKeychain {
  /** A device's own key, or with no device the phone's one key from before. */
  static func read(_ deviceId: String?) -> Data? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "ChipsKeychainGroup") as? String
    else { return nil }
    let account = deviceId.map { $0.isEmpty ? "seal-key" : "seal-key.\($0)" } ?? "seal-key"
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "chat.chips.push-seal",
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
