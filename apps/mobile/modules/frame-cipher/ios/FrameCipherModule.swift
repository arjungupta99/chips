import ExpoModulesCore

/**
 * The phone's crypto, in CryptoKit (`Primitives.swift`), handed to JavaScript one synchronous call
 * at a time.
 *
 * It began as AES-GCM for the tunnel (ADR 0152): every frame through the relay is sealed or opened
 * here. The phone did that in JavaScript until 12 October 2026, at about 400 ms a megabyte on his
 * iPhone (ADR 0044), which a clip through the relay paid with the whole JavaScript thread. The
 * native cipher `expo-crypto` offers was slower still: its answer comes back as an object and the
 * bytes through a second crossing. Here the bytes go in as `Uint8Array`s and come back as one
 * `ArrayBuffer`, and nothing else crosses.
 *
 * X25519, Ed25519 and HMAC-SHA-256 came after, in the same shape, for a different reason: the
 * app tells App Store Connect its encryption is the operating system's, and with these it is
 * (ADR 0277).
 *
 * Synchronous on purpose: a 32 KiB frame or a signature costs CryptoKit microseconds, less than a
 * hop to another thread and back would.
 */
public class FrameCipherModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChipsFrameCipher")

    Function("seal") {
      (key: Data, iv: Data, additionalData: Data, plaintext: Data) throws -> NativeArrayBuffer in
      try arrayBuffer(
        Primitives.seal(key: key, iv: iv, additionalData: additionalData, plaintext: plaintext))
    }

    Function("open") {
      (key: Data, iv: Data, additionalData: Data, sealed: Data) throws -> NativeArrayBuffer in
      try arrayBuffer(
        Primitives.open(key: key, iv: iv, additionalData: additionalData, sealed: sealed))
    }

    Function("x25519Generate") { () throws -> NativeArrayBuffer in
      try arrayBuffer(Primitives.x25519Generate())
    }

    Function("x25519Derive") { (privateKey: Data, publicKey: Data) throws -> NativeArrayBuffer in
      try arrayBuffer(Primitives.x25519Derive(privateKey: privateKey, publicKey: publicKey))
    }

    Function("ed25519Generate") { () throws -> NativeArrayBuffer in
      try arrayBuffer(Primitives.ed25519Generate())
    }

    Function("ed25519Sign") { (privateKey: Data, data: Data) throws -> NativeArrayBuffer in
      try arrayBuffer(Primitives.ed25519Sign(privateKey: privateKey, data: data))
    }

    Function("ed25519Verify") { (publicKey: Data, signature: Data, data: Data) -> Bool in
      Primitives.ed25519Verify(publicKey: publicKey, signature: signature, data: data)
    }

    Function("hmacSha256Sign") { (key: Data, data: Data) throws -> NativeArrayBuffer in
      try arrayBuffer(Primitives.hmacSha256Sign(key: key, data: data))
    }

    Function("hmacSha256Verify") { (key: Data, mac: Data, data: Data) -> Bool in
      Primitives.hmacSha256Verify(key: key, mac: mac, data: data)
    }
  }
}

/// An empty `Data` has no base address to copy from, and an empty frame is a frame.
private func arrayBuffer(_ data: Data) throws -> NativeArrayBuffer {
  if data.isEmpty { return NativeArrayBuffer.allocate(size: 0) }
  return try NativeArrayBuffer.copy(data: data)
}
