//! Notifications you can answer.
//!
//! M2.2 asks for "native notifications with Approve and Deny actions", and that word `actions`
//! is the whole point: a banner that only takes you to the app is a worse version of the app's
//! own badge. Tauri's notification plugin draws a banner and gives no buttons on macOS, so this
//! goes to the system API through `mac-notification-sys`, which does: a main button and a close
//! button, which is exactly Approve and Deny.
//!
//! The call blocks until the person answers or the banner goes away, so it runs on a thread of
//! its own and the answer comes back as an event. What the answer *means* is the web app's:
//! this knows an id and two words, and never the workspace, the run, or the credential.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// What the window hears when a notification is answered. `dismissed` is a real outcome and not
/// a failure: a person who ignores a banner has not denied anything, and the approval waits.
#[derive(Debug, Clone, Serialize)]
pub struct Decision {
    pub approval_id: String,
    /// `approved`, `denied`, `opened` or `dismissed`.
    pub decision: String,
}

/// The event the window listens for.
pub const DECIDED: &str = "chips://approval-decided";

/// Show one approval, and send back what was pressed.
pub fn ask(app: &AppHandle, approval_id: String, title: String, body: String) {
    let app = app.clone();
    std::thread::spawn(move || {
        // A banner the system won't show is dropped: the window still has the ask on screen.
        // Nothing listened for the failure it used to send (the onboarding audit, item 28).
        let Ok(decision) = show(&title, &body) else {
            return;
        };
        // The window may be hidden, or not made yet (ADR 0215); a click asks to see it.
        if decision == "opened" {
            crate::show_window(&app);
        }
        let _ = app.emit(
            DECIDED,
            Decision {
                approval_id,
                decision,
            },
        );
    });
}

/// The system call itself, kept separate so the thread above is only about threading.
fn show(title: &str, body: &str) -> Result<String, String> {
    // The notification centre attributes a banner to a bundle; without one there is nothing to
    // attribute it to, which is why this fails rather than showing something anonymous. In
    // development that means `tauri dev` from a bundle, or the app's own build.
    let bundle = mac_notification_sys::get_bundle_identifier_or_default("Chips");
    mac_notification_sys::set_application(&bundle).map_err(|error| error.to_string())?;

    let response = mac_notification_sys::Notification::new()
        .title(title)
        .message(body)
        .main_button(mac_notification_sys::MainButton::SingleAction("Approve"))
        .close_button("Deny")
        .send()
        .map_err(|error| error.to_string())?;

    Ok(match response {
        mac_notification_sys::NotificationResponse::ActionButton(_) => "approved",
        mac_notification_sys::NotificationResponse::CloseButton(_) => "denied",
        mac_notification_sys::NotificationResponse::Click => "opened",
        _ => "dismissed",
    }
    .to_string())
}

/// Show one plain banner — a digest of what is waiting, say — with no buttons but the click
/// that opens the window (M5.6). Which digest, and to whom, is the web app's; this knows two
/// sentences. Runs on a thread of its own, as `ask` does, since the call blocks until the
/// banner goes away.
pub fn tell(app: &AppHandle, title: String, body: String) {
    let app = app.clone();
    std::thread::spawn(move || {
        // Unclicked, or not shown: the window has what the banner said either way.
        if show_plain(&title, &body) == Ok(true) {
            crate::show_window(&app);
        }
    });
}

/// Whether the banner was clicked.
fn show_plain(title: &str, body: &str) -> Result<bool, String> {
    let bundle = mac_notification_sys::get_bundle_identifier_or_default("Chips");
    mac_notification_sys::set_application(&bundle).map_err(|error| error.to_string())?;
    let response = mac_notification_sys::Notification::new()
        .title(title)
        .message(body)
        .send()
        .map_err(|error| error.to_string())?;
    Ok(matches!(
        response,
        mac_notification_sys::NotificationResponse::Click
    ))
}
