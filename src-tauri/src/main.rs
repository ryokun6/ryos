// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, Url};

fn main() {
    // Always load the hosted app (https://os.ryo.lu) so Tauri uses a stable origin
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let url = Url::parse("https://os.ryo.lu")?;
                window.set_title("")?;
                window.navigate(url)?;
            }
            Ok(())
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
