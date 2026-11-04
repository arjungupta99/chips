import Foundation

/**
 * `ios/Primitives.swift` on the Mac, for `src/runtime/cryptokit.vitest.ts` to hold against
 * `@chipschat/subtle`. The phone's CryptoKit and the Mac's are the same framework, so the bytes
 * that agree here are the bytes the phone makes.
 *
 * One request a line: the primitive's name, then its arguments in hex, `-` for an empty one. One
 * answer a line: `ok` and the bytes in hex (or `true` or `false`), or `error` and why.
 *
 * Outside `ios/` on purpose: the pod takes every Swift file under that folder.
 */

let digits = Array("0123456789abcdef".utf8)

func hex(_ data: Data) -> String {
  if data.isEmpty { return "-" }
  var out = [UInt8]()
  out.reserveCapacity(data.count * 2)
  for byte in data {
    out.append(digits[Int(byte >> 4)])
    out.append(digits[Int(byte & 0x0f)])
  }
  return String(decoding: out, as: UTF8.self)
}

func bytes(_ text: Substring) -> Data {
  if text == "-" { return Data() }
  let chars = Array(text.utf8)
  var out = Data(capacity: chars.count / 2)
  var at = 0
  while at + 1 < chars.count {
    out.append(UInt8(String(decoding: chars[at...at + 1], as: UTF8.self), radix: 16) ?? 0)
    at += 2
  }
  return out
}

func answer(_ request: String) throws -> String {
  let parts = request.split(separator: " ", omittingEmptySubsequences: true)
  guard let name = parts.first else { return "error nothing asked" }
  let a = parts.dropFirst().map(bytes)
  func arg(_ at: Int) -> Data { at < a.count ? a[at] : Data() }
  switch name {
  case "seal":
    return "ok " + hex(try Primitives.seal(key: arg(0), iv: arg(1), additionalData: arg(2), plaintext: arg(3)))
  case "open":
    return "ok " + hex(try Primitives.open(key: arg(0), iv: arg(1), additionalData: arg(2), sealed: arg(3)))
  case "x25519Generate":
    return "ok " + hex(Primitives.x25519Generate())
  case "x25519Derive":
    return "ok " + hex(try Primitives.x25519Derive(privateKey: arg(0), publicKey: arg(1)))
  case "ed25519Generate":
    return "ok " + hex(Primitives.ed25519Generate())
  case "ed25519Sign":
    return "ok " + hex(try Primitives.ed25519Sign(privateKey: arg(0), data: arg(1)))
  case "ed25519Verify":
    return "ok \(Primitives.ed25519Verify(publicKey: arg(0), signature: arg(1), data: arg(2)))"
  case "hmacSha256Sign":
    return "ok " + hex(Primitives.hmacSha256Sign(key: arg(0), data: arg(1)))
  case "hmacSha256Verify":
    return "ok \(Primitives.hmacSha256Verify(key: arg(0), mac: arg(1), data: arg(2)))"
  default:
    return "error no primitive called \(name)"
  }
}

while let request = readLine() {
  do {
    print(try answer(request))
  } catch {
    print("error \(error.localizedDescription)")
  }
  fflush(stdout)
}
