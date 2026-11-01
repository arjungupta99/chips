//! The PATH a Terminal on this Mac has, for what the app starts (the new-person sweep's finding 5).
//!
//! An app opened from Finder is given launchd's PATH, `/usr/bin:/bin:/usr/sbin:/sbin`, which has
//! none of Homebrew, nodejs.org's Node, nvm or `~/.local/bin`. A bridge started with it can't find
//! the harness it connects, nor the adapter it was just told to install, and the bridge it keeps
//! running stores the same short PATH. So the login shell is asked once what PATH it sets, and the
//! usual places are added after it in case it doesn't answer.

use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

/// How long the login shell has to say its PATH: a slow profile is waited for, a stuck one isn't.
const PATIENCE: Duration = Duration::from_secs(3);

/// Around the PATH the shell prints, so whatever its profile prints too is left out.
const MARK: &str = "__CHIPS_PATH__";

/// Where a Mac's tools are, whether or not the shell named them: Homebrew on Apple silicon and on
/// Intel, Chips's own `~/.local/bin`, and the system's.
const USUAL: [&str; 7] = [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
];

/// The login shell's PATH, then the usual places, then what this app was given; each once.
pub fn merged(shell: Option<&str>, home: &Path, inherited: Option<&str>) -> String {
    let local = home.join(".local/bin").to_string_lossy().into_owned();
    let mut seen: Vec<String> = Vec::new();
    let found = shell.unwrap_or("").split(':');
    let usual = USUAL.iter().copied().chain(std::iter::once(local.as_str()));
    for dir in found.chain(usual).chain(inherited.unwrap_or("").split(':')) {
        if !dir.is_empty() && !seen.iter().any(|kept| kept == dir) {
            seen.push(dir.to_string());
        }
    }
    seen.join(":")
}

/// What the login shell sets PATH to, read between the marks; nothing if it doesn't say in time.
fn from_login_shell() -> Option<String> {
    let shell = std::env::var("SHELL")
        .ok()
        .filter(|shell| shell.starts_with('/'))
        .unwrap_or_else(|| "/bin/zsh".to_string());
    // Interactive and login, as Terminal opens one: nvm and its kind are set in `.zshrc`.
    let mut child = Command::new(shell)
        .args(["-ilc", &format!("printf '{MARK}%s{MARK}' \"$PATH\"")])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut said = String::new();
        let _ = stdout.read_to_string(&mut said);
        said
    });
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if started.elapsed() < PATIENCE => std::thread::sleep(Duration::from_millis(25)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
    let said = reader.join().ok()?;
    let from = said.find(MARK)? + MARK.len();
    let to = said[from..].find(MARK)? + from;
    Some(said[from..to].to_string())
}

/// The PATH for a bridge this app starts: worked out once, the first time one is.
pub fn for_bridges() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        merged(
            from_login_shell().as_deref(),
            Path::new(&home),
            std::env::var("PATH").ok().as_deref(),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_shells_path_comes_first_then_the_usual_places_then_the_apps() {
        let home = Path::new("/Users/someone");
        let path = merged(
            Some("/Users/someone/.nvm/versions/node/v22/bin:/opt/homebrew/bin:/usr/bin"),
            home,
            Some("/usr/bin:/bin:/usr/sbin:/sbin"),
        );
        assert_eq!(
            path,
            "/Users/someone/.nvm/versions/node/v22/bin:/opt/homebrew/bin:/usr/bin:/opt/homebrew/sbin:/usr/local/bin:/bin:/usr/sbin:/sbin:/Users/someone/.local/bin"
        );
    }

    #[test]
    fn a_shell_that_said_nothing_still_has_homebrew_and_chips() {
        let path = merged(None, Path::new("/Users/someone"), Some("/usr/bin:/bin"));
        assert!(path.starts_with("/opt/homebrew/bin:"));
        assert!(path.contains(":/usr/local/bin:"));
        assert!(path.ends_with(":/Users/someone/.local/bin"));
    }
}
