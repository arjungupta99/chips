import CryptoKit
import ExpoModulesCore

/**
 * AES-GCM for the tunnel, in CryptoKit (ADR 0152): every frame through the relay is sealed or
 * opened here, in one synchronous call each way.
 *
 * The phone did it in JavaScript until 12 October 2026, at about 400 ms a megabyte on his
 * iPhone (ADR 0044), which a clip through the relay paid with the whole JavaScript thread. The
 * native cipher `expo-crypto` offers was slower still: its answer comes back as an object and the
 * bytes through a second crossing. Here the bytes go in as `Uint8Array`s and come back as one
 * `ArrayBuffer`, and nothing else crosses.
 *
 * Synchronous on purpose: a 32 KiB frame costs CryptoKit microseconds, less than a hop to another
 * thread and back would.
 */
public class FrameCipherModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChipsFrameCipher")

    /// The ciphertext with its sixteen-byte tag after it, as WebCrypto returns it.
    Function("seal") {
      (key: Data, iv: Data, additionalData: Data, plaintext: Data) throws -> NativeArrayBuffer in
      let box = try AES.GCM.seal(
        plaintext,
        using: SymmetricKey(data: key),
        nonce: AES.GCM.Nonce(data: iv),
        authenticating: additionalData
      )
      var sealed = Data(capacity: box.ciphertext.count + box.tag.count)
      sealed.append(box.ciphertext)
      sealed.append(box.tag)
      return try arrayBuffer(sealed)
    }

    /// Throws when the tag does not match, as WebCrypto does.
    Function("open") {
      (key: Data, iv: Data, additionalData: Data, sealed: Data) throws -> NativeArrayBuffer in
      guard sealed.count >= tagBytes else { throw TooShortException() }
      let box = try AES.GCM.SealedBox(
        nonce: AES.GCM.Nonce(data: iv),
        ciphertext: sealed.prefix(sealed.count - tagBytes),
        tag: sealed.suffix(tagBytes)
      )
      let plaintext = try AES.GCM.open(box, using: SymmetricKey(data: key), authenticating: additionalData)
      return try arrayBuffer(plaintext)
    }
  }
}

private let tagBytes = 16

/// An empty `Data` has no base address to copy from, and an empty frame is a frame.
private func arrayBuffer(_ data: Data) throws -> NativeArrayBuffer {
  if data.isEmpty { return NativeArrayBuffer.allocate(size: 0) }
  return try NativeArrayBuffer.copy(data: data)
}

internal final class TooShortException: Exception {
  override var reason: String {
    "A sealed frame is at least its sixteen-byte tag"
  }
}
