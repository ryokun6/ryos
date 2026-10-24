# ryOS security audit

**Date:** 22 October 2026
**Tree:** `46c9eb169d71cbe5bd2ce3dd9a84a2ed28d8f046` (`main`, "Measure the Chats composer so the model label no longer covers the last message. (#2040)")
**Scope:** Bun 1.4.3 app (Vite/React client, standalone Bun API under `api/`), Docker image `oven/bun:1.4.3` for Coolify, iOS WKWebView shell, GitHub Actions.
**Method:** Read the request path for every finding below. Ran `bun audit` against `bun.lock`. Searched git history and the working tree for committed secrets (names and locations only; no secret values are in this report). No exploit was executed against a running server, and no application behavior was changed.

This is a point-in-time review of that commit. Production env values (Coolify `TRUSTED_PROXY_COUNT`, whether `HEADLESS_BROWSER_WS_ENDPOINT` or `IE_PROXY_SESSIONS` is set, whether `RESEND_API_KEY` + `RECOVERY_EMAIL_FROM` are set) were not read. Where impact depends on those, the finding says so.

## Scanner limits

- `bun audit` on this machine is **Bun 1.3.14**, run against the lockfile the project pins to Bun 1.4.3. It reported 2 moderate advisories (table below).
- `trivy`, `grype`, and `osv-scanner` are not installed. Debian packages inside `oven/bun:1.4.3` were not CVE-scanned. The Dockerfile does `apt-get upgrade` at image build (`Dockerfile:40-43`), so the OS layer is newer than the tag's freeze date, but that was not verified by a scanner.
- Public advisory pages were checked for the two `bun audit` results and for Bun 1.4.3 itself. Snyk's page for Bun lists no known issues in 1.4.3 (the current release as of 10 October 2026). CVE-2026-24910 (Bun install lifecycle-script injection) is fixed in 1.3.5 and later, so 1.4.3 includes that fix.

## Executive summary

One critical issue: the Internet Explorer proxy serves fetched HTML (and, in raw mode, arbitrary content types) **from the app origin** with scripts intact, and the IE iframe is sandboxed with both `allow-scripts` and `allow-same-origin`. A page the user opens in IE runs as `https://os.ryo.lu` and can call `/api` with the victim's session cookie.

One high issue: the iOS `ryosBridge` script-message handler is registered for every frame. A subframe (an IE page, an untrusted applet) can invoke native notification, auth-sheet, and push-registration entry points. The injected JavaScript wrapper is main-frame only; the native handler is not.

The debug-model restriction is enforced on the server. Callers who are not the user `ryo` are forced to the default model `gpt-6` (OpenAI `gpt-6-luna`) in `resolveRequestedAiModel`, including when the body names `gpt-6.1-sol`, `sonnet-5.5`, or `opus-5.5`. The registry label `access: "public"` on the non-default models is misleading, and it is not the gate.

No committed API keys, private keys, or `.env` files were found in the tree or in history scans described below. There is no `pull_request_target` workflow.

---

## Critical

### C1. Same-origin script execution through the Internet Explorer proxy

**Where**

- `api/iframe-check.ts:373-378` — handler allows GET/POST/PUT/PATCH/DELETE and does not set `auth`, so `apiHandler` defaults to `auth: "none"` (`api/_utils/api-handler.ts:116`).
- `api/iframe-check.ts:386-395` — `raw=1` (or any non-GET) streams the upstream body with the upstream `Content-Type` (`1172-1186`). The non-HTML branch does the same (`1631-1636`).
- `api/_utils/_ie-html.ts:771-780` — HTML at or under `IE_LITE_THRESHOLD_BYTES` (1_000_000, line 24) is returned unchanged, `strippedScripts: false`. Script stripping runs only above that threshold.
- `api/iframe-check.ts:1166` — the only CSP on the proxy response is `frame-ancestors *`. Upstream CSP `<meta>` tags are removed later in the HTML rewrite (around `1238-1244`).
- `api/iframe-check.ts:1628-1630` — rewritten HTML is sent as `Content-Type: text/html; charset=utf-8`.
- `src/apps/internet-explorer/components/internet-explorer-app/InternetExplorerContentPane.tsx:189` and `src/apps/internet-explorer/components/time-machine-view/TimeMachineViewPortal.tsx:216` — iframe `sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-pointer-lock"`.
- `api/_utils/api-handler.ts:172-180` — missing or disallowed `Origin`/`Referer` is 403. `getEffectiveOrigin` (`api/_utils/_cors.ts:108-117`) falls back to the `Referer` origin.
- `api/auth/email/set.ts:33-116` — authenticated session can replace the recovery email. No current password. Switching off a verified address deletes the old email index (`105-108`).
- `api/_utils/_cookie.ts:44-59` — `ryos_auth` is `HttpOnly`, `Path=/api`, `SameSite=Lax`, `Secure` in production. Session TTL is one year (`api/_utils/auth/_constants.ts:13`).

**Impact**

A document returned by `/api/iframe-check` is same-origin with the app. Combined with `allow-scripts` and `allow-same-origin`, script in that document runs as `https://os.ryo.lu`. The cookie is HttpOnly, so script cannot read the token. `fetch('/api/...', { credentials: 'include' })` still sends it. From a logged-in browser the script can read synced chats, files, and memories, post as the user, and register push. Password change and account deletion require the current password, so those two routes are not enough for takeover by themselves. Recovery-email replacement does not. When the email channel is configured (`RESEND_API_KEY` and `RECOVERY_EMAIL_FROM`), the script can point recovery at an address the attacker controls, and the verification code arrives there. After `/api/auth/email/verify`, that address is a recovery channel for a password reset. Session lifetime is about a year, so a single visit is enough.

The origin gate blocks the easy cross-site case: a top-level navigation with no `Referer`, or a `Referer` from another site, is 403. The reliable paths are same-origin:

1. The user opens the URL inside Internet Explorer. The iframe's request is same-origin, so `Referer` is `https://os.ryo.lu` and the gate passes.
2. The user clicks a same-origin link to the proxy (Chats renders links). That navigation is top-level and has no iframe sandbox at all.

A chat `launchApp` tool can open Internet Explorer to a URL the model supplies (`api/chat/tools/index.ts:125`, `api/chat/tools/schemas.ts:148-178`). Tool output from `webFetch` is untrusted page text. A prompt-injection page can try to steer the model into launching that URL in IE. That is an amplifier of C1, not a separate bug: the model still has to comply, and the user still has to be signed in.

Wayback HTML is cached in Redis for 30 days after rewrite (`api/iframe-check.ts:1601-1618`). A poisoned cache entry replays the same HTML for that URL.

The proxy also sets `Access-Control-Allow-Origin: *` on these responses (`1167`) and allows on the order of 300 requests/minute globally and 100/minute per host (`488`, `522`). That is open-proxy abuse (bandwidth, and a way to launder requests through the server's IP) in addition to the XSS. One successful XSS request is enough; the rate limit does not contain it.

Raw mode and the non-HTML branch reflect the upstream content type. A same-origin response with a script content type is a second way to execute code on the app origin, and it never goes through `sanitizeProxiedHtml`.

**Exploit sketch**

Host an ordinary HTML page under the lite size threshold whose script calls authenticated `/api` routes. Get a signed-in user to load that URL in Internet Explorer (a link in chat, or a model `launchApp` to IE). The proxy returns the page as `text/html` from `os.ryo.lu` with the script still in it. The sandboxed iframe shares the app origin, so the script's `fetch` includes `ryos_auth`. If email recovery is on, the script sets the recovery address, the attacker receives the code, verifies it, and later uses recovery to reset the password. A direct paste of the proxy URL into the address bar, with no `Referer`, is rejected.

**Fix**

Serve proxied content on a separate origin that does not receive `ryos_auth` (the cookie is already `Path=/api`, so a different host is the property that matters). On that origin, send `Content-Security-Policy: sandbox` without `allow-same-origin`, and `X-Content-Type-Options: nosniff`. Remove `allow-same-origin` from the IE iframe sandbox. Strip scripts (and event handlers, `javascript:` URLs) for every HTML response, including documents under the lite threshold. Do not reflect upstream `Content-Type` for active types (`text/html`, `image/svg+xml`, `application/javascript`, `text/xml`) on the app origin; force a download or `text/plain` for raw and non-HTML bodies. A response CSP of `sandbox` without `allow-same-origin` also stops the parent `postMessage` origin check in `useInternetExplorerLogic.ts` (~1774) from seeing `os.ryo.lu`; that channel needs a redesign (a dedicated proxy origin, or a token the parent checks) rather than a CSP-only patch that leaves `allow-same-origin` in the iframe.

---

## High

### H1. `ryosBridge` accepts messages from every frame

**Where**

- `ios/ryOS/ShellWebView.swift:58` — `userContent.add(context.coordinator, name: "ryosBridge")` with no main-frame restriction.
- `ios/ryOS/ShellWebView.swift:418-439` — `didReceive` checks the handler name and body shape. It does not check `message.frameInfo.isMainFrame`.
- User scripts that define `window.ryosDesktop` are `forMainFrameOnly: true` (`ShellWebView.swift` around `44-57`, `DesktopBridge.swift`). The native handler is still visible as `webkit.messageHandlers.ryosBridge` in subframes.
- `handleInvoke` (`441-489`) dispatches `showNotification`, `configureChatNotifications`, `updateChatNotificationState`, `openAuthSheet`, haptics, and status-bar tone. `openFile` / `saveFile` return canceled.
- `handleShowNotification` (`492-500`) shows a local notification. Title and body are truncated to 120 and 240 characters.
- `runAuthSheet` (from `474`, validation near `289-295`) opens a system sheet for any `https` URL plus a custom-scheme callback.
- `handleNotificationState` (`503-511`) calls `ShellViewModel.updateNotificationState`, which registers the device through `RelayClient.registerDevice` using the real `ryos_auth` cookie and the room list from the message.
- `ios/ryOS/RelayClient.swift:83` and `172-189` — if the primary `POST /api/push/register` fails, the fallback posts the cookie to `https://ryos-notifications.apps.air.build/api/register` in `authCookie` and `X-Ryos-Auth`.

**Impact**

Internet Explorer pages and untrusted applet iframes run with `allow-scripts`. On iOS they can post to `ryosBridge` even though they cannot see the main-frame `ryosDesktop` wrapper.

- Local notifications with attacker-chosen title and body (phishing, while the app is backgrounded; `shouldShowNativeNotification` is a separate query and is not required before `showNotification`).
- An auth sheet for an arbitrary `https` URL. The sheet is the system browser, so it is not a silent cookie theft. The callback is delivered back through main-frame JavaScript, so a cross-origin iframe should not receive the redirect URL. The sheet still appears over the user's session.
- Push re-registration with the victim's session cookie and attacker-chosen room ids. Server-side private-room delivery still checks membership (`api/_utils/push-relay.ts` eligibility around `692-708`), so this does not subscribe the device to private rooms the user is not in. It can subscribe the device to public rooms and can disrupt the user's notification set. The fallback path, when the primary register fails, also sends that session cookie to the third-party relay host (see L6).

The web app's own origin is hardcoded to `https://os.ryo.lu` (`ShellViewModel`). ATS has no exceptions in `Info.plist`. There is no custom URL type in `Info.plist`. Entitlements contain only `aps-environment` = `development` (`ios/ryOS/ryOS.entitlements`).

**Exploit sketch**

A page loaded in the IE iframe (or an untrusted applet iframe) on the iOS shell calls `webkit.messageHandlers.ryosBridge.postMessage` with `kind: "invoke"`. One call shows a local notification. Another calls `updateChatNotificationState` with `isAuthenticated: true` and a room list. Native code registers the device token with the user's real session cookie and those rooms.

**Fix**

In `didReceive`, return immediately unless `message.frameInfo.isMainFrame`. Prefer a content world that is injected only into the main frame so subframes do not have the handler object at all. Keep the main-frame check even after that, because a compromised main frame is a different problem (C1) and subframe rejection should not depend on the injection flag alone.

---

## Medium

### M1. `dbg=1` skips the Internet Explorer debug gate

**Where:** `api/iframe-check.ts:64-74`. The function returns true when `req.query.dbg` is `"1"` or `"true"`, before any auth lookup. The comment above it describes an admin-only gate.

**Impact:** Any caller who already passes the origin check is treated as the debug caller. That unlocks `ieSessions=1` cookie-jar sessions when sessions are otherwise off, and `render=headless` forced rendering, when those features are otherwise limited to `ryo`. Both are off unless `IE_PROXY_SESSIONS` is set or a headless endpoint is configured (`HEADLESS_RENDER_URL_TEMPLATE` / `HEADLESS_BROWSER_WS_ENDPOINT`, read by `api/_utils/_headless.ts`). With headless configured, the initial URL is checked for SSRF and then the page runs in the browser. Script in that page can request hosts the URL check never sees, including the compose-network browser port (see L5). Auto headless fallback on upstream 401/403/405/406/429/451 is available to every caller when headless is configured, not only debug callers.

Default deploy: headless and IE sessions are unset, so this is a broken check with no extra reach. If either env is turned on, treat the headless case as high.

**Exploit sketch:** Add `dbg=1` (and `ieSessions=1` or `render=headless`) to a same-origin proxy request. The server treats the caller as the debug user without a `ryo` session.

**Fix:** Delete the query-flag short circuit. Require `resolveRequestAuth` and `username === "ryo"` for sessions and forced headless. Do not treat `dbg` as capability.

### M2. DNS rebinding gap in the SSRF guard

**Where:** `api/_utils/_ssrf.ts:106-128`. `validatePublicUrl` resolves the hostname (`resolveAndValidateHostname`, called around line 90) and rejects private, loopback, link-local, and metadata addresses (`api/_utils/_ip.ts`). `safeFetchWithRedirects` then `fetch`es `validatedUrl.toString()`, which is still a hostname. The runtime resolves it again. Redirects are revalidated. Protocols are http/https only. Userinfo in the URL is rejected.

Callers include `api/iframe-check.ts`, `api/link-preview.ts`, `api/chat/tools/executors.ts` (`executeWebFetch`), `api/stuff/_helpers/_productImage.ts`, and the headless initial-URL check.

**Impact:** A hostname that answers the first lookup with a public address and the second with a private or link-local address is fetched on the second lookup. That is the classic rebinding bypass of a check-then-fetch guard. NAT64 `64:ff9b::/96` is not in the block list; impact there depends on the host's network.

**Exploit sketch:** Point a prefetch or link-preview URL at a name the attacker controls. The first DNS answer is public and passes validation. The fetch's own lookup returns `169.254.169.254` or another internal address, and the server requests it.

**Fix:** Connect to the address that was validated. Pass that IP to the HTTP client (pinned `Host` / SNI for the original name) or use a dispatcher that checks the connected address and aborts if it is not the pinned one. Re-check on every redirect, which the code already does for the URL string.

### M3. Applet share body is unbounded up to the server limit

**Where:** `api/share-applet.ts:29-30` (`content: z.string().min(1)`, no max). Save rate is 20/minute/user (`14`). The standalone server accepts 55 MB bodies (`scripts/api-standalone-server.ts:68`). POST requires auth. `createdBy` is the authenticated username, not the client field. A share id owned by someone else is not overwritten (a new id is generated). DELETE of shares is `ryo`-only.

**Impact:** An authenticated user can write tens of megabytes per request into Redis, 20 times a minute. That is storage and cost abuse, not XSS. Untrusted applet HTML is rendered in an opaque sandbox (`src/utils/appletAuthBridge.ts`: trusted sandbox with `allow-same-origin` only when `createdBy === "ryo"`). Client-supplied `createdBy` cannot gain that sandbox.

**Exploit sketch:** Authenticate, POST `/api/share-applet` with a multi-megabyte `content` string, repeat within the rate limit.

**Fix:** Cap `content` (a few hundred KB is enough for these applets) in the Zod schema and reject before the Redis write. Apply the same cap to title, icon, and name.

### M4. Song lyric generation spends OpenAI quota for anonymous callers

**Where:** `api/songs/[id].ts` auth is optional. Limits at `130-131`: `fetchLyrics` 30/minute, `searchLyrics` 60/minute, keyed per IP or per user. Generation calls `openai("gpt-5.4")` at `1252`, `1477`, and `1760`. The model id is hardcoded. It is not the user-selected chat model. Force-refresh requires auth. Cache hits do not call the model. A new song id misses the cache.

**Impact:** Anonymous callers can burn `gpt-5.4` tokens up to those per-minute buckets, per IP. It is not unlimited. Unique ids are the expensive case. Behind a reverse proxy with `TRUSTED_PROXY_COUNT=0`, many clients share one IP and one bucket (see L10), which hides this until the proxy count is set correctly.

**Exploit sketch:** Request lyrics for many distinct song ids from one IP, staying under 30 generations per minute.

**Fix:** Add a low daily cap per IP for generation, and require a signed-in user before a cache miss calls the model.

### M5. No app-wide security headers

**Where:** `scripts/api-standalone-server.ts` sets no `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, or `X-Content-Type-Options` on normal responses. `index.html:21` sends `Permissions-Policy: camera=(self)` only. The proxy's CSP is the `frame-ancestors *` noted in C1.

**Impact:** The app can be framed by another site (clickjacking of signed-in clicks). There is no HSTS from the app itself (the edge proxy may add it; that was not verified). Missing `nosniff` makes the reflected content types in C1 easier to use. This is defense in depth next to C1, not a standalone XSS.

**Fix:** On document responses, set a CSP that fits the app (script sources you actually use), `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY` or CSP `frame-ancestors 'self'`. Set HSTS at the HTTPS edge if it is not already there. Keep a separate, stricter policy on `/api/iframe-check` as part of the C1 fix. Do not put `frame-ancestors *` on API responses that carry a session.

### M6. Runtime image runs as root and ships devDependencies plus `src/`

**Where:** `Dockerfile:35-67`. The runtime stage is `oven/bun:1.4.3` with no `USER`. It copies the full `node_modules` from `bun install --frozen-lockfile` (devDependencies included), plus `api/`, `scripts/`, `src/`, and `dist/`. The only build-arg is `GIT_COMMIT_SHA` (`29-30`), which is not a secret. `.dockerignore` excludes `.env`, `.env.*`, `.git`, tests, and `ios/`. `EXPOSE 3000`. `CMD ["bun", "run", "start"]`.

**Impact:** A compromise of the Bun process (C1 is the realistic route to server-side impact only if SSRF or a later bug lands; C1 itself is browser-side) starts as root in the container. Dev-only packages, including the two advisory packages below, are on the image even though the server does not import them. `src/` is more source than the server needs if it runs from `api/` and `dist/`.

**Fix:** `USER bun` (or another non-root user) in the runtime stage. Install production dependencies in that stage (`bun install --frozen-lockfile --production`) instead of copying the build-stage `node_modules`. Copy `api/`, `dist/`, and the dictionary data the server reads, and leave `src/` out if startup does not import it. Confirm `bun run start` still resolves after the production install.

---

## Low

### L1. Dependency advisories (not reachable from the API process)

`bun audit v1.3.14` against `bun.lock`: 2 moderate.

| Advisory | Package | Lockfile | Severity | Reachable in prod? | Fixed version |
|---|---|---|---|---|---|
| [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) (CVE-2026-104844) | `postcss-selector-parser` | 6.0.10 (`bun.lock` ~2178), via devDependency `@tailwindcss/typography` | moderate | Build-time CSS parsing of trusted stylesheets. The advisory's vulnerable case is parsing untrusted selectors. The package is on the runtime image only because M6 copies devDependencies. The API does not import it. | 6.1.5 for the 6.x line, or 7.1.6 and later. Affected: `<6.1.5` and `>=7.0.0 <7.1.6`. |
| [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) (CVE-2026-97058) | `sprintf-js` | 1.1.3 (`bun.lock` ~2424), via `electron-builder` → `dmg-builder` / `app-builder-lib` → `@electron/get` → `global-agent` → `roarr` | moderate | Electron packaging only. Not imported by the web server. DoS when an attacker controls a format string. No patched npm release (`<=1.1.3`, no fixed version). | None upstream. Remove the chain from the server image (M6). Watch for an upstream release before bumping for the desktop build. |

**Bun runtime:** 1.4.3 has no listed Snyk advisories at review time. CVE-2026-24910 is fixed since 1.3.5. Secondary release notes attribute a TLS fix (CVE-2026-48618) and an HTTP/2 rapid-reset fix to the 1.4.3 line; those are closed in this pin, not open issues. The Debian userland of `oven/bun:1.4.3` was not scanned.

**Fix:** Bump `@tailwindcss/typography` / the PostCSS selector parser to a patched 6.1.5 or 7.1.6. Drop devDependencies from the runtime image so `sprintf-js` and `electron-builder` are not in the Coolify image. Re-run a container scanner (Trivy or Grype) on the built image for apt packages; this review could not.

### L2. Cron and Telegram webhook secrets use `!==`

**Where:** `api/cron/sync-maintenance.ts:46`, `api/cron/telegram-heartbeat.ts:134`, `api/webhooks/telegram.ts:370` (`x-telegram-bot-api-secret-token`). Cron routes are not wrapped in `apiHandler`. If `CRON_SECRET` is unset, sync-maintenance returns 503 (`38-42`). The Telegram webhook fails closed when `TELEGRAM_BOT_TOKEN` or `TELEGRAM_WEBHOOK_SECRET` is unset.

**Impact:** String compare is not constant-time. These secrets are high-entropy bearer tokens over the network, so a timing attack is not practical. Noted because the compare is the whole gate.

**Fix:** Compare equal-length SHA-256 digests with `crypto.timingSafeEqual`.

### L3. MapKit / MusicKit misconfiguration responses describe the private key

**Where:** `api/_utils/_apple-jwt-token-handler.ts:52-80`, fed by `api/_utils/_mapkit-jwt.ts:68-80`. GET is unauthenticated (the signed developer token is meant for the client). On a bad key, the 500 body includes `reason`, raw length, body length, whether PEM begin/end markers were present, and `invalidCharSample` (hex code points of invalid characters, not key bytes).

**Impact:** Confirms that a key env var is set and how it failed to parse. It does not return key material. Useful to anyone who can call the endpoint while the key is misconfigured.

**Fix:** Log the diagnostics on the server. Return a generic "not configured" JSON body.

### L4. CORS allow-all and a hardcoded tailnet suffix

**Where:** `api/_utils/_cors.ts:9` and `57-60`, `124` — any origin whose host ends with `.tailb4fa61.ts.net` is allowed with credentials. `86-88` and `132-134` — `API_ALLOWED_ORIGINS=*` sets `allowAll`. Default production allowlist is `https://os.ryo.lu` or `APP_PUBLIC_ORIGIN` when the env var is unset.

**Impact:** `*` with credentialed CORS lets any website call the API as the logged-in user from that browser. The tailnet suffix is safe only while that tailnet is trusted; it is always on, including in production, and is not an env flag. Unset `API_ALLOWED_ORIGINS` does not enable `*`.

**Fix:** Reject `*` when credentials are used, or ignore `*` in production. Gate the tailnet suffix on an env flag that is off in the public deploy.

### L5. Compose file publishes a CDP port on the internal network

**Where:** `docker-compose.yml` runs `lightpanda/browser:latest` with `serve --host 0.0.0.0 --port 9222` and `expose: 9222` (not a published host port). Env `BROWSER_CDP_URL=ws://browser:9222`. The server reads `HEADLESS_BROWSER_WS_ENDPOINT`, not `BROWSER_CDP_URL`, so this compose file does not by itself turn headless rendering on. The Coolify Dockerfile path does not include this service.

**Impact:** If something else sets the headless endpoint at that address, unauthenticated CDP is reachable from the compose network. Combined with M1/M2, a proxied page or a rebinding fetch could reach `browser:9222`.

**Fix:** Bind the browser to the compose network without `0.0.0.0` if the image allows it, and do not point the app at it unless M1 is fixed. Align the env name with what the code reads so a future compose change cannot silently enable CDP.

### L6. iOS push uses the sandbox environment and can send the session cookie to a fallback host

**Where:** `ios/ryOS/ryOS.entitlements` — `aps-environment` is `development`. New device rows are stored as sandbox in the relay. `ios/ryOS/RelayClient.swift:83`, `172-189` — fallback POST includes the raw `ryos_auth` cookie.

**Impact:** Production App Store builds usually need `production` here or pushes never arrive; that is a reliability bug with a small security angle (devices stay on the sandbox APNs gateway). The fallback sends a long-lived session cookie to `ryos-notifications.apps.air.build` whenever the primary register fails. Anyone who operates or compromises that host can replay the cookie against `/api`.

**Fix:** Use a production entitlement for release builds. Remove the fallback, or send a short-lived push-registration token instead of `ryos_auth`.

### L7. OpenAI TTS has no app-level character cap

**Where:** `api/speech.ts:207-288`. ElevenLabs (the default model, including any explicit ElevenLabs voice id) requires a server permit bound to stored assistant text (`requestResolvesToRyoVoice` in `api/_utils/speech-policy.ts:45-51`). `model: "openai"` does not. Non-`ryo` callers are limited to 10/minute and 50/day (`77-79`). `ryo` skips the TTS limiter. The provider rejects very long strings (on the order of 4096 characters). `source: "ryo-chat"` is spoofable and is not the control that matters; the permit is.

**Impact:** A caller can spend OpenAI TTS quota up to 50 requests/day without a permit, each request as large as the provider accepts. Bounded, and much smaller than an unlimited ElevenLabs path would have been.

**Fix:** Cap `text` length before the provider call on the OpenAI branch. Keep the daily cap.

### L8. Pull-request CI jobs inherit default token permissions

**Where:** `.github/workflows/build-and-deploy.yml`. Triggers are `push` to `main`, `pull_request` to `main`, and `workflow_dispatch`. No `pull_request_target`. The image job (`112-114`) sets `contents: read` and `packages: write` and runs only on push to `main` or `workflow_dispatch`. The test and build jobs that run on pull requests do not set `permissions:`. `ios-build.yml` sets `contents: read` at workflow scope. Deploy uses a Tailscale action and a Coolify webhook; the webhook URL is masked. The deploy step prints the webhook response body, which can echo whatever Coolify returns.

**Impact:** On GitHub's default `GITHUB_TOKEN` permissions (contents write, if the repo has not restricted them), a pull-request workflow can push to the repo if a later step is tricked into doing so. No injection from PR titles into `run:` scripts was found. This is hygiene, not a live injection.

**Fix:** Set `permissions: contents: read` on the workflow, and add only `packages: write` on the image job. Avoid printing the raw Coolify response.

### L9. Link preview rate-limit failures continue into the fetch

**Where:** `api/link-preview.ts:100-106`. A thrown limiter is logged and the handler still fetches. `api/audio-transcribe.ts` fails closed on the same class of error. Preview is unauthenticated, SSRF-checked, and otherwise limited to 10/minute/IP and 5/minute/host.

**Impact:** A Redis outage removes the preview rate limit. The SSRF check still runs.

**Fix:** Return 503 when the limiter throws, matching audio transcription.

### L10. `TRUSTED_PROXY_COUNT` defaults to 0

**Where:** `api/_utils/_rate-limit.ts` client-IP selection. The standalone server overwrites `x-ryos-peer-ip` from the socket peer (`scripts/api-standalone-server.ts` around `500-520`). Default trusted hop count is 0, so `X-Forwarded-For` is ignored.

**Impact:** This is configuration, and production's value was not checked. Behind one Coolify proxy, every client shares the proxy's IP for per-IP limits (AI anonymous bucket, previews, song generation, registration quota). Setting the count higher than the real hop count lets clients spoof the left-hand XFF entry and dodge limits. Either misconfiguration is operational. It is not, by itself, evidence that production is wrong.

**Fix:** Set `TRUSTED_PROXY_COUNT` to the number of proxies you run (1 for a single Coolify/Caddy hop). Document it next to the deploy env.

---

## Checked and sound

These were read because they are the usual places a report over-claims. They are not findings.

- **Chat model gate.** `src/shared/aiModels.ts:158-175`. If the username is not `ryo`, `resolveRequestedAiModel` returns `gpt-6` and ignores the requested id. `canAccessAiModel` (`117-126`) allows the default to everyone; every other id requires `ryo`; `opus-5.5` (`access: "ryo-debug"`) also requires debug mode. `api/chat.ts:339` and `api/ie-generate.ts` (~274) use that resolver. `dbg` does not unlock models. Unauthenticated requests that claim the username `ryo` are denied. The `access: "public"` labels on `sonnet-5.5`, `gpt-6.1-sol`, `gpt-5.5`, and the Gemini entries (`src/shared/aiModels.ts:13-48`) describe a catalog the UI does not expose to other users. The server does not treat those labels as permission. Changing only the label does not change enforcement.
- **Admin and repo-agent routes.** `api/admin.ts` uses `auth: "admin"` (`api/_utils/api-handler.ts:221-233`, username must be `ryo`). Cursor run status, follow-up, and the chat tool executors (`api/chat/tools/cursor-repo-agent.ts`) require `ryo`.
- **Password change and account deletion** require the current password and a fresh token. They are not reachable from C1 without the password. Recovery email set is the exception, and it is part of C1's impact.
- **Auth cookie.** `HttpOnly`, `Path=/api`, `SameSite=Lax`, `Secure` when production or `APP_PUBLIC_ORIGIN` is `https://`. Session check is SHA-256 membership, not a raw token compare.
- **Applet trust.** `createdBy` is set from the authenticated username. Only `createdBy === "ryo"` gets `allow-same-origin` plus the auth bridge. Other applets are an opaque origin (`src/utils/appletAuthBridge.ts`).
- **Dictionary HTML.** Wiktionary HTML is reduced to text in `stripHtml` (`api/dictionary/_helpers/_remote.ts` around `78-92`) and rendered as React text. `api/dictionary/ai.ts` uses a fixed Google model with anon and user caps. It does not accept a caller-selected premium model.
- **Chat markdown.** Message rendering uses `skipHtml`. `react-markdown` v10 does not render raw HTML without `rehype-raw`. `CursorRunEventView` omits `skipHtml` and also omits `rehype-raw`, so HTML is escaped.
- **Applet stream preview.** `dangerouslySetInnerHTML` in `HtmlPreview.tsx` runs after DOMPurify. No bypass was verified. The post-DOMPurify style/class regex is residual risk only, and it is not filed as a finding.
- **postMessage.** IE (`useInternetExplorerLogic.ts` ~1774), applet auth bridge, infinite-pc, and infinite-mac check `event.origin`. IE and infinite-mac also check the source window. The IE check does not stop C1, because the proxy document's origin is the app.
- **JS sandbox.** `api/chat/tools/js-sandbox.ts` is QuickJS WASM with no host bindings.
- **SSRF baseline.** Private IPv4, IPv6 loopback, unspecified, multicast, ULA, link-local, and IPv4-mapped addresses are rejected, as are metadata hostnames, URL userinfo, and non-http(s) schemes. Redirects are checked again. The remaining hole is M2.
- **Push delivery.** Registration requires auth, a 64-hex device token, and a room-id pattern (`api/push/register.ts`, 60/minute). Re-registering a token moves it to the new account; that requires the token. Private-room fanout checks membership.
- **Speech permits.** Ryo ElevenLabs voices, including an arbitrary ElevenLabs voice id, require a permit bound to server-held assistant text. The spoofable `source` field is not sufficient.
- **Kosync and OPDS** use their own authorization, not a bare `auth: "none"` hole. OPDS sets `nosniff` and a content disposition.
- **Realtime.** `api/pusher/auth.ts` requires auth and authorizes the channel before signing. The client bundle receives `PUSHER_KEY` and `PUSHER_CLUSTER` (`vite.config.ts`). `PUSHER_SECRET` is not inlined. `VITE_MAPKIT_TOKEN` and `VITE_MUSICKIT_DEVELOPER_TOKEN` are optional client fallbacks; this review did not find them set in the repo.
- **Registration quota.** Two accounts per IP per 7 days, one per device per 30 days.
- **Secrets in git.** No `.env`, `.p8`, `.pem`, or `id_rsa` paths in history. `git log -S 'BEGIN PRIVATE KEY'` hits the PEM parser sources and tests (`api/_utils/_mapkit-jwt.ts`, `_musickit-jwt.ts`, and older token helpers), not key material. No `AKIA` or `sk-proj-` / `sk-ant-` history hits. Working-tree matches for an `sk-` pattern are classic Mac icon ids in `public/resources/classic-mac-icon-catalogs/mac-os-8/catalog.json` (prefixes such as `sk-accessory`, `sk-copy-reso`), not API keys.
- **CI.** No `pull_request_target`. Image publish is push-to-main or manual dispatch. Deploy does not interpolate pull-request text into a shell script.

---

## Suggested fix order

1. C1 — proxy origin, iframe sandbox, script stripping, nosniff, stop reflecting active content types.
2. H1 — ignore `ryosBridge` messages whose frame is not the main frame.
3. M1 — before enabling headless browsing or IE cookie sessions in production.
4. M2 — pin the validated IP on every outbound fetch.
5. M6 and L1 — non-root runtime image without devDependencies; bump the PostCSS selector parser.
6. M3, M4, M5, L6 — caps, headers, and the iOS cookie fallback.

No application code was changed for this review.
