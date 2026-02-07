# tauri-plugin-ios-push

Local ryOS Tauri plugin that bridges iOS remote push capabilities (APNs) to the webview layer.

## Exposed commands

- `request_push_permission`
- `get_push_token`

## Emitted events

- `token` — `{ token: string }`
- `notification` — normalized APNs payload
- `notification-tapped` — normalized APNs payload from tap action
