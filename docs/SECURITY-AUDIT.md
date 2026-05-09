## Security Audit – ryOS

This document captures findings from a focused security review of the
`ryOS` codebase (frontend, API routes under `api/`, helpers under
`api/_utils/`, and the build/runtime configuration).

The review prioritized authentication, authorization, request handling,
SSRF defenses, CORS / CSRF posture, content-rendering surfaces, and
dependency advisories. It is not exhaustive — it concentrates on the
areas most likely to enable account takeover, data exfiltration, or
trivial server abuse.

Severity uses the conventional rubric (Critical / High / Medium / Low /
Informational) and reflects impact in a typical production deployment of
ryOS — both on Vercel (`os.ryo.lu`) and on self-hosted Coolify / Docker
deploys, which the project officially supports
(see `AGENTS.md` and `docs/1.3-self-hosting-vps.md`).

> Status: **Findings only**. No code changes are included in this PR.
> The intent is to enumerate issues, give concrete reproduction notes
> where useful, and suggest remediations so the team can triage and
> patch.

---

## Summary table

| ID | Severity | Area | Issue |
|---:|---------|------|-------|
| S-01 | **Critical** | Auth | `POST /api/auth/password/set` does not require the current password and accepts grace‑period (expired) tokens, so any leaked or stolen session token = full account takeover. |
| S-02 | **Critical** | Applets / XSS | Applet iframes use `sandbox="allow-scripts allow-same-origin …"` while loading attacker‑controlled HTML over `srcdoc` — sandbox is effectively disabled and a hostile applet can call any `/api/*` endpoint as the visiting (cookie‑authenticated) user. Combined with S‑01 this is a one‑click account takeover for any visitor of a malicious shared applet. |
| S-03 | **High** | Auth / Bans | `POST /api/auth/login` and `POST /api/auth/register` do not consult the `banned` flag on the user record, so a banned user simply re‑authenticates and gets a fresh token. The admin “ban” action is effectively a token revocation. |
| S-04 | **High** | Rate limiting | Client IP is read from `X-Forwarded-For` / `X-Real-IP` with no notion of trusted proxies. On non‑Vercel deploys (Coolify / Docker / plain Bun, all officially supported) any caller can spoof these headers and trivially bypass per‑IP rate limits, including for `register`, `login`, audio transcription, link preview, the iframe proxy, etc. |
| S-05 | **High** | CORS | `isVercelPreviewOrigin` allows any `*.vercel.app` host whose name begins with `ryos-`, `ryo-lu-`, or `os-ryo-`. Any third party can publish a Vercel project named e.g. `ryos-attacker` and its preview origin will be CORS‑allowed, defeating Origin‑based protection on the API. |
| S-06 | **High** | Brute force | Password‑guess rate limits are IP‑only and modest (login: 10/min, register acts as an oracle at 5/min). There is no per‑account lockout or exponential backoff, so combined with S‑04 (and even without it, with a botnet) accounts can be brute‑forced. |
| S-07 | **Medium** | Auth UX | `POST /api/auth/register` doubles as a login: when the chosen username exists and the supplied password matches, the response is `200 + Set-Cookie` instead of `409`. This is a username‑existence + password oracle and broadens the brute‑force surface. |
| S-08 | **Medium** | Applets | `POST /api/share-applet` lets an authenticated user *claim any unused `shareId`* (path-style squatting) and stores arbitrary `content` of unbounded size with only a 20/min/user rate limit. |
| S-09 | **Medium** | SSRF | `validatePublicUrl` resolves DNS in Node, then `fetch` resolves it again — a classic DNS rebinding TOCTOU. The check still blocks the obvious cases, but a hostile DNS record can return a public IP for the validation lookup and a private one for the fetch. |
| S-10 | **Medium** | Open proxy abuse | `GET /api/iframe-check?mode=proxy` is an unauthenticated HTML proxy with `Access-Control-Allow-Origin: *`, 300 req/min/IP global and 100/min/host limits. Combined with S‑04 this is an attractive abuse vector (traffic relay, content laundering, scraping). |
| S-11 | **Medium** | Cookie | `ryos_auth` cookie is `Path=/api`, `SameSite=Lax`, `HttpOnly`, `Secure` only in production. It is readable from the applet sandbox (S‑02) for `/api/*` requests. The cookie value is `username:token` URL‑encoded; everything is fine syntactically, but storing the *username* in the cookie means a CSRF that smuggles a different username is rejected only because the token is bound to the username server‑side. |
| S-12 | **Medium** | Dependencies | `npm audit` reports 61 advisories (1 critical / 38 high). Most are dev‑only (`vercel` CLI, `webamp` chain, `music‑metadata`, `workbox-build`, build‑time `picomatch`/`minimatch`/`rollup`/`tar`). The runtime‑relevant ones are `dompurify <3.3.3`, `uuid 11.0–11.1.0`, `form-data` (transitive via `openai`/`pusher`), and `path-to-regexp` (via `@vercel/node`). |
| S-13 | **Low** | XSS hardening | `og-share` HTML template uses `escapeHtml` for content interpolated into `<script>location.replace("…")</script>`. HTML‑escaping is not safe for JS string contexts in general (`\\` and U+2028/2029 not handled). Currently safe because the only attacker‑influenceable inputs are URL‑pathname segments restricted by regex, but it is a fragile pattern. |
| S-14 | **Low** | Info leak | Admin endpoint emits `{ targetUsername }`, raw stack traces and arbitrary error strings via `res.status(500).json({ error: errorMessage })` (e.g. `share-applet`). Useful for fingerprinting; not exploitable on its own. |
| S-15 | **Informational** | Profanity filter | `_validation.ts` injects the slur `"chink"` into `leoProfanity` as a *blocked* term. The intent is filtering, but the literal slur appears in the source. |

---

## Detailed findings

### S-01 — Password change requires no current password (Critical)

`api/auth/password/set.ts`:

```ts
export default apiHandler<SetPasswordRequest>(
  {
    methods: ["POST"],
    auth: "required",
    allowExpiredAuth: true,
    parseJsonBody: true,
  },
  async ({ res, redis, logger, startTime, user, body }) => {
    const password = body?.password;
    // …length checks…
    const passwordHash = await hashPassword(password);
    await setUserPasswordHash(redis, user?.username || "", passwordHash);
    res.status(200).json({ success: true });
  }
);
```

Two problems:

1. **No proof of current password.** Any caller holding a valid session
   token (cookie or `Authorization: Bearer …`) can replace the password,
   irreversibly stealing the account. Industry practice is to require
   the current password, or at least a fresh re‑authentication, for
   credential changes.
2. **`allowExpiredAuth: true`** widens the window: tokens within the
   30‑day grace period (`TOKEN_GRACE_PERIOD` in
   `api/_utils/auth/_constants.ts`) still succeed.

Combined with **S‑02** below, any user who opens a malicious shared
applet can be silently locked out of their account: the applet runs
same‑origin JS and POSTs to `/api/auth/password/set` with the cookie
attached.

**Suggested fix.** Add an `oldPassword` parameter; verify with bcrypt
before hashing the new one. Disallow `allowExpiredAuth` on this route.
Optionally rotate all of the user’s tokens on success.

---

### S-02 — Applet iframes are not actually sandboxed (Critical)

`src/apps/applet-viewer/components/AppletViewerAppComponent.tsx` and
`src/components/shared/HtmlPreview.tsx` both render arbitrary user
HTML/JS via:

```tsx
<iframe
  srcDoc={…}
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups
           allow-popups-to-escape-sandbox allow-modals
           allow-pointer-lock allow-downloads
           allow-storage-access-by-user-activation"
/>
```

The combination of `allow-scripts` and `allow-same-origin` for an
`srcdoc` iframe (which inherits the parent origin) means the embedded
script runs **in the parent’s origin**:

* It can `fetch('/api/auth/password/set', { method: 'POST', credentials: 'include', body: '{"password":"…"}' })`
  and the user’s `ryos_auth` HttpOnly cookie is sent.
* It can read `localStorage`, `sessionStorage`, IndexedDB.
* It can post to any same‑origin endpoint as the user (delete files,
  send chat messages, etc.).
* `allow-popups-to-escape-sandbox` allows opening unsandboxed popups.

Applets are accepted from any registered user via
`POST /api/share-applet` with no content review (`content: z.string().min(1)`),
served back to anyone who visits `/applet-viewer/{id}`, and rendered
into the same iframe. This is **stored XSS that yields full account
takeover**, especially when combined with **S‑01**.

**Suggested fix.** Either:

* Drop `allow-same-origin` for applet iframes (treat applets as
  cross‑origin, like the IE proxy already does for third‑party sites),
  *or*
* Serve applet HTML from an origin distinct from the API (a sandbox
  domain — e.g. `applets.ryo.lu`) and continue to use `allow-scripts`,
  *or*
* Require a cryptographic allowlist (admin‑signed) before shared
  applets can run with same‑origin privileges.

Additionally, the `applet:share:*` payloads should be DOMPurify‑sanitized
before persistence (the `Streamdown` / `HtmlPreview` rendering path
already uses DOMPurify for *streaming previews* but not for the final
applet content).

---

### S-03 — Banned users can re‑authenticate (High)

`api/admin.ts → banUser()` sets `userData.banned = true` and revokes all
tokens via `deleteAllUserTokens`. But `api/auth/login.ts` only checks
that the user record exists and the password matches; it never reads
the `banned` flag:

```ts
const userData = await redis.get(userKey);
if (!userData) { res.status(401).json({ error: "Invalid credentials" }); return; }

const passwordHash = await getUserPasswordHash(redis, username);
// …no banned check…
await storeToken(redis, username, token);
```

`api/auth/register.ts` has the same problem in its “user already exists,
log them in” branch (lines 121–143). A banned user with their original
password thus re‑acquires a session immediately.

**Suggested fix.** After the password check, parse `userData` and reject
with `403 { error: "account_banned" }` when `banned === true`. Consider
also blocking `POST /api/messages/*`, `applet save`, etc. in middleware
based on the same flag.

---

### S-04 — Trusted‑proxy unaware IP extraction (High)

`api/_utils/_rate-limit.ts → getClientIp()` reads, in order:
`x-vercel-forwarded-for`, `x-forwarded-for`, `x-real-ip`,
`cf-connecting-ip`. There is no concept of a trusted proxy: every
header is taken at face value.

* On Vercel, `x-vercel-forwarded-for` is set by Vercel and clobbers any
  client value, so the function works correctly there.
* On Coolify / Docker / plain Bun (the documented self‑host targets),
  callers can simply send `X-Forwarded-For: 1.2.3.4` and split per‑IP
  rate‑limit buckets at will. This bypasses every per‑IP limit in the
  codebase: registration (5/min), login (10/min), audio transcribe
  (10/min burst, 50/day), iframe‑proxy (300/min global, 100/min/host),
  link preview (10/min), parse‑title (15/min, 500/day), …

Smaller copies of the same logic also exist in
`api/auth/login.ts`, `api/auth/register.ts`,
`api/rooms/_helpers/_helpers.ts`, and `api/chat.ts`.

**Suggested fix.** Add a `TRUSTED_PROXY_COUNT` (or
`TRUSTED_PROXY_CIDRS`) env var. When > 0, walk `X-Forwarded-For` from
the right and skip that many proxies; otherwise prefer the socket peer
(`req.socket.remoteAddress`) over the header. Document the requirement
to enable this on Coolify / Docker.

---

### S-05 — Vercel preview‑origin allowlist is exploitable (High)

`api/_utils/_cors.ts → isVercelPreviewOrigin()`:

```ts
const ALLOWED_VERCEL_PREVIEW_PREFIXES = ["ryos-", "ryo-lu-", "os-ryo-"];

return (
  hostname.endsWith(".vercel.app") &&
  ALLOWED_VERCEL_PREVIEW_PREFIXES.some((p) => hostname.startsWith(p))
);
```

Vercel preview hostnames have the form
`<project>-<hash>-<team>.vercel.app`, where `<project>` is chosen by
*whoever owns the project*. Anyone can create a Vercel project named
`ryos-evil` in their own team; its preview deployments
(`ryos-evil-abc123-attacker.vercel.app`) match the prefix check and the
ryOS API will set `Access-Control-Allow-Origin` for them.

This only matters in `preview` runtime (i.e. when `VERCEL_ENV=preview`)
since production checks for the exact `os.ryo.lu` host, but it still
defeats CORS protection on staging deployments — and most secrets used
in staging are the same as in production.

**Suggested fix.** Anchor on the team/owner suffix instead of the
project prefix (e.g. `endsWith("-ryo-lu.vercel.app")` or use Vercel’s
deployment‑protection feature) — preview hostnames always end in
`-<team>.vercel.app`.

---

### S-06 — Weak brute‑force protections (High)

* `api/auth/login.ts`: 10 attempts/min/IP, no account‑level counter,
  no exponential backoff.
* `api/auth/register.ts`: 5 attempts/min/IP, plus a 24 h block — but
  see **S‑07** below; register acts as a second login oracle.
* No CAPTCHA, no `webauthn`/2FA option, no password‑pwned check.

Combined with **S‑04** (IP‑bucket bypass on self‑host) an attacker can
brute force passwords to user accounts (8 char minimum, no complexity
requirement) via either endpoint.

**Suggested fix.** Add a per‑username counter (e.g.
`rl:auth:login:user:<username>`) that backs off exponentially after
~5 failures and locks for 15 min after ~20. Increase
`PASSWORD_MIN_LENGTH` (currently 8) or add a strength check
(zxcvbn, “pwned passwords” API).

---

### S-07 — `register` doubles as a username/password oracle (Medium)

```ts
if (existingUser) {
  const storedHash = await getUserPasswordHash(redis, username);
  if (storedHash) {
    const passwordValid = await verifyPassword(password, storedHash);
    if (passwordValid) {
      // log them in — Set-Cookie + 200
    }
  }
  res.status(409).json({ error: "Username already taken" });
}
```

This is a deliberate UX choice (graceful handover from the legacy
session‑less flow), but its side effect is:

* Distinct response codes between “username free” (`201`), “username
  taken, wrong password” (`409`), and “username taken, right password”
  (`200 + Set-Cookie`) → a username‑existence oracle and a second login
  endpoint.
* `register` shares no rate‑limit bucket with `login`, so an attacker
  who hits the login limit can keep guessing through `register`.

**Suggested fix.** Either (a) treat `register` as registration‑only and
return `409` regardless of password, *or* (b) share the rate‑limit
counter with `login` and apply per‑account lockouts.

---

### S-08 — `share-applet` allows ID squatting and oversize payloads (Medium)

`api/share-applet.ts` (POST):

```ts
if (shareId) {
  const existingData = await redis.get(`${APPLET_SHARE_PREFIX}${shareId}`);
  if (existingData) { /* must own it to update */ }
  else { id = shareId; } // ← user gets to pick any unused id
} else {
  id = generateId();
}
```

Any authenticated user can therefore claim arbitrary `shareId` strings
(e.g. visually‑confusable IDs of legitimate applets) and have them
served from `/applet-viewer/{shareId}`. Also, `content` is
`z.string().min(1)` only — no upper bound — so a single 20 req/min user
can store many MB of arbitrary data per request in Redis.

**Suggested fix.** Server‑generate the ID on creation; only allow
client‑specified `shareId` when the caller is admin or already owns it.
Add a `content` size cap (e.g. 512 KB or 1 MB) and reject payloads
above it. Validate `windowWidth`/`windowHeight` ranges.

---

### S-09 — DNS rebinding TOCTOU in SSRF guard (Medium)

`api/_utils/_ssrf.ts → validatePublicUrl()` resolves the hostname with
`dns.lookup({ all: true })`, checks every record against the
private‑range list, and returns. It does **not** pin the resolved IP:
the subsequent `fetch()` does its own DNS lookup. A hostile DNS server
can return a public address on the first call and `127.0.0.1` /
`169.254.169.254` / etc. on the second.

This is the standard “DNS rebinding for SSRF” pattern. It affects all
endpoints that use `safeFetchWithRedirects` /
`validatePublicUrl` — `iframe-check`, `link-preview`, and others.

**Suggested fix.** Resolve once, then build a custom `Agent` (Node’s
`undici.Agent` with `connect.lookup` overridden, or pass `lookup` via
the `https` agent) that returns the *already‑validated* address tuple
for the rest of the request. `pin-ip` / `ssrf-req-filter` packages
implement this pattern.

---

### S-10 — `iframe-check?mode=proxy` is a public, anonymous web proxy (Medium)

The route streams arbitrary upstream HTML, sets
`Access-Control-Allow-Origin: *`, rewrites links and CSPs, and is
unauthenticated. Per‑IP limits are 300/min global and 100/min/host;
under **S‑04** these are bypassable.

This invites:

* Generic scraping / IP laundering through `os.ryo.lu`.
* Bypassing CSPs / X‑Frame‑Options imposed by third parties on their
  own users.
* Free egress bandwidth funded by the operator.

**Suggested fix.** Require auth (or at least a short‑lived signed token
issued by the same origin); tighten per‑IP limits; cap response size;
add a short‑TTL cache to soften legitimate traffic spikes.

---

### S-11 — Auth cookie scope and contents (Medium)

`api/_utils/_cookie.ts`:

* `Path=/api` is good (cookie is not sent on plain page navigations).
* `SameSite=Lax` is the right default, but combined with same‑origin
  fetches from any same‑origin iframe (S‑02) it does not provide CSRF
  protection.
* `Secure` is conditional on `getRuntimeEnv() === "production"`. On
  preview / staging deployments the cookie is sent over plaintext if
  the app is reachable on plain HTTP.
* The cookie value `${username}:${token}` exposes the username in the
  cookie. Since validation is `chat:token:user:{username}:{token}`,
  the username is necessary, but consider rotating to a random session
  ID that maps server‑side to a username — that closes user‑enumeration
  via cookie inspection in shared‑device scenarios.

---

### S-12 — Dependency advisories (Medium)

`npm audit` (with a regenerated lockfile) reports **61 vulnerabilities
(1 critical, 38 high, 20 moderate, 2 low)**. The signal‑rich subset
(runtime impact rather than build‑time only):

| Package | Severity | Notes |
|---------|---------:|-------|
| `form-data 4.0.0–4.0.3` (transitive via `openai`, `pusher` → `@types/node-fetch`) | critical | Insecure boundary RNG (GHSA‑fjxv‑7rqg‑78g4). Bumping `openai`/`pusher` minor brings in fixed `form-data`. |
| `uuid 11.0–11.1.0` (direct) | moderate | Buffer bounds (GHSA‑w5hq‑g745‑h8pq). Trivial bump to 11.1.1+. |
| `dompurify <3.3.3` (direct via `@types/dompurify` chain) | moderate | Bypass advisories; we use it to sanitize streaming HTML. Bump to ≥3.3.3. |
| `path-to-regexp` (via `@vercel/node`) | high | ReDoS. Pin a fixed `@vercel/node` ≥3.0.1. |
| `undici` (transitive) | high | Multiple CRLF / smuggling / DoS issues. |
| `webamp 2.2.0` (direct), `music-metadata`, `flatted`, `lodash`, `@isaacs/brace-expansion`, `serialize-javascript`, `glob`, `minimatch`, `tar`, `@babel/plugin-transform-modules-systemjs`, … | high | Mostly transitive via `webamp` / vercel CLI / workbox. The vercel CLI chain is dev‑only on local dev; `webamp` ships in the bundle. |

**Suggested fix.** Run `npm audit fix` to take the non‑breaking
upgrades; for the breaking ones (`@vercel/node@3`, `webamp@1.5`,
`vercel@50`) do a bump in a focused PR and verify the build / API.
Add a Dependabot or Renovate config so this doesn’t drift.

---

### S-13 — JS context interpolation in the OG share template (Low)

`api/_utils/og-share.ts`:

```ts
return `<!DOCTYPE html>
<html …>
…
<script>location.replace("${escapeHtml(redirectUrl)}")</script>
</head>
</html>`;
```

`escapeHtml` only handles `& < > " '`. Inside `<script>`, HTML entities
are not decoded by the parser, so a literal `\` in the URL would be
interpreted by the JS string literal. Today this is fine because:

* `redirectUrl` is `${publicOrigin}${pathname}?_ryo=1`, where
  `publicOrigin` is configured and `pathname` is matched against
  restrictive regexes (`/^\/[a-z-]+$/`, `/^\/videos\/([a-zA-Z0-9_-]+)$/`,
  …) that reject backslashes.

But the pattern is fragile — a future regex relaxation reintroduces
XSS. Either escape for JS string context (`JSON.stringify(redirectUrl)`)
or move the redirect into a `<meta http-equiv="refresh">` tag that does
not require JS escaping.

---

### S-14 — Verbose error responses (Low)

Several endpoints return raw `error.message` from caught exceptions
(`api/share-applet.ts`, `api/parse-title.ts`, `api/iframe-check.ts`).
Stack traces and library‑internal hints can leak file paths, package
versions, and Redis‑backend details.

**Suggested fix.** In production, return a generic `Internal Server
Error` and log the detail server‑side. The `apiHandler` wrapper already
does this for unhandled exceptions; route handlers should follow the
same convention.

---

### S-15 — Hard‑coded slur in the profanity list (Informational)

`api/_utils/_validation.ts`:

```ts
leoProfanity.add(["badword1", "badword2", "chink"]);
```

The intent is to add the term to the **blocked** dictionary, not to use
it. Still, the literal slur is committed in source and surfaces in
search/grep results. Consider loading the extra terms from a separate,
non‑indexed config file (e.g. `data/blocked-usernames.txt`) and adding
a lint exception.

---

## Out of scope / not investigated

* WebSocket / Pusher channel authorization (`api/_utils/realtime.ts`,
  `api/presence/*`, `api/listen/*`).
* Telegram webhook (`api/webhooks/telegram.ts`) — large file, only
  briefly skimmed.
* Tauri (`src-tauri/`) capabilities and command surface.
* Service worker (`sw.js`) caching of authenticated responses.
* Cron job authorization (`api/cron/telegram-heartbeat.ts`).

These deserve a follow‑up audit.

---

## Suggested triage order

1. **S‑01 + S‑02** are the highest impact and are quick to ship: drop
   `allow-same-origin` from the applet iframe (or move applets to a
   sandbox subdomain) and require `oldPassword` on
   `/api/auth/password/set`.
2. **S‑03** (ban bypass) — one‑line `if (parsed.banned) return 403;`
   in `login.ts` and `register.ts`.
3. **S‑04** (IP‑trust on self‑host) — needs an env‑driven trusted
   proxy count; also document this in `docs/1.3-self-hosting-vps.md`.
4. **S‑05** — tighten the Vercel preview allowlist.
5. **S‑12** — `npm audit fix` plus targeted bumps for `@vercel/node`,
   `webamp`, `openai`/`pusher`, `dompurify`, `uuid`.
6. The remainder as time allows.
