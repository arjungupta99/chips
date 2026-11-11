//! The shell.
//!
//! The web app is the whole of Chips; this is what a native window adds to it, and no more:
//! it can find a server on the network, run the one it carries on this Mac (ADR 0173), put a
//! badge in the menu bar, show a notification with two buttons, be opened by a `chips://`
//! link, serve a page a harness sent to its own frame under the page's policy (ADR 0201's
//! addendum), and keep a room's project as a folder on this Mac (ADR 0224). Everything else — the socket, the device key, the fold, what an approval means —
//! stays in the page, which is why the desktop app and a browser cannot drift apart.
//!
//! That line is worth defending. Nothing here knows a token, a workspace or a run; the window
//! asks for a banner with an id and two sentences, and hears back one word.

mod connect;
mod discovery;
mod folder;
mod here;
mod login;
mod menu;
mod menubar;
mod notify;
mod page;
mod reach;
mod shell_path;
mod signed_in;

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;

/// The `chips://` links the page has not taken yet. A link that launches the app arrives before
/// the page is there to hear it, so every link waits here and the page takes them, each once.
#[derive(Default)]
struct Links(Mutex<Vec<String>>);

/// Every link waiting, and none left behind.
#[tauri::command]
fn take_links(links: State<'_, Links>) -> Vec<String> {
    links
        .0
        .lock()
        .map(|mut waiting| waiting.drain(..).collect())
        .unwrap_or_default()
}

/// Servers advertising themselves on this network, within `millis`.
#[tauri::command]
async fn discover_servers(millis: Option<u64>) -> Result<Vec<discovery::FoundServer>, String> {
    let window = millis.unwrap_or(1500).clamp(200, 10_000);
    tauri::async_runtime::spawn_blocking(move || discovery::browse(window))
        .await
        .map_err(|error| error.to_string())?
}

/// Whether this app carries a `chips` to run here (ADR 0173).
#[tauri::command]
fn can_run_here(app: AppHandle) -> bool {
    carried(&app).is_some()
}

/// Which of these commands are on this Mac, as a Terminal would find them (ADR 0288).
#[tauri::command]
async fn programs_here(names: Vec<String>) -> Vec<String> {
    tauri::async_runtime::spawn_blocking(move || {
        shell_path::found_among(&names, &shell_path::for_bridges())
    })
    .await
    .unwrap_or_default()
}

/// Whether the agent of the card `card` is signed in with its maker, as its own status command says
/// (ADR 0290's addendum): nothing when Chips can't ask.
#[tauri::command]
async fn signed_in_here(card: String) -> Option<bool> {
    tauri::async_runtime::spawn_blocking(move || signed_in::ask(&card, &shell_path::for_bridges()))
        .await
        .ok()
        .flatten()
}

/// Run Chips on this Mac from the copy the app carries: `chips up`'s line of JSON, or what it said.
/// The `chips` command is linked to it first, so `chips down` works in a terminal.
#[tauri::command]
async fn run_here(app: AppHandle, reach: String) -> Result<String, String> {
    let program = carried(&app).ok_or("This app does not carry Chips.")?;
    link_here(&app, &program);
    tauri::async_runtime::spawn_blocking(move || here::run(&program, &reach))
        .await
        .map_err(|error| error.to_string())?
}

/// `~/.local/bin/chips` linked to the carried one, from a copy that stays where it is, and
/// `~/.local/bin` put on the PATH a new terminal has (`here::add_to_path`).
fn link_here(app: &AppHandle, program: &std::path::Path) {
    if here::translocated(program) {
        return;
    }
    if let Ok(home) = app.path().home_dir() {
        if here::link_command(&home, program).is_ok() {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            let _ = here::add_to_path(&home, &shell);
        }
    }
}

/// What the page hears of a run of `connect_here`: each line, then its end.
#[derive(Clone, serde::Serialize)]
struct Said {
    run: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    line: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    end: Option<i32>,
}

/// Where a run's lines go, each tagged with the run's name.
const CONNECT_LINE: &str = "chips://connect-line";

/// Connect a bridge's card on this Mac (ADR 0218, phase 5): the carried `chips connect <id>
/// --json`, the link and the card's name as the sheet showed it in its environment, each line said
/// to the page as it comes, then its end. Off the main thread: finding the PATH a Terminal has can
/// wait on a login shell for seconds, and the window would hang meanwhile (the onboarding audit,
/// Part 2, item 8).
#[tauri::command(async)]
fn connect_here(
    app: AppHandle,
    runs: State<'_, connect::Runs>,
    id: String,
    card_name: String,
    link: String,
    run: String,
) -> Result<(), String> {
    let card = connect::card_id(&id) && connect::card_name(&card_name);
    if !card || !connect::join_link(&link) || !connect::run_name(&run) {
        return Err("That isn't a card and a link Chips made.".to_string());
    }
    let program = carried(&app).ok_or("This app does not carry Chips.")?;
    if here::translocated(&program) {
        return Err(here::MOVE_FIRST.to_string());
    }
    link_here(&app, &program);
    let (saying, ending) = (app.clone(), app.clone());
    let (name, ended) = (run.clone(), run.clone());
    // Held while it starts, so a run that ends at once is not forgotten before it is written down.
    let mut under = runs.0.lock().map_err(|error| error.to_string())?;
    let group = connect::start(
        &program,
        &id,
        &card_name,
        &link,
        move |line| {
            let said = Said {
                run: name.clone(),
                line: Some(line),
                end: None,
            };
            let _ = saying.emit(CONNECT_LINE, said);
        },
        move |code| {
            if let Ok(mut under) = ending.state::<connect::Runs>().0.lock() {
                under.remove(&ended);
            }
            let said = Said {
                run: ended,
                line: None,
                end: Some(code),
            };
            let _ = ending.emit(CONNECT_LINE, said);
        },
    )?;
    under.insert(run, group);
    Ok(())
}

/// Stop a run of `connect_here`, and the bridge it started.
#[tauri::command]
fn cancel_connect(runs: State<'_, connect::Runs>, run: String) {
    let group = runs.0.lock().ok().and_then(|mut under| under.remove(&run));
    if let Some(group) = group {
        connect::stop(group);
    }
}

/// Your folder (ADR 0224): the carried `chips project folder <op> --json` for one room, the ask in
/// its environment, and its line of JSON back.
#[tauri::command]
async fn project_folder(
    app: AppHandle,
    op: String,
    asked: folder::Asked,
) -> Result<String, String> {
    let program = carried(&app).ok_or("This app does not carry Chips.")?;
    let home = app.path().home_dir().ok();
    tauri::async_runtime::spawn_blocking(move || {
        // Only Run and Open in browser need to know: the server this Mac runs, asked over loopback.
        let here = folder::HERE_OPS
            .contains(&op.as_str())
            .then(|| home.as_deref().and_then(serving_here))
            .flatten()
            .map(|serving| serving.url);
        folder::run(&program, &op, &asked, here.as_deref())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// The server this Mac runs, by its key (ADR 0231): the port its login service names, else Chips'
/// usual one, asked over loopback; nothing when none answers there as Chips.
#[tauri::command]
async fn server_here(app: AppHandle) -> Option<here::Serving> {
    let home = app.path().home_dir().ok()?;
    tauri::async_runtime::spawn_blocking(move || serving_here(&home))
        .await
        .ok()
        .flatten()
}

fn serving_here(home: &std::path::Path) -> Option<here::Serving> {
    here::serving_at(here::serving(home).unwrap_or(here::PORT))
}

fn carried(app: &AppHandle) -> Option<std::path::PathBuf> {
    here::program(&app.path().resource_dir().ok()?)
}

/// Hold an HTML page a harness sent, with the policy it is served under, for the frame that
/// loads it from `chips-page://` once (ADR 0201's addendum). The answer is that URL.
#[tauri::command]
fn hold_page(
    pages: State<'_, page::Pages>,
    html: String,
    policy: String,
) -> Result<String, String> {
    pages.hold(html, policy)
}

/// Ask about one approval in the notification centre. The answer arrives as an event.
#[tauri::command]
fn ask_about(app: AppHandle, approval_id: String, title: String, body: String) {
    notify::ask(&app, approval_id, title, body);
}

/// Show one plain banner (M5.6): a digest, with no buttons. What it says is the page's.
#[tauri::command]
fn tell(app: AppHandle, title: String, body: String) {
    notify::tell(&app, title, body);
}

/// How many things are waiting on the person, in the menu bar and on the Dock icon, as an
/// iPhone's icon says it (ADR 0267). Zero takes the number away rather than showing a nought.
#[tauri::command]
fn set_badge(app: AppHandle, count: u32) -> Result<(), String> {
    WAITING.store(count, Ordering::SeqCst);
    dock_badge(&app, false);
    let Some(tray) = app.tray_by_id(menubar::TRAY) else {
        return Err("no tray icon".into());
    };
    let badge = count.to_string();
    tray.set_title(if count == 0 { None } else { Some(&badge) })
        .map_err(|error| error.to_string())?;
    tray.set_tooltip(Some(&tooltip(count)))
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// What the menu bar says on hover. Plain counting, and never "0 things".
fn tooltip(count: u32) -> String {
    match count {
        0 => "Chips — nothing waiting".to_string(),
        1 => "Chips — 1 thing needs you".to_string(),
        many => format!("Chips — {many} things need you"),
    }
}

/// The page's commands it can do now, and their names, for the menus to dim and rename (ADR 0267).
#[tauri::command]
fn set_menu(commands: State<'_, menu::Commands>, standing: Vec<menu::Standing>) {
    menu::stand(&commands, &standing);
}

/// The size the page is drawn at, which ⌘+ and ⌘− change (ADR 0267).
#[tauri::command]
fn page_zoom(app: AppHandle) -> f64 {
    menu::kept_zoom(&app)
}

/// A link the page hands to the browser, as a link it opens itself goes (Help's Send Feedback…):
/// a menu's row is not a click on the page, and WebKit opens no window for one.
#[tauri::command]
fn open_link(url: String) -> Result<(), String> {
    let url: tauri::Url = url.parse().map_err(|_| "That isn't a link.".to_string())?;
    if !opens_outside(&url) {
        return Err("Only a web or mail link opens outside Chips.".to_string());
    }
    open_outside(&url);
    Ok(())
}

/// The window's label, as `tauri.conf.json` names it.
pub(crate) const WINDOW: &str = "main";

/// The window, brought forward for the page: the person's phone asked for a room's page to open here
/// (ADR 0227), so it has to be seen, from the menu bar or behind other apps.
#[tauri::command]
fn come_forward(app: AppHandle) {
    show_window(&app);
}

/// The page says it is drawn: the window made for it, waiting hidden, is shown now (ADR 0274).
#[tauri::command]
fn drawn(app: AppHandle) {
    if UNSHOWN.swap(false, Ordering::SeqCst) {
        reveal(&app);
    }
}

/// Bring the window forward, which is what every path here ends in: a click on a banner, a
/// `chips://` link, the menu bar's Open Chips, opening the app again. An app opened at login has
/// no window yet (ADR 0215), so the first of these makes it, and the Dock icon comes with it.
///
/// A window just made is not shown until its page is drawn (`drawn`), so it never opens white, or
/// empty while the page loads (ADR 0274); a page that never says so is shown all the same, after a
/// moment. One asked for again meanwhile comes with it.
fn show_window(app: &AppHandle) {
    let made = app.get_webview_window(WINDOW).is_none();
    if made {
        // Waiting before the page can be, so a page drawn at once is not missed.
        UNSHOWN.store(true, Ordering::SeqCst);
        if make_window(app).is_none() {
            UNSHOWN.store(false, Ordering::SeqCst);
            return;
        }
    }
    #[cfg(target_os = "macos")]
    if !DOCKED.swap(true, Ordering::SeqCst) {
        let _ = app.set_dock_visibility(true);
        // macOS takes a moment to put the app in the Dock, and forgets a badge given before it has,
        // which the page gives as soon as it loads; and a badge given again unchanged is not drawn.
        // So, once it is there, the count is taken away and given again.
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            dock_badge(&app, true);
        });
    }
    if made {
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(DRAWN_PATIENCE);
            if UNSHOWN.swap(false, Ordering::SeqCst) {
                reveal(&app);
            }
        });
    }
    if !UNSHOWN.load(Ordering::SeqCst) {
        reveal(app);
    }
}

/// The window on screen, in front, and given the keys.
fn reveal(app: &AppHandle) {
    let Some(window) = app.get_webview_window(WINDOW) else {
        return;
    };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

/// A window made and waiting for its page to be drawn before it is shown (ADR 0274).
static UNSHOWN: AtomicBool = AtomicBool::new(false);

/// How long a window waits for its page before it is shown however it is: far longer than a page
/// read from the app itself takes, and short enough not to seem lost.
const DRAWN_PATIENCE: std::time::Duration = std::time::Duration::from_millis(1500);

/// Whether the app is in the Dock: from the window's first showing until Quit (ADR 0215's addendum
/// of 3 November), and not before it for an app opened at login.
static DOCKED: AtomicBool = AtomicBool::new(false);

/// How many things wait, as the page last said, for the Dock icon to say again (ADR 0267).
static WAITING: AtomicU32 = AtomicU32::new(0);

/// The count on the Dock icon, or none for nought. `afresh` takes it away first, so macOS draws it
/// even when it is the count it was last given.
fn dock_badge(app: &AppHandle, afresh: bool) {
    let Some(window) = app.get_webview_window(WINDOW) else {
        return;
    };
    let count = WAITING.load(Ordering::SeqCst);
    if afresh {
        let _ = window.set_badge_count(None);
    }
    let _ = window.set_badge_count((count > 0).then_some(i64::from(count)));
}

/// The window `tauri.conf.json` describes, which it does not make at start (`create: false`).
/// It is made hidden, and shown by `show_window` once it stands where it stood last time and the
/// page is drawn at the size it was (ADR 0267).
fn make_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == WINDOW)?;
    let window = tauri::WebviewWindowBuilder::from_config(app, config)
        .ok()?
        .on_new_window(|url, _| {
            open_outside(&url);
            tauri::webview::NewWindowResponse::Deny
        })
        .build()
        .ok()?;
    let _ = window.set_zoom(menu::kept_zoom(app));
    remember_frame(&window);
    Some(window)
}

/// The window comes back where it was and as large, from one launch to the next, as a Mac's
/// windows do: AppKit keeps the frame under a name and sets it again, on the screen it fits.
fn remember_frame(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "macos")]
    let _ = window.with_webview(|webview| {
        use objc2_app_kit::NSWindow;
        use objc2_foundation::NSString;
        // SAFETY: Tauri hands over its own NSWindow, on the main thread, for this call alone.
        let Some(window) = (unsafe { webview.ns_window().cast::<NSWindow>().as_ref() }) else {
            return;
        };
        let name = NSString::from_str("Chips");
        window.setFrameUsingName(&name);
        window.setFrameAutosaveName(&name);
    });
    #[cfg(not(target_os = "macos"))]
    let _ = window;
}

/// A link the page opens outside itself, a `target="_blank"` link or `window.open`, goes to the
/// browser, and the app opens no window of its own: Send feedback's form (ADR 0237), and a link in
/// a message or a page (ADR 0123). WebKit drops such a link when nobody answers for it, which until
/// now every one was. Only the web's and mail's go; anything else goes nowhere.
fn open_outside(url: &tauri::Url) {
    if !opens_outside(url) {
        return;
    }
    let url = url.to_string();
    // Waited on in a thread of its own, so the page isn't held and `open` leaves no zombie.
    std::thread::spawn(move || {
        let _ = std::process::Command::new("/usr/bin/open").arg(url).status();
    });
}

fn opens_outside(url: &tauri::Url) -> bool {
    matches!(url.scheme(), "https" | "http" | "mailto")
}

/// Closing the window hides it, and the page keeps the count and the banners going (ADR 0215).
/// The Dock icon stays, with the count on it, as a Mac app's does until it is quit (ADR 0215's
/// addendum of 3 November); clicking it brings the window back. Quit, from any menu, ends it.
fn hide_window(window: &tauri::Window) {
    let _ = window.hide();
}

/// Opening the app, or Open Chips in the menu bar, is asking for Chips: when the server on this Mac
/// does not answer, its login service is started, and the menu bar's icon follows it back (ADR
/// 0215's addenda). Not at login, where launchd starts it unless `chips down` said not to. One
/// start at a time, off the main thread; what stopped it is said in a banner.
fn wake_server(app: &AppHandle) {
    static WAKING: AtomicBool = AtomicBool::new(false);
    let Ok(home) = app.path().home_dir() else {
        return;
    };
    if WAKING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        if let Err(reason) = here::wake(&home) {
            notify::tell(
                &app,
                "Chips could not start on this Mac".to_string(),
                reason,
            );
        }
        WAKING.store(false, Ordering::SeqCst);
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Opened at login while a copy already runs (macOS opening again what was open, or a person
    // quicker than the login), this one gives way to it (ADR 0215's addendum).
    if login::opened_at_login() && login::another_running() {
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .manage(Links::default())
        .manage(page::Pages::default())
        .manage(connect::Runs::default())
        .manage(menu::Commands::default())
        .menu(menu::build)
        .on_menu_event(|app, event| menu::chosen(app, event.id().as_ref()))
        // A held page, served once to the frame that asks for it, under its own policy.
        .register_uri_scheme_protocol(page::SCHEME, |context, request| {
            let pages = context.app_handle().state::<page::Pages>();
            let key = page::key_of(&request).to_string();
            page::answer(pages.take(&key))
        })
        .invoke_handler(tauri::generate_handler![
            can_run_here,
            programs_here,
            signed_in_here,
            run_here,
            connect_here,
            cancel_connect,
            discover_servers,
            ask_about,
            set_badge,
            tell,
            take_links,
            hold_page,
            project_folder,
            server_here,
            come_forward,
            set_menu,
            open_link,
            reach::link_reach,
            reach::open_tailscale,
            page_zoom,
            drawn
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == WINDOW {
                    api.prevent_close();
                    hide_window(window);
                }
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let places = menubar::Places {
                home: app.path().home_dir()?,
                notes: app.path().app_config_dir()?,
                bundle: std::env::current_exe()
                    .ok()
                    .and_then(|program| login::bundle_of(&program)),
            };
            // The login agent first, so the menu's tick says what is there.
            if let Some(bundle) = &places.bundle {
                let server_here = here::serving(&places.home).is_some();
                let _ = login::keep(&places.home, &places.notes, bundle, server_here);
            }
            // The menu bar's one icon, made only here (`tauri.conf.json` has no `trayIcon`, or
            // there would be two).
            menubar::install(&handle, places.clone())?;

            // Opened at login, the app is the menu bar's icon and nothing more until asked.
            if login::opened_at_login() {
                #[cfg(target_os = "macos")]
                let _ = handle.set_dock_visibility(false);
            } else {
                show_window(&handle);
                wake_server(&handle);
            }

            // The link that launched the app came before this listener could hear it: macOS
            // hands it over while the app starts, and the plugin keeps it as the current one.
            if let (Ok(Some(launched)), Ok(mut waiting)) =
                (app.deep_link().get_current(), app.state::<Links>().0.lock())
            {
                waiting.extend(launched.iter().map(|url| url.to_string()));
            }

            // A `chips://` link is a request to look at something, so the window comes forward
            // and the page is told a link is waiting. What the URL means is the page's to decide.
            // Tauri holds its plugins' lock while the plugin hands a link over, and making the
            // window takes that lock too, so a window made here would wait on itself: the copy
            // opened at login, with no window yet, hung on its first link. It is made from a
            // thread of its own, as a banner's click makes it, once the plugin has let go.
            let deep = handle.clone();
            app.deep_link().on_open_url(move |event| {
                if let Ok(mut waiting) = deep.state::<Links>().0.lock() {
                    waiting.extend(event.urls().iter().map(|url| url.to_string()));
                }
                let _ = deep.emit("chips://open", ());
                let app = deep.clone();
                std::thread::spawn(move || show_window(&app));
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("the desktop shell could not start")
        .run(|app, event| {
            // Opening the app again, from Finder, Spotlight or the Dock, asks for the window,
            // and for the server here if it has stopped.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                show_window(app);
                wake_server(app);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}

#[cfg(test)]
mod tests {
    use super::{opens_outside, tooltip};

    #[test]
    fn the_menu_bar_counts_in_words() {
        assert_eq!(tooltip(0), "Chips — nothing waiting");
        assert_eq!(tooltip(1), "Chips — 1 thing needs you");
        assert_eq!(tooltip(4), "Chips — 4 things need you");
    }

    #[test]
    fn only_the_webs_and_mails_links_go_to_the_browser() {
        let go = |url: &str| opens_outside(&url.parse().unwrap());
        assert!(go("https://github.com/arjungupta99/chips/issues/new?template=feedback-prompt.yml"));
        assert!(go("http://example.com/"));
        assert!(go("mailto:security@chipschat.ai"));
        assert!(!go("file:///etc/passwd"));
        assert!(!go("chips://open"));
        assert!(!go("javascript:alert(1)"));
    }
}
