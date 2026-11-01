//! The shell's own page door (ADR 0201's addendum).
//!
//! An HTML page a harness sent is drawn in a frame, and a frame given its document takes the
//! app's own policy with it, which runs no inline script. The server has a door for that, but
//! this window reaches its server through a tunnel (ADR 0191), where a frame cannot follow and a
//! plain load would put the page on the network in the clear. So the page fetches the bytes
//! through its tunnel, as it does for the page's words, hands them here with the policy they
//! are served under, and frames `chips-page://localhost/<key>`. The scheme answers the bytes once,
//! with the policy as a header — the same one the server's door answers — so the page's script
//! runs and nothing leaves it, and the bytes never left the window.
//!
//! Nothing here reads the page: the policy is the window's, from the protocol, and the key is
//! random and spent on the first load, so a URL that leaks is worth nothing.

use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

use tauri::http::{header, Request, Response, StatusCode};

/// The scheme a frame loads a held page from. On macOS the URL is `chips-page://localhost/<key>`.
pub const SCHEME: &str = "chips-page";

/// How long a held page waits for its frame, which loads at once. A page nobody loaded is dropped.
const HELD_FOR: Duration = Duration::from_secs(60);

/// A page the window handed over: its bytes, the policy it is served under, and since when.
pub struct Held {
    pub html: Vec<u8>,
    pub policy: String,
    since: Instant,
}

/// The pages waiting for their frames, by key.
#[derive(Default)]
pub struct Pages(Mutex<HashMap<String, Held>>);

impl Pages {
    /// Hold a page under a key nobody can guess, and say where the frame loads it from.
    pub fn hold(&self, html: String, policy: String) -> Result<String, String> {
        if policy.trim().is_empty() {
            return Err("A page is held under a policy, and this one names none.".into());
        }
        self.hold_since(html, policy, Instant::now())
    }

    fn hold_since(&self, html: String, policy: String, since: Instant) -> Result<String, String> {
        let key = new_key()?;
        let mut held = self
            .0
            .lock()
            .map_err(|_| "The held pages cannot be reached.")?;
        let now = Instant::now();
        held.retain(|_, page| now.duration_since(page.since) < HELD_FOR);
        held.insert(
            key.clone(),
            Held {
                html: html.into_bytes(),
                policy,
                since,
            },
        );
        Ok(url_for(&key))
    }

    /// The page under a key, once: taken out whether or not it was still fresh, so a key is good
    /// for one load and nothing afterwards.
    pub fn take(&self, key: &str) -> Option<Held> {
        let mut held = self.0.lock().ok()?;
        let page = held.remove(key)?;
        (page.since.elapsed() < HELD_FOR).then_some(page)
    }
}

/// Where a frame loads the page under `key` from.
pub fn url_for(key: &str) -> String {
    format!("{SCHEME}://localhost/{key}")
}

/// 256 random bits, as hex: a key with nothing to guess, like the server's ticket.
fn new_key() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|error| error.to_string())?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

/// The key a request names: its path, and nothing else of the URL.
pub fn key_of(request: &Request<Vec<u8>>) -> &str {
    request.uri().path().trim_start_matches('/')
}

/// What the scheme answers: the page under its policy, or that there is no such page. Either
/// way nothing is kept and nothing is sniffed, and a window the page opens learns nothing of
/// where it came from.
pub fn answer(page: Option<Held>) -> Response<Vec<u8>> {
    let built = match page {
        Some(page) => Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CONTENT_SECURITY_POLICY, page.policy)
            .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
            .header(header::CACHE_CONTROL, "no-store")
            .header(header::REFERRER_POLICY, "no-referrer")
            .body(page.html),
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
            .header(
                header::CONTENT_SECURITY_POLICY,
                "default-src 'none'; sandbox",
            )
            .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
            .header(header::CACHE_CONTROL, "no-store")
            .header(header::REFERRER_POLICY, "no-referrer")
            .body(b"That page is gone. Open it again.".to_vec()),
    };
    built.expect("a response with fixed headers builds")
}

#[cfg(test)]
mod tests {
    use super::*;

    const POLICY: &str = "default-src 'none'; script-src 'unsafe-inline'; sandbox allow-scripts";

    fn key_in(url: &str) -> String {
        url.trim_start_matches("chips-page://localhost/")
            .to_string()
    }

    #[test]
    fn holds_a_page_under_a_random_key_and_hands_it_out_once() {
        let pages = Pages::default();
        let url = pages.hold("<p>Bronze</p>".into(), POLICY.into()).unwrap();
        assert!(url.starts_with("chips-page://localhost/"), "{url}");
        let key = key_in(&url);
        assert_eq!(key.len(), 64);
        assert!(key.chars().all(|c| c.is_ascii_hexdigit()));
        let other = pages.hold("<p>Silver</p>".into(), POLICY.into()).unwrap();
        assert_ne!(other, url);

        let held = pages.take(&key).expect("the page, once");
        assert_eq!(held.html, b"<p>Bronze</p>");
        assert_eq!(held.policy, POLICY);
        assert!(pages.take(&key).is_none(), "a key is good once");
        assert!(pages.take("never-held").is_none());
    }

    #[test]
    fn refuses_a_page_with_no_policy() {
        let pages = Pages::default();
        assert!(pages.hold("<p>x</p>".into(), "  ".into()).is_err());
    }

    #[test]
    fn drops_a_page_nobody_loaded() {
        let pages = Pages::default();
        let stale = Instant::now() - HELD_FOR - Duration::from_secs(1);
        let url = pages
            .hold_since("<p>old</p>".into(), POLICY.into(), stale)
            .unwrap();
        assert!(
            pages.take(&key_in(&url)).is_none(),
            "past its minute it is gone"
        );
        // Holding another prunes what is stale, and the fresh one is there.
        let old = pages
            .hold_since("<p>older</p>".into(), POLICY.into(), stale)
            .unwrap();
        let fresh = pages.hold("<p>new</p>".into(), POLICY.into()).unwrap();
        assert!(pages.take(&key_in(&old)).is_none());
        assert!(pages.take(&key_in(&fresh)).is_some());
    }

    #[test]
    fn answers_the_page_under_its_policy_and_a_missing_one_as_gone() {
        let response = answer(Some(Held {
            html: b"<p>Bronze</p>".to_vec(),
            policy: POLICY.into(),
            since: Instant::now(),
        }));
        assert_eq!(response.status(), StatusCode::OK);
        let headers = response.headers();
        assert_eq!(headers[header::CONTENT_TYPE], "text/html; charset=utf-8");
        assert_eq!(headers[header::CONTENT_SECURITY_POLICY], POLICY);
        assert_eq!(headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
        assert_eq!(headers[header::CACHE_CONTROL], "no-store");
        assert_eq!(headers[header::REFERRER_POLICY], "no-referrer");
        assert_eq!(response.body(), b"<p>Bronze</p>");

        let gone = answer(None);
        assert_eq!(gone.status(), StatusCode::NOT_FOUND);
        assert_eq!(
            gone.headers()[header::CONTENT_TYPE],
            "text/plain; charset=utf-8"
        );
        assert_eq!(
            gone.headers()[header::CONTENT_SECURITY_POLICY],
            "default-src 'none'; sandbox"
        );
    }

    #[test]
    fn reads_the_key_from_the_path_alone() {
        let request = Request::builder()
            .uri("chips-page://localhost/abc123?x=1")
            .body(Vec::new())
            .unwrap();
        assert_eq!(key_of(&request), "abc123");
    }
}
