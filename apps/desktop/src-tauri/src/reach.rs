//! Whether this Mac can reach a link on a space's page that only some devices reach (ADR 0227's
//! addendum of 10 November 2026): one through Tailscale, as the Health space's links to its app
//! are, or on a private network. Before the page window opens one, it asks here: is the name found,
//! is there a Tailscale tunnel or another VPN's, and is Tailscale installed. So the banner can say
//! why a link won't open ("Tailscale is off on this Mac") instead of the browser saying it can't
//! find the server.
//!
//! Nothing is sent anywhere but the lookup the Mac would make anyway on opening the link, and
//! nothing is kept.

use std::ffi::{CStr, CString};
use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;

/// How long a lookup may take before it counts as unknown.
const LOOKUP: Duration = Duration::from_millis(2000);

/// What the Mac sees, as the page reads it (core's `LinkSeen`).
#[derive(serde::Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Seen {
    /// The name was found; nothing when no name was asked about, or the lookup couldn't say.
    pub found: Option<bool>,
    /// A tunnel with a Tailscale address (100.64.0.0/10).
    pub tailscale: bool,
    /// A tunnel with any other address: another VPN's.
    pub other_vpn: bool,
    pub installed: bool,
}

/// Where Tailscale is found on a Mac: the app, from its site or the App Store, or Homebrew's.
const TAILSCALE_AT: [&str; 4] = [
    "/Applications/Tailscale.app",
    "/opt/homebrew/bin/tailscale",
    "/usr/local/bin/tailscale",
    "/opt/homebrew/opt/tailscale/bin/tailscaled",
];

/// Tailscale's download page, for a Mac without it.
const TAILSCALE_GET: &str = "https://tailscale.com/download/mac";

/// What this Mac sees of a link's host, or only of its tunnels when there is no name to look up.
#[tauri::command]
pub async fn link_reach(host: Option<String>) -> Seen {
    tauri::async_runtime::spawn_blocking(move || seen(host.as_deref()))
        .await
        .unwrap_or(Seen {
            found: None,
            tailscale: false,
            other_vpn: false,
            installed: installed(),
        })
}

/// Tailscale, brought up so the person can turn it on; its download page where it isn't installed,
/// or when asked for.
#[tauri::command]
pub fn open_tailscale(get: bool) {
    let mut open = std::process::Command::new("/usr/bin/open");
    if get || !installed() {
        open.arg(TAILSCALE_GET);
    } else {
        open.args(["-a", "Tailscale"]);
    }
    // Waited on in a thread of its own, so the page isn't held and `open` leaves no zombie.
    std::thread::spawn(move || {
        let _ = open.status();
    });
}

fn seen(host: Option<&str>) -> Seen {
    let (tailscale, other_vpn) = tunnels();
    Seen {
        found: host.and_then(found),
        tailscale,
        other_vpn,
        installed: installed(),
    }
}

fn installed() -> bool {
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from);
    TAILSCALE_AT.iter().any(|at| Path::new(at).exists())
        || home.is_some_and(|home| home.join("Applications/Tailscale.app").exists())
}

/// Whether the system finds a name: false only when it says there is no such name; nothing when it
/// can't say, or takes too long.
fn found(host: &str) -> Option<bool> {
    let host = CString::new(host).ok()?;
    let (said, heard) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = said.send(look_up(&host));
    });
    heard.recv_timeout(LOOKUP).ok().flatten()
}

fn look_up(host: &CStr) -> Option<bool> {
    // SAFETY: `hints` is zeroed as getaddrinfo asks, `result` is freed once and only when set.
    unsafe {
        let mut hints: libc::addrinfo = std::mem::zeroed();
        hints.ai_family = libc::AF_UNSPEC;
        hints.ai_socktype = libc::SOCK_STREAM;
        let mut result: *mut libc::addrinfo = std::ptr::null_mut();
        let status = libc::getaddrinfo(host.as_ptr(), std::ptr::null(), &hints, &mut result);
        if !result.is_null() {
            libc::freeaddrinfo(result);
        }
        match status {
            0 => Some(true),
            libc::EAI_NONAME | libc::EAI_NODATA => Some(false),
            _ => None,
        }
    }
}

/// The tunnels up now, by what their IPv4 address says they are: Tailscale's, or another VPN's.
/// Only a utun counts; the Mac's own network is never a VPN.
fn tunnels() -> (bool, bool) {
    let mut tailscale = false;
    let mut other = false;
    // SAFETY: the list is walked while held and freed once, as getifaddrs asks.
    unsafe {
        let mut list: *mut libc::ifaddrs = std::ptr::null_mut();
        if libc::getifaddrs(&mut list) != 0 {
            return (false, false);
        }
        let mut at = list;
        while !at.is_null() {
            let each = &*at;
            at = each.ifa_next;
            let up = each.ifa_flags & (libc::IFF_UP as u32) != 0;
            if !up || each.ifa_addr.is_null() || (*each.ifa_addr).sa_family as i32 != libc::AF_INET
            {
                continue;
            }
            if !CStr::from_ptr(each.ifa_name)
                .to_bytes()
                .starts_with(b"utun")
            {
                continue;
            }
            let address = &*(each.ifa_addr as *const libc::sockaddr_in);
            match kind_of(u32::from_be(address.sin_addr.s_addr)) {
                Tunnel::Tailscale => tailscale = true,
                Tunnel::Other => other = true,
                Tunnel::None => {}
            }
        }
        libc::freeifaddrs(list);
    }
    (tailscale, other)
}

#[derive(Debug, PartialEq, Eq)]
enum Tunnel {
    Tailscale,
    Other,
    None,
}

/// A tunnel's IPv4 address: Tailscale's range, a link-local one that says nothing, or another VPN's.
fn kind_of(ip: u32) -> Tunnel {
    let a = ip >> 24;
    let b = (ip >> 16) & 0xff;
    if a == 100 && (64..=127).contains(&b) {
        Tunnel::Tailscale
    } else if a == 169 && b == 254 {
        Tunnel::None
    } else {
        Tunnel::Other
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(a: u32, b: u32, c: u32, d: u32) -> u32 {
        (a << 24) | (b << 16) | (c << 8) | d
    }

    #[test]
    fn a_tunnel_is_tailscale_by_its_range_and_another_vpn_otherwise() {
        assert_eq!(kind_of(ip(100, 101, 102, 103)), Tunnel::Tailscale);
        assert_eq!(kind_of(ip(100, 64, 0, 1)), Tunnel::Tailscale);
        assert_eq!(kind_of(ip(100, 127, 255, 254)), Tunnel::Tailscale);
        assert_eq!(kind_of(ip(100, 128, 0, 1)), Tunnel::Other);
        assert_eq!(kind_of(ip(10, 5, 0, 2)), Tunnel::Other);
        assert_eq!(kind_of(ip(169, 254, 1, 1)), Tunnel::None);
    }

    #[test]
    fn a_name_that_isnt_there_is_not_found() {
        assert_eq!(found("nothing-here.invalid"), Some(false));
        assert_eq!(found("localhost"), Some(true));
    }
}
