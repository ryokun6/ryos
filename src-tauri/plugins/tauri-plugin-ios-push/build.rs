const COMMANDS: &[&str] = &["request_push_permission", "get_push_token"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .ios_path("ios")
        .build();
}
