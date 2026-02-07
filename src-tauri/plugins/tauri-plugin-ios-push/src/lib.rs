use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::IosPush;
#[cfg(mobile)]
use mobile::IosPush;

/// Extensions to access iOS push APIs from app handles.
pub trait IosPushExt<R: Runtime> {
    fn ios_push(&self) -> &IosPush<R>;
}

impl<R: Runtime, T: Manager<R>> IosPushExt<R> for T {
    fn ios_push(&self) -> &IosPush<R> {
        self.state::<IosPush<R>>().inner()
    }
}

/// Initializes the iOS push plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("ios-push")
        .invoke_handler(tauri::generate_handler![
            commands::request_push_permission,
            commands::get_push_token
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let ios_push = mobile::init(app, api)?;
            #[cfg(desktop)]
            let ios_push = desktop::init(app, api)?;
            app.manage(ios_push);
            Ok(())
        })
        .build()
}
