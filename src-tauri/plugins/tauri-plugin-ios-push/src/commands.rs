use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::{IosPushExt, Result};

#[command]
pub(crate) fn request_push_permission<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PermissionState> {
    app.ios_push().request_push_permission()
}

#[command]
pub(crate) fn get_push_token<R: Runtime>(app: AppHandle<R>) -> Result<String> {
    app.ios_push().get_push_token()
}
