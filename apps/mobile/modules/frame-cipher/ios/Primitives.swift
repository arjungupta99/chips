import CryptoKit
import Foundation

/**
 * Every primitive the phone's `crypto.subtle` hands to CryptoKit, as bytes in and bytes out.
 *
 * Nothing of Expo is in this file, so the Mac compiles it beside `interop/main.swift` and holds it
 * against `@chipschat/subtle` (`src/runtime/cryptokit.vitest.ts`). `FrameCipherModule.swift` hands
 * each one to JavaScript, in one synchronous call.
 *
 * AES-GCM seals and opens the relay's frames (ADR 0152). X25519, Ed25519 and HMAC-SHA-256 joined
 * it so that the iPhone app's encryption is all Apple's operating system's, which is what the app
 * tells App Store Connect (ADR 0277).
 *
 * Keys cross as the bytes `@chipschat/subtle` keeps (`packages/subtle/src/keys.ts`): an X25519
 * private key is its thirty-two-byte scalar and an Ed25519 one its thirty-two-byte seed, which is
 * what PKCS#8 wraps for either curve and what CryptoKit's `rawRepresentation` is. So a key a phone
 * made in JavaScript before ADR 0277, kept in the Keychain as PKCS#8, signs here unchanged.
 */
enum Primitives {
  static let tagBytes = 16

  // MARK: AES-GCM

  /// The ciphertext with its sixteen-byte tag after it, as WebCrypto returns it.
  static func seal(key: Data, iv: Data, additionalData: Data, plaintext: Data) throws -> Data {
    let box = try AES.GCM.seal(
      plaintext,
      using: SymmetricKey(data: key),
      nonce: AES.GCM.Nonce(data: iv),
      authenticating: additionalData
    )
    var sealed = Data(capacity: box.ciphertext.count + box.tag.count)
    sealed.append(box.ciphertext)
    sealed.append(box.tag)
    return sealed
  }

  /// Throws when the tag does not match, as WebCrypto does.
  static func open(key: Data, iv: Data, additionalData: Data, sealed: Data) throws -> Data {
    guard sealed.count >= tagBytes else { throw PrimitiveError.tooShort }
    let box = try AES.GCM.SealedBox(
      nonce: AES.GCM.Nonce(data: iv),
      ciphertext: sealed.prefix(sealed.count - tagBytes),
      tag: sealed.suffix(tagBytes)
    )
    return try AES.GCM.open(box, using: SymmetricKey(data: key), authenticating: additionalData)
  }

  // MARK: X25519

  /// A fresh pair: the private key's thirty-two bytes, then the public key's.
  static func x25519Generate() -> Data {
    let key = Curve25519.KeyAgreement.PrivateKey()
    return key.rawRepresentation + key.publicKey.rawRepresentation
  }

  /// Thirty-two shared bytes. A peer key that makes them all zero (a point of small order) is
  /// refused, as WebCrypto and `@noble/curves` refuse it: such a secret is known to everyone.
  static func x25519Derive(privateKey: Data, publicKey: Data) throws -> Data {
    let ours = try Curve25519.KeyAgreement.PrivateKey(rawRepresentation: privateKey)
    let theirs = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: publicKey)
    let shared = try ours.sharedSecretFromKeyAgreement(with: theirs).withUnsafeBytes { Data($0) }
    guard shared.reduce(0, |) != 0 else { throw PrimitiveError.noSharedSecret }
    return shared
  }

  // MARK: Ed25519

  /// A fresh pair: the private key's thirty-two-byte seed, then the public key's thirty-two bytes.
  static func ed25519Generate() -> Data {
    let key = Curve25519.Signing.PrivateKey()
    return key.rawRepresentation + key.publicKey.rawRepresentation
  }

  /// Sixty-four bytes. CryptoKit randomizes them, so the same key over the same bytes signs
  /// differently each time, and every one of them verifies as RFC 8032 has it.
  static func ed25519Sign(privateKey: Data, data: Data) throws -> Data {
    try Curve25519.Signing.PrivateKey(rawRepresentation: privateKey).signature(for: data)
  }

  /// False, never a throw, for a key or a signature that is malformed: WebCrypto answers so.
  static func ed25519Verify(publicKey: Data, signature: Data, data: Data) -> Bool {
    guard let key = try? Curve25519.Signing.PublicKey(rawRepresentation: publicKey) else {
      return false
    }
    return key.isValidSignature(signature, for: data)
  }

  // MARK: HMAC-SHA-256

  static func hmacSha256Sign(key: Data, data: Data) -> Data {
    Data(HMAC<SHA256>.authenticationCode(for: data, using: SymmetricKey(data: key)))
  }

  /// Compared in constant time by CryptoKit.
  static func hmacSha256Verify(key: Data, mac: Data, data: Data) -> Bool {
    HMAC<SHA256>.isValidAuthenticationCode(mac, authenticating: data, using: SymmetricKey(data: key))
  }
}

enum PrimitiveError: LocalizedError {
  case tooShort
  case noSharedSecret

  var errorDescription: String? {
    switch self {
    case .tooShort: return "A sealed frame is at least its sixteen-byte tag"
    case .noSharedSecret: return "That public key gives no shared secret"
    }
  }
}
