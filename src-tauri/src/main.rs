// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(not(debug_assertions))]
use tauri::{Manager, Url};

fn main() {
    // Port for the localhost server (used for YouTube embed compatibility in production)
    #[cfg(not(debug_assertions))]
    let port: u16 = 1430;

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init());

    // Only use localhost plugin in release builds (for YouTube embed compatibility)
    #[cfg(not(debug_assertions))]
    {
        builder = builder.plugin(tauri_plugin_localhost::Builder::new(port).build());
    }

    // In release builds, retarget the default window to the localhost plugin URL
    // (provides a valid HTTP Referer header for YouTube embeds)
    #[cfg(not(debug_assertions))]
    {
        builder = builder.setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                let url = Url::parse(&format!("http://localhost:{}", port))?;
                window.set_title("")?;
                window.navigate(url)?;
            }
            Ok(())
        });
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

