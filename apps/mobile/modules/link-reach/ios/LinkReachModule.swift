import Darwin
import ExpoModulesCore
import Foundation

/**
 * Whether this phone can reach a link on a space's page that only some devices reach (ADR 0227's
 * addendum of 10 November 2026): one through Tailscale, as the Health space's links to its app
 * are, or on a private network. Before it opens one, Universe looks the name up and reads the
 * phone's tunnels, so the sheet can say why it won't open (Tailscale is off on this iPhone, or
 * another VPN is on) instead of Safari saying it can't find the server.
 *
 * Nothing is sent anywhere but the lookup the phone would make anyway on opening the link, and
 * nothing is kept.
 */
public class LinkReachModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChipsLinkReach")

    // The phone's tunnels now: one with a Tailscale address (100.64.0.0/10), and one with any
    // other, which is another VPN's. Only tunnels count: a carrier can give the cellular
    // connection a 100.x address too.
    Function("tunnels") { () -> [String: Bool] in
      let seen = tunnels()
      return ["tailscale": seen.tailscale, "otherVpn": seen.other]
    }

    // Whether the name is found: true, false when the lookup says there is no such name, or nil
    // when it can't say (no network, or no answer within `ms`).
    AsyncFunction("found") { (host: String, ms: Int, promise: Promise) in
      let answered = DispatchSemaphore(value: 0)
      let said = Said()
      Thread.detachNewThread {
        said.found = lookUp(host)
        answered.signal()
      }
      DispatchQueue.global(qos: .userInitiated).async {
        let waited = answered.wait(timeout: .now() + .milliseconds(max(ms, 100)))
        promise.resolve(waited == .success ? said.found : nil)
      }
    }
  }
}

/** What the lookup said, handed from its thread to the one waiting on it. */
private final class Said: @unchecked Sendable {
  var found: Bool?
}

/** Whether the system finds a name: false only when it says there is no such name. */
private func lookUp(_ host: String) -> Bool? {
  var hints = addrinfo()
  hints.ai_family = AF_UNSPEC
  hints.ai_socktype = SOCK_STREAM
  var result: UnsafeMutablePointer<addrinfo>?
  let status = getaddrinfo(host, nil, &hints, &result)
  if let result { freeaddrinfo(result) }
  if status == 0 { return true }
  if status == EAI_NONAME || status == EAI_NODATA { return false }
  return nil
}

/** The tunnels up now, by what their IPv4 address says they are. */
private func tunnels() -> (tailscale: Bool, other: Bool) {
  var tailscale = false
  var other = false
  var list: UnsafeMutablePointer<ifaddrs>?
  guard getifaddrs(&list) == 0, let first = list else { return (false, false) }
  defer { freeifaddrs(list) }
  var at: UnsafeMutablePointer<ifaddrs>? = first
  while let each = at {
    defer { at = each.pointee.ifa_next }
    let flags = Int32(each.pointee.ifa_flags)
    guard flags & IFF_UP != 0, let address = each.pointee.ifa_addr,
      address.pointee.sa_family == UInt8(AF_INET)
    else { continue }
    // A VPN app's tunnel is a utun; the system's own (Wi-Fi Calling's ipsec) are left out.
    guard String(cString: each.pointee.ifa_name).hasPrefix("utun") else { continue }
    let ip = address.withMemoryRebound(to: sockaddr_in.self, capacity: 1) {
      UInt32(bigEndian: $0.pointee.sin_addr.s_addr)
    }
    let a = ip >> 24
    let b = (ip >> 16) & 0xff
    if a == 100 && b >= 64 && b <= 127 {
      tailscale = true
    } else if !(a == 169 && b == 254) {
      other = true
    }
  }
  return (tailscale, other)
}
