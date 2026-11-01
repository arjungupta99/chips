package chat.chips.finder

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.Inet4Address

/**
 * Chips servers on this Wi-Fi (ADR 0172), on Android: the same `_chips._tcp` browse as iOS's
 * `ChipsFinderModule.swift`, through Android's own service discovery (`NsdManager`), answering in
 * the same shape. Each service is resolved to its IPv4 address and port, with the name the server
 * gave it and its record (`machine`, `workspace`). An IPv6 address is left out, as on iOS.
 *
 * Android asks for no permission to browse (the app's `INTERNET` is enough), and `NsdManager`
 * holds the multicast itself. Anything that refuses the browse answers with nothing found, and
 * the screen offers the other ways in.
 */
class ChipsFinderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ChipsFinder")

    // Look for `seconds` (half a second to ten), then answer with every server resolved by then.
    AsyncFunction("find") { seconds: Double, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(emptyList<Map<String, Any>>())
        return@AsyncFunction
      }
      Finder(context, seconds.coerceIn(0.5, 10.0)) { found -> promise.resolve(found) }.start()
    }
  }
}

/** One browse, on the main thread, answering once. */
internal class Finder(
  context: Context,
  private val seconds: Double,
  private val done: (List<Map<String, Any>>) -> Unit,
) {
  private val nsd = context.getSystemService(Context.NSD_SERVICE) as NsdManager
  private val main = Handler(Looper.getMainLooper())
  private val waiting = ArrayDeque<NsdServiceInfo>()
  private val found = LinkedHashMap<String, Map<String, Any>>()
  private var browsing = false
  private var resolving = false
  private var finished = false

  private val discovery = object : NsdManager.DiscoveryListener {
    override fun onDiscoveryStarted(serviceType: String) {}
    override fun onServiceFound(service: NsdServiceInfo) {
      main.post {
        waiting.addLast(service)
        resolveNext()
      }
    }
    override fun onServiceLost(service: NsdServiceInfo) {}
    override fun onDiscoveryStopped(serviceType: String) {}
    override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
      main.post {
        browsing = false
        finish()
      }
    }
    override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
  }

  fun start() {
    main.post {
      try {
        nsd.discoverServices("_chips._tcp", NsdManager.PROTOCOL_DNS_SD, discovery)
        browsing = true
      } catch (refused: RuntimeException) {
        finish()
        return@post
      }
      main.postDelayed({ finish() }, (seconds * 1000).toLong())
    }
  }

  /** One at a time: before Android 14, a second resolve while one runs fails as already active. */
  private fun resolveNext() {
    if (resolving || finished) return
    val service = waiting.removeFirstOrNull() ?: return
    resolving = true
    @Suppress("DEPRECATION")
    nsd.resolveService(
      service,
      object : NsdManager.ResolveListener {
        override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {
          main.post {
            resolving = false
            resolveNext()
          }
        }
        override fun onServiceResolved(info: NsdServiceInfo) {
          main.post {
            keep(info)
            resolving = false
            resolveNext()
          }
        }
      },
    )
  }

  private fun keep(info: NsdServiceInfo) {
    if (finished) return
    val host = ipv4Of(info) ?: return
    val record = info.attributes.mapValues { (_, value) -> value?.toString(Charsets.UTF_8) ?: "" }
    found["$host:${info.port}"] = mapOf(
      "name" to info.serviceName,
      "host" to host,
      "port" to info.port,
      "machine" to (record["machine"] ?: ""),
      "workspace" to (record["workspace"] ?: ""),
    )
  }

  private fun finish() {
    if (finished) return
    finished = true
    if (browsing) {
      try {
        nsd.stopServiceDiscovery(discovery)
      } catch (notBrowsing: IllegalArgumentException) {
        // It stopped on its own.
      }
    }
    done(found.values.toList())
  }

  /** The first IPv4 address the service resolved to, as dotted digits. */
  private fun ipv4Of(info: NsdServiceInfo): String? {
    val addresses =
      if (Build.VERSION.SDK_INT >= 34) info.hostAddresses
      else listOfNotNull(@Suppress("DEPRECATION") info.host)
    return addresses.filterIsInstance<Inet4Address>().firstOrNull()?.hostAddress
  }
}
