//! The menu bar (ADR 0215): the icon, its menu, and how the icon looks.
//!
//! On a Mac that runs the server as a login service, the icon says how that server is: drawn
//! while it answers and greyed while it does not (ADR 0215's addendum of 3 November), and the app
//! opens at login with this icon and nothing else. On any other Mac the server is somewhere else,
//! and the icon is simply drawn for as long as the app runs.

use std::path::PathBuf;
use std::time::Duration;

use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Wry,
};

use crate::{here, login};

/// The icon's id, which `set_badge` finds it by.
pub const TRAY: &str = "chips";

/// How often the server is asked.
const EVERY: Duration = Duration::from_secs(5);

/// How many checks in a row may go unanswered before the icon greys: a busy Mac can stall one.
const MISSES: u32 = 3;

/// Whether the server counts as answering, from what the checks have heard: at once on an answer,
/// and not until `MISSES` in a row without one. Nothing heard yet counts as not answering.
pub struct Watch {
    misses: u32,
}

impl Default for Watch {
    fn default() -> Self {
        Self { misses: MISSES }
    }
}

impl Watch {
    pub fn heard(&mut self, answered: bool) -> bool {
        self.misses = if answered {
            0
        } else {
            self.misses.saturating_add(1)
        };
        self.misses < MISSES
    }
}

/// Where the menu bar looks: the person's home, the app's own folder, and the `.app` it runs from.
#[derive(Clone)]
pub struct Places {
    pub home: PathBuf,
    pub notes: PathBuf,
    pub bundle: Option<PathBuf>,
}

/// The mark in one colour, as a template so macOS inks it; the app's own icon is a filled square,
/// and as a template that draws as a white block. macOS draws it 18 points tall, so the 44 square
/// stays sharp on a Retina screen.
fn mark() -> Image<'static> {
    tauri::include_image!("icons/tray@2x.png")
}

/// The mark while the server does not answer: a third of its ink. macOS inks a template by its
/// alpha alone, so this draws grey, as a menu bar item that is turned off does.
fn greyed(mark: &Image<'_>) -> Image<'static> {
    let rgba = mark
        .rgba()
        .chunks_exact(4)
        .flat_map(|pixel| [pixel[0], pixel[1], pixel[2], pixel[3] / 3])
        .collect();
    Image::new_owned(rgba, mark.width(), mark.height())
}

/// The menu's first line, where there is a server here.
fn saying(answering: bool) -> &'static str {
    if answering {
        "Chips is running on this Mac"
    } else {
        "Chips is not answering on this Mac"
    }
}

/// The icon and its menu, and the watch that draws or greys it.
pub fn install(app: &AppHandle, places: Places) -> tauri::Result<()> {
    let server_here = here::serving(&places.home).is_some();
    let running = MenuItem::with_id(app, "running", saying(false), false, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", "Open Chips", true, None::<&str>)?;
    let at_login = CheckMenuItem::with_id(
        app,
        "login",
        "Open at Login",
        places.bundle.is_some(),
        login::is_on(&places.home),
        None::<&str>,
    )?;
    let line = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = if server_here {
        Menu::with_items(app, &[&running, &open, &at_login, &line, &quit])?
    } else {
        Menu::with_items(app, &[&open, &at_login, &line, &quit])?
    };

    let mark = mark();
    let grey = greyed(&mark);
    // Greyed from the start where the server is here, until its first answer.
    let first = if server_here { &grey } else { &mark };
    let chosen = places.clone();
    TrayIconBuilder::with_id(TRAY)
        .menu(&menu)
        .icon(first.clone())
        .icon_as_template(true)
        .tooltip(crate::tooltip(0))
        .on_menu_event(move |app, event| match event.id().as_ref() {
            // Asking for Chips from its icon asks for the server too, as opening the app does.
            "open" => {
                crate::show_window(app);
                crate::wake_server(app);
            }
            "login" => {
                if let Some(bundle) = &chosen.bundle {
                    let on = at_login.is_checked().unwrap_or(false);
                    if login::turn(&chosen.home, &chosen.notes, bundle, on).is_err() {
                        let _ = at_login.set_checked(login::is_on(&chosen.home));
                    }
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    watch(app.clone(), places.home, running, mark, grey);
    Ok(())
}

/// Ask the server on this Mac every few seconds, and grey the icon while it does not answer. With
/// no server here the icon is simply drawn. Looked up afresh each time, so a server `Run Chips
/// here` starts later is followed too. The icon is never taken away and made again: that is
/// AppKit work on the main thread, and a Mac busy enough to miss three checks is where it hung.
fn watch(
    app: AppHandle,
    home: PathBuf,
    running: MenuItem<Wry>,
    mark: Image<'static>,
    grey: Image<'static>,
) {
    std::thread::spawn(move || {
        let mut watch = Watch::default();
        let mut drawn = None;
        loop {
            let answering = match here::serving(&home) {
                Some(port) => watch.heard(here::answers(port)),
                None => true,
            };
            if drawn != Some(answering) {
                if let Some(tray) = app.tray_by_id(TRAY) {
                    let icon = if answering { &mark } else { &grey };
                    if tray
                        .set_icon_with_as_template(Some(icon.clone()), true)
                        .is_ok()
                    {
                        let _ = running.set_text(saying(answering));
                        drawn = Some(answering);
                    }
                }
            }
            std::thread::sleep(EVERY);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nothing_heard_yet_is_not_answering() {
        let mut watch = Watch::default();
        assert!(!watch.heard(false));
    }

    #[test]
    fn an_answer_draws_it_at_once() {
        let mut watch = Watch::default();
        assert!(watch.heard(true));
    }

    #[test]
    fn it_greys_only_after_three_misses_in_a_row() {
        let mut watch = Watch::default();
        assert!(watch.heard(true));
        assert!(watch.heard(false));
        assert!(watch.heard(false));
        assert!(watch.heard(true), "an answer starts the count again");
        assert!(watch.heard(false));
        assert!(watch.heard(false));
        assert!(!watch.heard(false));
        assert!(!watch.heard(false));
        assert!(watch.heard(true));
    }

    #[test]
    fn greyed_keeps_the_shape_with_a_third_of_the_ink() {
        let mark = mark();
        let grey = greyed(&mark);
        assert_eq!((grey.width(), grey.height()), (mark.width(), mark.height()));
        assert_eq!(grey.rgba().len(), mark.rgba().len());
        for (was, now) in mark.rgba().chunks_exact(4).zip(grey.rgba().chunks_exact(4)) {
            assert_eq!(was[..3], now[..3]);
            assert_eq!(now[3], was[3] / 3);
        }
        assert!(mark.rgba().chunks_exact(4).any(|pixel| pixel[3] == 255));
    }

    #[test]
    fn the_first_line_says_whether_the_server_answers() {
        assert_eq!(saying(true), "Chips is running on this Mac");
        assert_eq!(saying(false), "Chips is not answering on this Mac");
    }
}
