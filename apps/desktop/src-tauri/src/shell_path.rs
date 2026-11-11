//! The PATH a Terminal on this Mac has, for what the app starts (the new-person sweep's finding 5).
//!
//! An app opened from Finder is given launchd's PATH, `/usr/bin:/bin:/usr/sbin:/sbin`, which has
//! none of Homebrew, nodejs.org's Node, nvm or `~/.local/bin`. A bridge started with it can't find
//! the harness it connects, nor the adapter it was just told to install, and the bridge it keeps
//! running stores the same short PATH. So the login shell is asked what PATH it sets, each time,
//! so that what a person has just installed is found (ADR 0288), and the usual places are added
//! after it in case it doesn't answer.

use std::io::Read;
use std::path::Path;
use std::process::{Command, Stdio};
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

/// The PATH for a bridge this app starts, or for looking for a program: the shell's as it is now.
pub fn for_bridges() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    merged(
        from_login_shell().as_deref(),
        Path::new(&home),
        std::env::var("PATH").ok().as_deref(),
    )
}

/// The most names one ask looks for: the gallery has a handful of cards.
const MOST_NAMES: usize = 32;

/// A command by its bare name, the only thing looked for: never a path.
fn bare(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// A file that can be run.
fn runs(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.is_file() && meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        meta.is_file()
    }
}

/// Where `name` is on `path`, as a shell would run it: the first there that can be run.
pub fn which(name: &str, path: &str) -> Option<std::path::PathBuf> {
    if !bare(name) {
        return None;
    }
    path.split(':')
        .filter(|dir| !dir.is_empty())
        .map(|dir| Path::new(dir).join(name))
        .find(|candidate| runs(candidate))
}

/// Which of `names` are programs somewhere on `path`, in the order asked (ADR 0288).
pub fn found_among(names: &[String], path: &str) -> Vec<String> {
    names
        .iter()
        .take(MOST_NAMES)
        .filter(|name| bare(name))
        .filter(|name| {
            path.split(':')
                .any(|dir| !dir.is_empty() && runs(&Path::new(dir).join(name.as_str())))
        })
        .cloned()
        .collect()
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
    fn finds_programs_that_can_be_run_and_nothing_else() {
        let dir = std::env::temp_dir().join(format!("chips-found-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("folder")).unwrap();
        let program = dir.join("codex");
        std::fs::write(&program, "#!/bin/sh\n").unwrap();
        std::fs::write(dir.join("notes"), "not a program").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
            std::fs::set_permissions(dir.join("notes"), std::fs::Permissions::from_mode(0o644))
                .unwrap();
        }
        let names: Vec<String> = ["hermes", "notes", "folder", "codex", "../codex", ".codex"]
            .iter()
            .map(|name| name.to_string())
            .collect();
        let path = format!("/nowhere::{}", dir.display());
        assert_eq!(found_among(&names, &path), vec!["codex".to_string()]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_shell_that_said_nothing_still_has_homebrew_and_chips() {
        let path = merged(None, Path::new("/Users/someone"), Some("/usr/bin:/bin"));
        assert!(path.starts_with("/opt/homebrew/bin:"));
        assert!(path.contains(":/usr/local/bin:"));
        assert!(path.ends_with(":/Users/someone/.local/bin"));
    }
}
