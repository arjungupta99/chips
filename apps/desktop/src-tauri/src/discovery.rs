//! Finding a server on the network.
//!
//! `chips serve` advertises `_chips._tcp` with the workspace in its TXT record (the CLI's
//! `discovery.ts` publishes exactly this). The app browses for it so a person on the same
//! network never has to know an address — and because the pairing QR carries one, this is the
//! path for someone who would rather not use a camera.
//!
//! Nothing secret is on the wire: mDNS is a broadcast to the whole segment, so what comes back
//! is a name, an address and a workspace id, and a pairing code is still needed to join.

use std::net::IpAddr;
use std::time::Duration;

use mdns_sd::{ServiceDaemon, ServiceEvent};
use serde::Serialize;

const SERVICE: &str = "_chips._tcp.local.";

#[derive(Debug, Clone, Serialize)]
pub struct FoundServer {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub url: String,
    pub workspace: Option<String>,
}

/// Every Chips server that answers within `millis`. Deduplicated by address, because a machine
/// with two interfaces answers twice and is still one server.
pub fn browse(millis: u64) -> Result<Vec<FoundServer>, String> {
    let daemon = ServiceDaemon::new().map_err(|error| error.to_string())?;
    let receiver = daemon
        .browse(SERVICE)
        .map_err(|error| error.to_string())?;

    let deadline = std::time::Instant::now() + Duration::from_millis(millis);
    let mut found: Vec<FoundServer> = Vec::new();

    while let Some(remaining) = deadline.checked_duration_since(std::time::Instant::now()) {
        let Ok(event) = receiver.recv_timeout(remaining) else {
            break;
        };
        if let ServiceEvent::ServiceResolved(info) = event {
            let port = info.get_port();
            let addresses = info
                .get_addresses()
                .iter()
                .map(|address| address.to_ip_addr());
            let Some((host, url)) = address_for(addresses, port) else {
                continue;
            };
            if found.iter().any(|server| server.url == url) {
                continue;
            }
            found.push(FoundServer {
                name: info.get_fullname().split('.').next().unwrap_or("Chips").to_string(),
                host,
                port,
                url,
                workspace: info.get_property_val_str("workspace").map(str::to_string),
            });
        }
    }

    let _ = daemon.shutdown();
    Ok(found)
}

/// Which of a server's addresses to offer, and the URL for it. A machine answers with every
/// address it has, in no order, and `chipsd` binds IPv4 by default, so IPv4 comes first: an IPv6
/// address picked at random was refused. IPv6 goes in brackets, as a URL writes it, and a
/// link-local one is left out, since it names an interface only this machine knows.
fn address_for(addresses: impl IntoIterator<Item = IpAddr>, port: u16) -> Option<(String, String)> {
    let mut usable: Vec<IpAddr> = addresses
        .into_iter()
        // fe80::/10, spelled out: `is_unicast_link_local` is newer than this crate's MSRV.
        .filter(|ip| !matches!(ip, IpAddr::V6(v6) if v6.segments()[0] & 0xffc0 == 0xfe80))
        .collect();
    usable.sort_by_key(|ip| (ip.is_ipv6(), *ip));
    let ip = usable.into_iter().next()?;
    let host = ip.to_string();
    let url = match ip {
        IpAddr::V4(_) => format!("http://{host}:{port}"),
        IpAddr::V6(_) => format!("http://[{host}]:{port}"),
    };
    Some((host, url))
}

#[cfg(test)]
mod tests {
    use super::address_for;
    use std::net::IpAddr;

    fn ips(list: &[&str]) -> Vec<IpAddr> {
        list.iter().map(|ip| ip.parse().unwrap()).collect()
    }

    #[test]
    fn an_ipv4_address_comes_first_whatever_order_they_arrive_in() {
        let both = ips(&["fdf0:ac2f:e0b1:8711:4d1:7b64:f37e:618e", "10.0.0.36"]);
        assert_eq!(
            address_for(both, 4431),
            Some(("10.0.0.36".into(), "http://10.0.0.36:4431".into()))
        );
    }

    #[test]
    fn an_ipv6_address_alone_is_written_in_brackets() {
        let only = ips(&["fdf0:ac2f:e0b1:8711:4d1:7b64:f37e:618e"]);
        assert_eq!(
            address_for(only, 4431).map(|(_, url)| url),
            Some("http://[fdf0:ac2f:e0b1:8711:4d1:7b64:f37e:618e]:4431".into())
        );
    }

    #[test]
    fn a_link_local_address_is_no_address_at_all() {
        assert_eq!(address_for(ips(&["fe80::1c2b:3aff:fe4d:5e6f"]), 4431), None);
    }
}
