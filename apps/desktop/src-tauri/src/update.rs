//! Chips for Mac updating itself (everything in step, phase 5; ADR 0298 and its addendum).
//!
//! Soon after it opens, and then once a day by the clock on the wall, the app asks the release
//! feed whether a newer Chips for Mac is out. A newer one is downloaded in the background and
//! checked against the key `plugins.updater.pubkey` names before anything else (Tauri's updater),
//! then waits in the app's cache for a moment it can go in: when the app quits, when nobody is at
//! this Mac (at night, or at any hour once a night has gone by with the release waiting), or when
//! Restart now in About asks. Going in swaps the bundle whole for the new one, after the download
//! is read again and found to be the bytes that were checked. When nobody is there and on Restart
//! now the app opens again from it, as it was: the menu bar's icon alone if its window was away.
//! The computer the app carries goes on running until nothing is going on, then starts again on
//! the release now in the bundle (the computer's own `restartOnto`).
//!
//! Only a build made to hand out (`pnpm desktop release`, which sets `CHIPS_MAC_SELF_UPDATE`)
//! updates itself: one built from a checkout is that checkout's, and a release would replace it.
//! Nor does a copy on a disk it can't be swapped on (a read-only one, or another than this Mac's
//! own). `CHIPS_MAC_UPDATES` names another feed, for a test.
//!
//! What the page is told is one of five states (`Said`), and an event whenever it changes. Where
//! the app can't replace itself without an administrator's password a release waits with `asks`:
//! it never goes in on its own, and Restart now asks for the password. A download that fails for
//! the network is tried again in an hour and tells nobody; a download that isn't Chips's, or a
//! swap that fails, is said in About, and the app stays as it was. The feed is the truth of what
//! should go in: a release waiting that it offers no more is dropped, and one that went in once
//! and left this app as old as before is said, never put in a second time.

use std::ffi::CString;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// What the page hears when the state changes.
pub const CHANGED: &str = "chips://update";
/// How long after opening the first look waits, so it never slows the app's start.
const FIRST_LOOK: Duration = Duration::from_secs(30);
/// How often it looks for a newer release.
const LOOK_EVERY: Duration = Duration::from_secs(24 * 60 * 60);
/// How soon it looks again after the network failed it.
const LOOK_AGAIN: Duration = Duration::from_secs(60 * 60);
/// How often it wakes to see whether a moment has come.
const TICK: Duration = Duration::from_secs(10 * 60);
/// The hours it may go in at night, by this Mac's clock: from two up to five in the morning, as
/// a computer from the install line updates itself.
const NIGHT_FROM_HOUR: i64 = 2;
const NIGHT_UNTIL_HOUR: i64 = 5;
/// How long nobody has touched this Mac before a window left open counts as nobody's.
const AWAY_SECS: f64 = 10.0 * 60.0;

/// What About says when a download isn't Chips's.
const NOT_SIGNED: &str = "The download wasn't signed by Chips, so it was thrown away.";
/// What About says when the download can't be kept.
const NO_ROOM: &str = "There wasn't room on this Mac to keep the download.";
/// What About says when the swap failed for anything but a password.
const NOT_SWAPPED: &str = "The app couldn't be replaced where it is. Get Chips from chipschat.ai.";
/// What About says when a release went in and the app that opens is still the one before.
const DIDNT_TAKE: &str =
    "It was installed, but the one before still opens. Get Chips again from chipschat.ai.";
/// What Restart now is answered when the password wasn't given.
const NEEDS_ADMIN: &str =
    "Chips wasn't updated: replacing it here needs an administrator's password.";
/// What Restart now is answered when the download is no longer the one that was checked.
const GONE: &str = "The download is gone from this Mac. Chips is getting it again.";

/// What the page is told, as `{"state": …}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum Said {
    /// This build doesn't update itself: one from a checkout, one run from where it was
    /// downloaded, or one on a disk it can't be swapped on.
    Off,
    /// Nothing newer is out, or it hasn't looked yet.
    Current,
    /// A newer release is downloading.
    Getting { version: String },
    /// A newer release is downloaded and checked. It goes in at the next moment it can, or, with
    /// `asks`, only on Restart now, which asks for an administrator's password.
    Ready {
        version: String,
        #[serde(skip_serializing_if = "std::ops::Not::not")]
        asks: bool,
    },
    /// It couldn't, and why, in words for a person. The app stays as it was.
    Failed { version: String, why: String },
}

/// An hour and a day by this Mac's clock; the day counts on by one each midnight.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct When {
    pub hour: i64,
    pub day: i64,
}

/// A release downloaded and checked, waiting to go in.
struct Waiting {
    update: Update,
    file: PathBuf,
    /// What the bytes that were checked against the key hash to: the file is read again when it
    /// goes in, perhaps days later, and anything else is not put in.
    digest: [u8; 32],
    /// When it was ready, so a night gone by with it waiting is known.
    since: Option<When>,
}

#[derive(Default)]
struct Inner {
    said: Option<Said>,
    waiting: Option<Waiting>,
    /// Set once the swap has begun, so quitting after it doesn't try again.
    installing: bool,
    /// The day, by this Mac's clock, it last tried on its own: once a day.
    tried_on: Option<i64>,
    /// A release whose swap failed: not downloaded again while this app runs.
    failed: Option<String>,
    /// The download was found gone: look at the next tick, not in a day.
    look_now: bool,
}

/// The app's one updater state, managed by Tauri.
#[derive(Default)]
pub struct Updates(Mutex<Inner>);

/// The moment a release goes in, which says whether the app opens again and how.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Moment {
    /// The person quit: it goes in, and the app stays closed.
    Quit,
    /// Nobody at this Mac, at night or after a night gone by: it goes in and the app opens again
    /// as it was.
    Alone,
    /// Restart now: it goes in and the app opens again with its window.
    Asked,
}

/// Where the app is, for swapping it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Place {
    /// Its person's to change: it goes in on its own.
    Mine,
    /// Only with an administrator's password: Restart now asks for it.
    Asks,
    /// A disk it can't be swapped on: read-only, or another than the one the swap is made on.
    Elsewhere,
}

/// Whether a thing can be written to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Write {
    Yes,
    No,
    /// On a read-only disk: no password changes that.
    Never,
}

/// Whether this build updates itself, and from which feed: `Some(None)` is the feed the config
/// names. `named` is `CHIPS_MAC_UPDATES`, `handed_out` whether the build was made to hand out.
pub fn source_from(named: Option<&str>, handed_out: bool) -> Option<Option<String>> {
    match named.map(str::trim) {
        Some(url) if !url.is_empty() => Some(Some(url.to_string())),
        _ => handed_out.then_some(None),
    }
}

fn source() -> Option<Option<String>> {
    source_from(
        std::env::var("CHIPS_MAC_UPDATES").ok().as_deref(),
        option_env!("CHIPS_MAC_SELF_UPDATE") == Some("1"),
    )
}

/// The `.app` this program runs from, where it can be swapped: not `tauri dev`, and not a copy
/// macOS made to run a download from.
fn bundle() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|program| crate::login::bundle_of(&program))
}

/// Where the app is, from what can be written: the swap moves the app out of its folder and the
/// new one in, so both must be its person's, on the disk the new one is unpacked on.
pub fn place(one_disk: bool, app: Write, folder: Write) -> Place {
    match (one_disk, app, folder) {
        (false, _, _) | (_, Write::Never, _) | (_, _, Write::Never) => Place::Elsewhere,
        (true, Write::Yes, Write::Yes) => Place::Mine,
        _ => Place::Asks,
    }
}

fn writable(path: &Path) -> Write {
    let Ok(path) = CString::new(path.as_os_str().as_encoded_bytes()) else {
        return Write::No;
    };
    // SAFETY: `access` reads the NUL-terminated path it is handed and nothing else.
    if unsafe { libc::access(path.as_ptr(), libc::W_OK) } == 0 {
        return Write::Yes;
    }
    if std::io::Error::last_os_error().raw_os_error() == Some(libc::EROFS) {
        Write::Never
    } else {
        Write::No
    }
}

/// Where this bundle is. `scratch` is where the new app is unpacked before it is moved in (the
/// updater's temporary folder): a move between two disks isn't one.
pub fn place_of(bundle: &Path, scratch: &Path) -> Place {
    use std::os::unix::fs::MetadataExt;
    let disk = |path: &Path| std::fs::metadata(path).map(|data| data.dev()).ok();
    let Some(folder) = bundle.parent() else {
        return Place::Elsewhere;
    };
    let one_disk = disk(bundle).is_some() && disk(bundle) == disk(scratch);
    place(one_disk, writable(bundle), writable(folder))
}

fn place_here() -> Option<Place> {
    bundle().map(|bundle| place_of(&bundle, &std::env::temp_dir()))
}

/// What the page is told now.
#[tauri::command]
pub fn update_state(updates: State<'_, Updates>) -> Said {
    updates
        .0
        .lock()
        .ok()
        .and_then(|inner| inner.said.clone())
        .unwrap_or(Said::Off)
}

/// Restart now, from About: the release waiting goes in and the app opens again. An
/// administrator's password may be asked for here, since the person is there to give it.
#[tauri::command]
pub async fn update_now(app: AppHandle) -> Result<(), String> {
    // Off the main thread: the swap takes seconds, and the password prompt needs the main thread.
    tauri::async_runtime::spawn_blocking(move || go_in(&app, Moment::Asked))
        .await
        .map_err(|_| "Chips couldn't update.".to_string())?
}

fn wall_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |since| since.as_secs())
}

/// Whether it is time to look: the time set has come, or the clock was set back past it.
pub fn look_due(now: u64, next: u64) -> bool {
    now >= next || next - now > LOOK_EVERY.as_secs()
}

/// Starts looking, on a thread of its own, for the life of the app.
pub fn start(app: &AppHandle) {
    let Some(feed) = source() else {
        say(app, Said::Off);
        return;
    };
    if !matches!(place_here(), Some(Place::Mine | Place::Asks)) {
        eprintln!("Chips for Mac's update: off, this copy is where it can't be swapped");
        say(app, Said::Off);
        return;
    }
    if let Some(folder) = cache(app) {
        clear(&folder);
        took_settle(&folder, &app.package_info().version.to_string());
    }
    say(app, Said::Current);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_LOOK);
        // By the clock on the wall: a Mac asleep most of the day still looks once a day.
        let mut next_look = 0;
        loop {
            let asked = app
                .state::<Updates>()
                .0
                .lock()
                .is_ok_and(|mut inner| std::mem::take(&mut inner.look_now));
            if asked || look_due(wall_secs(), next_look) {
                let wait = tauri::async_runtime::block_on(look(&app, feed.as_deref()));
                next_look = wall_secs() + wait.as_secs();
            }
            when_alone(&app);
            std::thread::sleep(TICK);
        }
    });
}

/// What a look does with what the feed offers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Next {
    /// Nothing: what is offered waits already, or its swap failed while this app ran.
    Rest,
    /// Nothing newer is offered: whatever waits is dropped (a release taken back).
    Current,
    /// What is offered went in once and this app is still older: said, never put in again.
    DidntTake,
    /// Downloaded, in place of anything else waiting.
    Get,
}

/// What to do with the release the feed offers this app (none, when nothing newer is out), given
/// the one waiting, the one last put in, and the one whose swap failed.
pub fn next(
    offered: Option<&str>,
    waiting: Option<&str>,
    took: Option<&str>,
    failed: Option<&str>,
) -> Next {
    let Some(offered) = offered else {
        return Next::Current;
    };
    if waiting == Some(offered) || failed == Some(offered) {
        Next::Rest
    } else if took == Some(offered) {
        Next::DidntTake
    } else {
        Next::Get
    }
}

/// One look: a newer release downloaded and checked, or nothing. How long until the next.
async fn look(app: &AppHandle, feed: Option<&str>) -> Duration {
    let updater = match feed {
        Some(url) => url
            .parse()
            .map_err(|_| "its address isn't one".to_string())
            .and_then(|url| {
                app.updater_builder()
                    .endpoints(vec![url])
                    .map_err(|error| error.to_string())
            })
            .and_then(|builder| builder.build().map_err(|error| error.to_string())),
        None => app
            .updater_builder()
            .build()
            .map_err(|error| error.to_string()),
    };
    let updater = match updater {
        Ok(updater) => updater,
        Err(why) => {
            eprintln!("Chips for Mac's update: the feed can't be read: {why}");
            return LOOK_EVERY;
        }
    };
    let offered = match updater.check().await {
        Ok(offered) => offered,
        // The network or the feed failed: tried again later, telling nobody.
        Err(error) => {
            eprintln!("Chips for Mac's update: the look failed: {error}");
            return LOOK_AGAIN;
        }
    };
    let took = cache(app).and_then(|folder| took_read(&folder));
    let (waiting, failed) = match app.state::<Updates>().0.lock() {
        // Going in already: what the feed says now changes nothing.
        Ok(inner) if inner.installing => return LOOK_AGAIN,
        Ok(inner) => (
            inner.waiting.as_ref().map(|w| w.update.version.clone()),
            inner.failed.clone(),
        ),
        Err(_) => return LOOK_AGAIN,
    };
    let step = next(
        offered.as_ref().map(|update| update.version.as_str()),
        waiting.as_deref(),
        took.as_deref(),
        failed.as_deref(),
    );
    match (step, offered) {
        (Next::Rest, _) => LOOK_EVERY,
        (Next::DidntTake, Some(update)) => {
            drop_waiting(app);
            say(
                app,
                Said::Failed {
                    version: update.version,
                    why: DIDNT_TAKE.to_string(),
                },
            );
            LOOK_EVERY
        }
        (Next::Get, Some(update)) => {
            drop_waiting(app);
            get(app, update).await
        }
        _ => {
            drop_waiting(app);
            say(app, Said::Current);
            LOOK_EVERY
        }
    }
}

/// The release waiting is waited for no more, and its file goes: unless it is going in.
fn drop_waiting(app: &AppHandle) {
    let dropped = match app.state::<Updates>().0.lock() {
        Ok(mut inner) if !inner.installing => inner.waiting.take(),
        _ => None,
    };
    if let Some(waiting) = dropped {
        let _ = std::fs::remove_file(waiting.file);
    }
}

/// The release offered, downloaded and checked, then waiting. How long until the next look.
async fn get(app: &AppHandle, update: Update) -> Duration {
    let version = update.version.clone();
    say(
        app,
        Said::Getting {
            version: version.clone(),
        },
    );
    match download(app, &update).await {
        Ok((file, digest)) => {
            let asks = place_here() == Some(Place::Asks);
            if let Ok(mut inner) = app.state::<Updates>().0.lock() {
                inner.waiting = Some(Waiting {
                    update,
                    file,
                    digest,
                    since: now_here(),
                });
            }
            say(app, Said::Ready { version, asks });
            LOOK_EVERY
        }
        Err(Fault::Network) => {
            say(app, Said::Current);
            LOOK_AGAIN
        }
        Err(Fault::Said(why)) => {
            say(app, Said::Failed { version, why });
            LOOK_EVERY
        }
    }
}

/// Why a download didn't end in a release waiting.
#[derive(Debug, PartialEq, Eq)]
pub enum Fault {
    /// The network: tried again in an hour.
    Network,
    /// Anything a person should hear.
    Said(String),
}

/// What a failed download was: not Chips's, or the network's.
pub fn fault_of(error: &tauri_plugin_updater::Error) -> Fault {
    use tauri_plugin_updater::Error;
    match error {
        Error::Minisign(_)
        | Error::SignatureUtf8(_)
        | Error::Base64(_)
        | Error::SignedVersionMismatch { .. }
        | Error::MissingSignedVersion => Fault::Said(NOT_SIGNED.to_string()),
        _ => Fault::Network,
    }
}

/// The release downloaded and checked against the key, then kept in the app's cache, with what
/// its bytes hash to.
async fn download(app: &AppHandle, update: &Update) -> Result<(PathBuf, [u8; 32]), Fault> {
    let bytes = update.download(|_, _| {}, || {}).await.map_err(|error| {
        eprintln!("Chips for Mac's update: the download failed: {error}");
        fault_of(&error)
    })?;
    let no_room = || Fault::Said(NO_ROOM.to_string());
    let folder = cache(app).ok_or_else(no_room)?;
    let file = keep(&folder, &update.version, &bytes).map_err(|_| no_room())?;
    Ok((file, digest(&bytes)))
}

/// Where a download waits, and the note of the release last put in.
fn cache(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_cache_dir()
        .ok()
        .map(|dir| dir.join("update"))
}

const PARTIAL: &str = "download.part";
const TOOK: &str = "installed";

/// A download kept: written whole before it is named, so a half-written file is never one that
/// waits, and nothing half-written is left behind. `version` is a release's number, which the
/// feed's reader has parsed as one.
pub fn keep(folder: &Path, version: &str, bytes: &[u8]) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(folder)?;
    let file = folder.join(format!("Chips-{version}.app.tar.gz"));
    let partial = folder.join(PARTIAL);
    let written = std::fs::write(&partial, bytes).and_then(|()| std::fs::rename(&partial, &file));
    if written.is_err() {
        let _ = std::fs::remove_file(&partial);
    }
    written.map(|()| file)
}

/// The cache emptied of downloads an earlier run left: nothing in it was checked by this one.
/// The note of the release last put in stays.
pub fn clear(folder: &Path) {
    let Ok(entries) = std::fs::read_dir(folder) else {
        return;
    };
    for entry in entries.flatten() {
        if entry.file_name() != TOOK {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

pub fn digest(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}

/// The download read again, if it is still the bytes that were checked.
pub fn checked(file: &Path, expected: &[u8; 32]) -> Option<Vec<u8>> {
    std::fs::read(file)
        .ok()
        .filter(|bytes| &digest(bytes) == expected)
}

/// The release last put in, by this app or the one it replaced.
pub fn took_read(folder: &Path) -> Option<String> {
    std::fs::read_to_string(folder.join(TOOK))
        .ok()
        .map(|version| version.trim().to_string())
        .filter(|version| !version.is_empty())
}

pub fn took_write(folder: &Path, version: &str) {
    let _ = std::fs::create_dir_all(folder);
    let _ = std::fs::write(folder.join(TOOK), version);
}

/// The note is done with once the app that opens is the release it names.
pub fn took_settle(folder: &Path, own: &str) {
    if took_read(folder).as_deref() == Some(own) {
        let _ = std::fs::remove_file(folder.join(TOOK));
    }
}

/// The state changed: kept, and the page told.
fn say(app: &AppHandle, said: Said) {
    if let Ok(mut inner) = app.state::<Updates>().0.lock() {
        if inner.said.as_ref() == Some(&said) {
            return;
        }
        inner.said = Some(said.clone());
    }
    // A line in the app's own output, for anyone finding out why it did or didn't update.
    eprintln!("Chips for Mac's update: {said:?}");
    let _ = app.emit(CHANGED, said);
}

/// Once a day, when a release waits and nobody is at this Mac: at night, or at any hour once a
/// night has gone by with it waiting (a Mac asleep through every night has no other moment).
fn when_alone(app: &AppHandle) {
    let Some(now) = now_here() else {
        return;
    };
    let (since, tried_on) = match app.state::<Updates>().0.lock() {
        Ok(inner) if !inner.installing => match inner.waiting.as_ref() {
            Some(waiting) => (waiting.since, inner.tried_on),
            None => return,
        },
        _ => return,
    };
    let here = someone_here(window_shown(app), idle_secs());
    if !may_go_in(now, since, tried_on, here) {
        return;
    }
    if let Ok(mut inner) = app.state::<Updates>().0.lock() {
        inner.tried_on = Some(now.day);
    }
    let _ = go_in(app, Moment::Alone);
}

/// How many nights have ended by a moment: one more from five each morning.
fn nights_ended(at: When) -> i64 {
    at.day + i64::from(at.hour >= NIGHT_UNTIL_HOUR)
}

/// Whether a release waiting since `since` may go in on its own now: nobody here, not tried yet
/// today, and either the night's hours or a night ended with it waiting.
pub fn may_go_in(now: When, since: Option<When>, tried_on: Option<i64>, here: bool) -> bool {
    let at_night = (NIGHT_FROM_HOUR..NIGHT_UNTIL_HOUR).contains(&now.hour);
    let night_gone_by = since.is_some_and(|since| nights_ended(now) > nights_ended(since));
    !here && tried_on != Some(now.day) && (at_night || night_gone_by)
}

/// Someone at this Mac, for the app's window: it is shown, and keys or pointer were touched in
/// the last ten minutes. With its window away the app going and coming back is seen by nobody.
pub fn someone_here(window_shown: bool, idle_secs: f64) -> bool {
    // Written so an idle time that can't be read counts as someone there.
    let away = idle_secs >= AWAY_SECS;
    window_shown && !away
}

fn window_shown(app: &AppHandle) -> bool {
    app.get_webview_window(crate::WINDOW)
        .is_some_and(|window| window.is_visible().unwrap_or(false))
}

/// How long since anyone touched this Mac's keys or pointer.
#[cfg(target_os = "macos")]
fn idle_secs() -> f64 {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: i32, event: u32) -> f64;
    }
    // The session's events of every kind: a person's own, and ones passed on for them (a screen
    // shared from another Mac).
    // SAFETY: a function of two numbers that reads a clock the window server keeps.
    unsafe { CGEventSourceSecondsSinceLastEventType(0, u32::MAX) }
}

#[cfg(not(target_os = "macos"))]
fn idle_secs() -> f64 {
    f64::NAN
}

/// The hour and the day `offset` seconds east of Greenwich, `secs` after 1970 began.
pub fn when(secs: i64, offset: i64) -> When {
    let local = secs + offset;
    When {
        hour: local.rem_euclid(86_400) / 3_600,
        day: local.div_euclid(86_400),
    }
}

/// The hour and the day by this Mac's clock.
fn now_here() -> Option<When> {
    let secs = i64::try_from(wall_secs()).ok()?;
    let time = libc::time_t::try_from(secs).ok()?;
    // SAFETY: `localtime_r` writes only the `tm` it is handed, which lives on this stack.
    let mut tm: libc::tm = unsafe { std::mem::zeroed() };
    let done = unsafe { libc::localtime_r(&time, &mut tm) };
    if done.is_null() {
        return None;
    }
    Some(when(secs, tm.tm_gmtoff))
}

/// The person quit: a release waiting goes in, if the app can swap itself without asking.
pub fn on_exit(app: &AppHandle) {
    let ready = app
        .state::<Updates>()
        .0
        .lock()
        .is_ok_and(|inner| inner.waiting.is_some() && !inner.installing);
    if ready {
        let _ = go_in(app, Moment::Quit);
    }
}

/// Why a swap didn't happen.
#[derive(Debug, PartialEq, Eq)]
pub enum Unswapped {
    /// The download is gone, or no longer the bytes that were checked.
    Gone,
    /// The password wasn't given.
    Refused,
    /// Anything else, as the system said it.
    Broke(String),
}

/// What a failed swap was.
pub fn unswapped_of(error: &tauri_plugin_updater::Error) -> Unswapped {
    match error {
        tauri_plugin_updater::Error::Io(io)
            if io.kind() == std::io::ErrorKind::PermissionDenied =>
        {
            Unswapped::Refused
        }
        other => Unswapped::Broke(other.to_string()),
    }
}

/// The release waiting goes in: the bundle swapped whole, then the app opened again from it,
/// unless the person quit. On its own, only where it can swap itself without a password.
fn go_in(app: &AppHandle, moment: Moment) -> Result<(), String> {
    let Some(bundle) = bundle() else {
        return Err("This copy of Chips can't update itself.".to_string());
    };
    let state = app.state::<Updates>();
    let (update, file, digest) = {
        let mut inner = state
            .0
            .lock()
            .map_err(|_| "Chips couldn't update.".to_string())?;
        if inner.installing {
            return Err("Chips is updating already.".to_string());
        }
        let Some(waiting) = inner.waiting.as_ref() else {
            return Err("No update is ready.".to_string());
        };
        // Nobody is asked for a password by an app that came to it on its own: the release
        // waits, said with `asks`, for Restart now.
        if moment != Moment::Asked && place_here() != Some(Place::Mine) {
            return Err(NEEDS_ADMIN.to_string());
        }
        let found = (waiting.update.clone(), waiting.file.clone(), waiting.digest);
        inner.installing = true;
        found
    };
    let shown = window_shown(app);
    let swapped = checked(&file, &digest)
        .ok_or(Unswapped::Gone)
        .and_then(|bytes| update.install(bytes).map_err(|error| unswapped_of(&error)));
    if let Err(why) = swapped {
        return Err(not_swapped(app, &update.version, &file, why));
    }
    if let Some(folder) = cache(app) {
        took_write(&folder, &update.version);
    }
    let _ = std::fs::remove_file(&file);
    if moment != Moment::Quit {
        open_again(&bundle, moment == Moment::Alone && !shown);
        app.exit(0);
    }
    Ok(())
}

/// A swap that didn't happen: what waits and what is said after it, and the words for whoever
/// asked. A password not given leaves the release waiting; a download gone is fetched again; a
/// swap that broke is said, and that release left alone while this app runs.
fn not_swapped(app: &AppHandle, version: &str, file: &Path, why: Unswapped) -> String {
    let version = version.to_string();
    if let Ok(mut inner) = app.state::<Updates>().0.lock() {
        inner.installing = false;
        match &why {
            Unswapped::Refused => {}
            Unswapped::Gone => {
                inner.waiting = None;
                inner.look_now = true;
            }
            Unswapped::Broke(_) => {
                inner.waiting = None;
                inner.failed = Some(version.clone());
            }
        }
    }
    match why {
        Unswapped::Refused => {
            say(
                app,
                Said::Ready {
                    version,
                    asks: true,
                },
            );
            NEEDS_ADMIN.to_string()
        }
        Unswapped::Gone => {
            let _ = std::fs::remove_file(file);
            say(app, Said::Current);
            GONE.to_string()
        }
        Unswapped::Broke(said) => {
            eprintln!("Chips for Mac's update: the swap failed: {said}");
            let _ = std::fs::remove_file(file);
            say(
                app,
                Said::Failed {
                    version,
                    why: NOT_SWAPPED.to_string(),
                },
            );
            NOT_SWAPPED.to_string()
        }
    }
}

/// The app opened again from the new bundle once this one has gone, so the copy starting never
/// meets the copy ending (a copy opened in the background gives way to one running). In a
/// process group of its own, so launchd ending the login item's group doesn't end it too.
fn open_again(bundle: &Path, quietly: bool) {
    use std::os::unix::process::CommandExt;
    let _ = std::process::Command::new("/bin/sh")
        .arg("-c")
        .arg(reopen_script(std::process::id(), quietly, "/usr/bin/open"))
        .arg(bundle)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .process_group(0)
        .spawn();
}

/// The shell that waits for this process to end, then opens the bundle (`$0`) again with `open`,
/// as the menu bar's icon alone when `quietly`.
pub fn reopen_script(pid: u32, quietly: bool, open: &str) -> String {
    let args = if quietly {
        format!(" --args {}", crate::login::BACKGROUND)
    } else {
        String::new()
    };
    format!(
        "i=0; while kill -0 {pid} 2>/dev/null && [ $i -lt 300 ]; do sleep 0.1; i=$((i+1)); done; exec {open} -n \"$0\"{args}"
    )
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::{
        checked, clear, digest, fault_of, keep, look_due, may_go_in, next, place, place_of,
        reopen_script, someone_here, source_from, took_read, took_settle, took_write, unswapped_of,
        when, Fault, Next, Place, Said, Unswapped, When, Write,
    };

    /// A folder of this test's own, gone when the test ends.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir =
                std::env::temp_dir().join(format!("chips-update-{name}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = allow(&self.0, 0o755);
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn allow(path: &Path, mode: u32) -> std::io::Result<()> {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode))
    }

    fn at(day: i64, hour: i64) -> When {
        When { hour, day }
    }

    #[test]
    fn it_goes_in_at_night_once_when_nobody_is_here() {
        let since = Some(at(10, 20));
        assert!(may_go_in(at(11, 3), since, None, false));
        assert!(may_go_in(at(11, 2), since, Some(10), false));
        assert!(may_go_in(at(11, 4), since, None, false));
        // Not before two, not twice in a day, not with someone here.
        assert!(!may_go_in(at(11, 1), since, None, false));
        assert!(!may_go_in(at(11, 3), since, Some(11), false));
        assert!(!may_go_in(at(11, 3), since, None, true));
        // The night it was ready in is a night too.
        assert!(may_go_in(at(11, 3), Some(at(11, 2)), None, false));
    }

    #[test]
    fn a_release_ready_today_waits_for_the_night() {
        // Ready in the morning, the evening, or just after midnight: no night has ended since.
        assert!(!may_go_in(at(10, 14), Some(at(10, 9)), None, false));
        assert!(!may_go_in(at(10, 23), Some(at(10, 9)), None, false));
        assert!(!may_go_in(at(11, 1), Some(at(10, 23)), None, false));
        assert!(!may_go_in(at(11, 0), Some(at(11, 0)), None, false));
        // Five is the first hour that is day again.
        assert!(!may_go_in(at(10, 5), Some(at(10, 4)), Some(10), false));
    }

    #[test]
    fn after_a_night_gone_by_it_goes_in_at_any_hour_when_nobody_is_here() {
        // A Mac asleep from the evening to the morning: the night ended with the release waiting.
        let since = Some(at(10, 20));
        assert!(may_go_in(at(11, 5), since, None, false));
        assert!(may_go_in(at(11, 9), since, None, false));
        assert!(may_go_in(at(13, 16), since, Some(12), false));
        // Ready during the night's last minutes, and the Mac slept through them.
        assert!(may_go_in(at(11, 8), Some(at(11, 4)), None, false));
        // Still once a day, and never with someone here.
        assert!(!may_go_in(at(11, 9), since, Some(11), false));
        assert!(!may_go_in(at(11, 9), since, None, true));
        // With no clock to say when it was ready, only the night's hours count.
        assert!(!may_go_in(at(11, 9), None, None, false));
        assert!(may_go_in(at(11, 3), None, None, false));
    }

    #[test]
    fn the_hour_and_the_day_are_this_macs_own() {
        // Midnight, the first of January 2027, Greenwich: 20454 days after 1970 began.
        let new_year = 20_454 * 86_400;
        assert_eq!(when(new_year, 0), at(20_454, 0));
        // The day counts on by one over a year's end, wherever the Mac is.
        assert_eq!(when(new_year - 1, 0), at(20_453, 23));
        assert_eq!(when(new_year, -8 * 3_600), at(20_453, 16));
        assert_eq!(when(new_year, 5 * 3_600 + 1_800), at(20_454, 5));
        assert_eq!(when(new_year + 3 * 3_600 + 59 * 60, 0), at(20_454, 3));
        // West of Greenwich before 1970 began, the numbers still count the right way.
        assert_eq!(when(3_600, -2 * 3_600), at(-1, 23));
    }

    #[test]
    fn someone_is_here_while_the_window_is_shown_and_the_mac_was_touched_lately() {
        assert!(someone_here(true, 0.0));
        assert!(someone_here(true, 599.0));
        assert!(!someone_here(true, 600.0));
        assert!(!someone_here(true, 86_400.0));
        // With the window away nobody sees the app go and come back.
        assert!(!someone_here(false, 0.0));
        // An idle time that can't be read counts as someone there.
        assert!(someone_here(true, f64::NAN));
        assert!(someone_here(true, -1.0));
    }

    #[test]
    fn it_looks_once_a_day_by_the_clock_on_the_wall() {
        assert!(look_due(1_000, 0));
        assert!(look_due(1_000, 1_000));
        assert!(!look_due(1_000, 1_001));
        assert!(!look_due(1_000, 1_000 + 24 * 3_600));
        // The clock set back past the day it was waiting out: it looks now, not in a year.
        assert!(look_due(1_000, 1_000 + 24 * 3_600 + 1));
    }

    #[test]
    fn the_feed_is_the_truth_of_what_goes_in() {
        // Nothing newer out: nothing waits, even a release that waited (taken back).
        assert_eq!(next(None, None, None, None), Next::Current);
        assert_eq!(next(None, Some("1.2.6"), None, None), Next::Current);
        // A newer one is downloaded, in place of an older one waiting or one taken back.
        assert_eq!(next(Some("1.2.6"), None, None, None), Next::Get);
        assert_eq!(next(Some("1.2.7"), Some("1.2.6"), None, None), Next::Get);
        assert_eq!(next(Some("1.2.6"), Some("1.2.7"), None, None), Next::Get);
        // The one waiting is the one offered: nothing to do.
        assert_eq!(next(Some("1.2.6"), Some("1.2.6"), None, None), Next::Rest);
        // One whose swap failed isn't downloaded again while this app runs; a newer one is.
        assert_eq!(next(Some("1.2.6"), None, None, Some("1.2.6")), Next::Rest);
        assert_eq!(next(Some("1.2.7"), None, None, Some("1.2.6")), Next::Get);
    }

    #[test]
    fn a_release_that_went_in_and_left_the_app_as_old_is_never_put_in_twice() {
        assert_eq!(
            next(Some("1.2.6"), None, Some("1.2.6"), None),
            Next::DidntTake
        );
        // The note of an older release holds nothing back.
        assert_eq!(next(Some("1.2.7"), None, Some("1.2.6"), None), Next::Get);
    }

    #[test]
    fn the_note_of_the_release_last_put_in_lasts_until_that_release_opens() {
        let scratch = Scratch::new("took");
        let folder = scratch.path().join("update");
        assert_eq!(took_read(&folder), None);
        took_write(&folder, "1.2.6");
        assert_eq!(took_read(&folder).as_deref(), Some("1.2.6"));
        // The app that opens is still the one before: the note stays.
        took_settle(&folder, "1.2.5");
        assert_eq!(took_read(&folder).as_deref(), Some("1.2.6"));
        // The new one opens: done with.
        took_settle(&folder, "1.2.6");
        assert_eq!(took_read(&folder), None);
        // An empty note is no note.
        std::fs::write(folder.join("installed"), " \n").unwrap();
        assert_eq!(took_read(&folder), None);
    }

    #[test]
    fn a_download_is_kept_whole_and_read_again_as_the_bytes_that_were_checked() {
        let scratch = Scratch::new("keep");
        let folder = scratch.path().join("update");
        let file = keep(&folder, "1.2.6", b"the app").unwrap();
        assert_eq!(file, folder.join("Chips-1.2.6.app.tar.gz"));
        assert!(!folder.join("download.part").exists());
        let expected = digest(b"the app");
        assert_eq!(checked(&file, &expected).as_deref(), Some(&b"the app"[..]));
        // Changed while it waited, or gone: not the download that was checked.
        std::fs::write(&file, b"another app").unwrap();
        assert_eq!(checked(&file, &expected), None);
        std::fs::remove_file(&file).unwrap();
        assert_eq!(checked(&file, &expected), None);
    }

    #[test]
    fn a_download_that_cant_be_kept_leaves_nothing_half_written() {
        let scratch = Scratch::new("keep-fails");
        // The name it would take is a folder: the bytes are written, then can't be named.
        let folder = scratch.path().join("update");
        std::fs::create_dir_all(folder.join("Chips-1.2.6.app.tar.gz").join("in")).unwrap();
        assert!(keep(&folder, "1.2.6", b"the app").is_err());
        assert!(!folder.join("download.part").exists());
        // No folder to keep it in at all.
        let file = scratch.path().join("a-file");
        std::fs::write(&file, b"x").unwrap();
        assert!(keep(&file.join("update"), "1.2.6", b"the app").is_err());
    }

    #[test]
    fn an_earlier_runs_downloads_are_cleared_and_the_note_stays() {
        let scratch = Scratch::new("clear");
        let folder = scratch.path().join("update");
        keep(&folder, "1.2.6", b"old").unwrap();
        std::fs::write(folder.join("download.part"), b"half").unwrap();
        took_write(&folder, "1.2.5");
        clear(&folder);
        let left: Vec<_> = std::fs::read_dir(&folder)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(left, ["installed"]);
        // No folder yet: nothing to clear.
        clear(&scratch.path().join("none"));
    }

    #[test]
    fn where_the_app_is_says_whether_it_goes_in_on_its_own() {
        assert_eq!(place(true, Write::Yes, Write::Yes), Place::Mine);
        // The folder or the app is someone else's: an administrator's password swaps it.
        assert_eq!(place(true, Write::Yes, Write::No), Place::Asks);
        assert_eq!(place(true, Write::No, Write::Yes), Place::Asks);
        assert_eq!(place(true, Write::No, Write::No), Place::Asks);
        // A read-only disk, or another disk than the swap is made on: no password changes that.
        assert_eq!(place(true, Write::Never, Write::Yes), Place::Elsewhere);
        assert_eq!(place(true, Write::Yes, Write::Never), Place::Elsewhere);
        assert_eq!(place(false, Write::Yes, Write::Yes), Place::Elsewhere);
        assert_eq!(place(false, Write::No, Write::No), Place::Elsewhere);
    }

    #[test]
    fn an_app_in_its_persons_folder_is_theirs_and_one_in_a_locked_folder_asks() {
        let scratch = Scratch::new("place");
        let folder = scratch.path().join("Applications");
        let app = folder.join("Chips.app");
        std::fs::create_dir_all(&app).unwrap();
        assert_eq!(place_of(&app, scratch.path()), Place::Mine);
        allow(&folder, 0o555).unwrap();
        assert_eq!(place_of(&app, scratch.path()), Place::Asks);
        allow(&folder, 0o755).unwrap();
        allow(&app, 0o555).unwrap();
        assert_eq!(place_of(&app, scratch.path()), Place::Asks);
        allow(&app, 0o755).unwrap();
        // An app that isn't there, or a scratch folder that isn't: nothing to swap.
        assert_eq!(
            place_of(&folder.join("Gone.app"), scratch.path()),
            Place::Elsewhere
        );
        assert_eq!(
            place_of(&app, &scratch.path().join("gone")),
            Place::Elsewhere
        );
        assert_eq!(place_of(Path::new("/"), scratch.path()), Place::Elsewhere);
    }

    #[test]
    fn only_a_build_to_hand_out_updates_itself_unless_a_feed_is_named() {
        assert_eq!(source_from(None, false), None);
        assert_eq!(source_from(None, true), Some(None));
        assert_eq!(source_from(Some("  "), false), None);
        assert_eq!(source_from(Some(""), true), Some(None));
        assert_eq!(
            source_from(Some(" https://example.test/latest.json "), false),
            Some(Some("https://example.test/latest.json".to_string()))
        );
    }

    #[test]
    fn a_download_that_isnt_chipss_is_said_and_the_networks_failures_are_not() {
        use tauri_plugin_updater::Error;
        let not_signed = Fault::Said(super::NOT_SIGNED.to_string());
        assert_eq!(fault_of(&Error::SignatureUtf8("x".to_string())), not_signed);
        assert_eq!(fault_of(&Error::MissingSignedVersion), not_signed);
        assert_eq!(
            fault_of(&Error::SignedVersionMismatch {
                signed: "1.2.6".to_string(),
                announced: "1.2.7".to_string(),
            }),
            not_signed
        );
        assert_eq!(fault_of(&Error::Network("503".to_string())), Fault::Network);
        assert_eq!(fault_of(&Error::ReleaseNotFound), Fault::Network);
        let io = std::io::Error::new(std::io::ErrorKind::TimedOut, "slow");
        assert_eq!(fault_of(&Error::Io(io)), Fault::Network);
    }

    #[test]
    fn a_password_not_given_is_told_from_a_swap_that_broke() {
        use tauri_plugin_updater::Error;
        let denied = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "no");
        assert_eq!(unswapped_of(&Error::Io(denied)), Unswapped::Refused);
        let other = std::io::Error::new(std::io::ErrorKind::CrossesDevices, "two disks");
        assert_eq!(
            unswapped_of(&Error::Io(other)),
            Unswapped::Broke("two disks".to_string())
        );
        assert!(matches!(
            unswapped_of(&Error::BinaryNotFoundInArchive),
            Unswapped::Broke(_)
        ));
    }

    #[test]
    fn it_opens_again_quietly_or_with_its_window() {
        let quiet = reopen_script(42, true, "/usr/bin/open");
        assert!(quiet.starts_with("i=0; while kill -0 42 "));
        assert!(quiet.ends_with("exec /usr/bin/open -n \"$0\" --args --background"));
        let shown = reopen_script(42, false, "/usr/bin/open");
        assert!(shown.ends_with("exec /usr/bin/open -n \"$0\""));
    }

    #[test]
    fn it_opens_again_only_once_the_app_before_has_gone() {
        use std::os::unix::fs::PermissionsExt;
        let scratch = Scratch::new("reopen");
        let said = scratch.path().join("said");
        // A stand-in for `open` that writes down when it ran and what it was handed.
        let open = scratch.path().join("open");
        std::fs::write(
            &open,
            format!("#!/bin/sh\nprintf '%s\\n' \"$@\" > '{}'\n", said.display()),
        )
        .unwrap();
        std::fs::set_permissions(&open, std::fs::Permissions::from_mode(0o755)).unwrap();
        // The app before: a process that lives a little longer.
        let mut before = std::process::Command::new("/bin/sleep")
            .arg("0.6")
            .spawn()
            .unwrap();
        let bundle = scratch.path().join("My Apps").join("Chips.app");
        let mut shell = std::process::Command::new("/bin/sh")
            .arg("-c")
            .arg(reopen_script(
                before.id(),
                true,
                &open.display().to_string(),
            ))
            .arg(&bundle)
            .spawn()
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(250));
        assert!(!said.exists(), "opened while the app before still ran");
        before.wait().unwrap();
        assert!(shell.wait().unwrap().success());
        // The bundle's path whole, spaces and all, then the word that keeps the window away.
        assert_eq!(
            std::fs::read_to_string(&said).unwrap(),
            format!("-n\n{}\n--args\n--background\n", bundle.display())
        );
    }

    #[test]
    fn the_page_hears_a_state_and_its_version() {
        let ready = serde_json::to_value(Said::Ready {
            version: "1.2.6".to_string(),
            asks: false,
        })
        .unwrap();
        assert_eq!(
            ready,
            serde_json::json!({"state": "ready", "version": "1.2.6"})
        );
        let asks = serde_json::to_value(Said::Ready {
            version: "1.2.6".to_string(),
            asks: true,
        })
        .unwrap();
        assert_eq!(
            asks,
            serde_json::json!({"state": "ready", "version": "1.2.6", "asks": true})
        );
        let failed = serde_json::to_value(Said::Failed {
            version: "1.2.6".to_string(),
            why: "x".to_string(),
        })
        .unwrap();
        assert_eq!(
            failed,
            serde_json::json!({"state": "failed", "version": "1.2.6", "why": "x"})
        );
        assert_eq!(
            serde_json::to_value(Said::Getting {
                version: "1.2.6".to_string()
            })
            .unwrap(),
            serde_json::json!({"state": "getting", "version": "1.2.6"})
        );
        assert_eq!(
            serde_json::to_value(Said::Off).unwrap(),
            serde_json::json!({"state": "off"})
        );
        assert_eq!(
            serde_json::to_value(Said::Current).unwrap(),
            serde_json::json!({"state": "current"})
        );
    }

    #[test]
    fn the_feed_the_release_tool_writes_is_one_the_updater_reads() {
        // The same file `tools/guardrails/desktop-sign.test.ts` holds `updateFeed` to.
        let feed = include_str!("../../../../tools/desktop/fixtures/latest.json");
        let release: tauri_plugin_updater::RemoteRelease = serde_json::from_str(feed).unwrap();
        assert_eq!(release.version.to_string(), "1.2.6");
        assert_eq!(
            release.download_url("darwin-aarch64").unwrap().as_str(),
            "https://github.com/arjungupta99/chips/releases/download/v1.2.6/Chips.app.tar.gz"
        );
        assert!(release.signature("darwin-aarch64").is_ok());
        // An Intel Mac finds nothing for it there, and installs with the install line.
        assert!(release.download_url("darwin-x86_64").is_err());
    }
}
