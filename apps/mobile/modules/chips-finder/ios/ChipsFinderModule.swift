import ExpoModulesCore
import Foundation

/**
 * Chips servers on this Wi-Fi (ADR 0172): a server bound to the network advertises `_chips._tcp`,
 * and a phone with no server yet lists what answers, so that a person taps their computer rather
 * than typing its address. Each service is resolved to its IPv4 address and port, with the name the
 * server gave it and its record (`machine`, `workspace`). An IPv6 address is left out: a URL made
 * from one needs brackets nobody types, and a phone on the same Wi-Fi has the IPv4 one too.
 *
 * The first browse asks for local network access, with the words in `NSLocalNetworkUsageDescription`;
 * iOS shows nothing for a service type missing from `NSBonjourServices`, so that lists `_chips._tcp`.
 */
public class ChipsFinderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChipsFinder")

    // Look for `seconds` (half a second to ten), then answer with every server resolved by then.
    AsyncFunction("find") { (seconds: Double, promise: Promise) in
      let finder = Finder(seconds: min(max(seconds, 0.5), 10)) { found in promise.resolve(found) }
      finder.start()
    }.runOnQueue(.main)
  }
}

/** One browse: kept alive by the set of running ones until it has answered. */
final class Finder: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
  private static var running = Set<Finder>()

  private let browser = NetServiceBrowser()
  private let seconds: Double
  private let done: ([[String: Any]]) -> Void
  private var services: [NetService] = []
  private var found: [String: [String: Any]] = [:]

  init(seconds: Double, done: @escaping ([[String: Any]]) -> Void) {
    self.seconds = seconds
    self.done = done
    super.init()
  }

  func start() {
    Finder.running.insert(self)
    browser.delegate = self
    browser.searchForServices(ofType: "_chips._tcp.", inDomain: "local.")
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in self?.finish() }
  }

  func netServiceBrowser(
    _ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool
  ) {
    services.append(service)
    service.delegate = self
    service.resolve(withTimeout: 3)
  }

  func netServiceDidResolveAddress(_ sender: NetService) {
    guard let host = Finder.ipv4(sender.addresses) else { return }
    var record: [String: String] = [:]
    if let data = sender.txtRecordData() {
      for (key, value) in NetService.dictionary(fromTXTRecord: data) {
        record[key] = String(data: value, encoding: .utf8)
      }
    }
    found["\(host):\(sender.port)"] = [
      "name": sender.name,
      "host": host,
      "port": sender.port,
      "machine": record["machine"] ?? "",
      "workspace": record["workspace"] ?? "",
    ]
  }

  private func finish() {
    browser.stop()
    for service in services { service.stop() }
    Finder.running.remove(self)
    done(Array(found.values))
  }

  /** The first IPv4 address among a service's, as dotted digits. */
  private static func ipv4(_ addresses: [Data]?) -> String? {
    for data in addresses ?? [] {
      let address: String? = data.withUnsafeBytes { raw in
        guard let base = raw.baseAddress, raw.count >= MemoryLayout<sockaddr_in>.size else { return nil }
        let socket = base.assumingMemoryBound(to: sockaddr.self)
        guard socket.pointee.sa_family == sa_family_t(AF_INET) else { return nil }
        var inet = base.assumingMemoryBound(to: sockaddr_in.self).pointee.sin_addr
        var text = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
        guard inet_ntop(AF_INET, &inet, &text, socklen_t(INET_ADDRSTRLEN)) != nil else { return nil }
        return String(cString: text)
      }
      if let address { return address }
    }
    return nil
  }
}
