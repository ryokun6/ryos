# Privacy Policy

ryOS is a web-based desktop environment that runs almost entirely in your browser. This policy explains what data ryOS handles, why, where it is stored, who it may be shared with, and the rights you have over it. It is written to align with the EU/UK General Data Protection Regulation (GDPR) and similar privacy laws.

*Last updated: June 2026.*

---

## Data controller and contact

The data controller for ryOS as hosted at `os.ryo.lu` is Ryo Lu. If you self-host ryOS, the operator of that deployment is the controller for their instance.

For privacy questions, data-subject requests, or complaints, contact **support@os.ryo.lu**. You also have the right to lodge a complaint with your local data protection authority.

---

## Summary

- ryOS stores most of your data **locally in your browser**. It never leaves your device unless you sign in and enable cloud sync, or use a feature that calls a server (such as AI chat).
- ryOS does **not** use third-party advertising or cross-site tracking cookies. There is no Google Analytics, no advertising SDKs, and no behavioral ad profiling.
- The only cookie ryOS sets is a functional, `HttpOnly` authentication cookie used after you log in.
- First-party, privacy-conscious usage analytics are collected to keep the system running and improve it. Chat message contents are **not** collected by analytics.
- You can export, reset, or delete your data at any time from **Control Panels**.

---

## Data stored locally on your device

Most ryOS state lives only in your browser and is never transmitted unless you opt into cloud sync:

- **`localStorage`** — interface preferences (theme, language, wallpaper), window positions, and the state of apps (files metadata, Chats, Contacts, Calendar, Stickies, settings, and more).
- **`IndexedDB`** — file contents such as documents, images, and applets created in apps like TextEdit, Paint, and the Applet Store.
- **`sessionStorage`** — short-lived values such as reload guards and the current analytics session identifier.
- **Service worker / PWA cache** — application assets cached for offline use and faster loading.

You remain in control of this data. Clearing your browser storage, or using **Control Panels → reset**, removes it from your device.

---

## Usage analytics

ryOS collects first-party usage analytics to understand how the system is used, diagnose problems, and improve features. These analytics are sent to ryOS's own API (`/api/analytics/events`) and are **not** shared with third-party analytics providers.

**What is collected:**

- Event metadata such as app launches and lifecycle events, navigation within Internet Explorer, settings changes, and authentication events (e.g. that a login occurred).
- A randomly generated **client identifier** (`ryos:analytics:client-id`, stored in `localStorage`) and **session identifier** (`ryos:analytics:session-id`, stored in `sessionStorage`).
- A coarse, country-level location derived from your IP address at the time of the request.
- Basic technical information such as user agent.
- Your username, only if you are signed in.

**What is not collected:**

- The contents of your chat messages, documents, or files. Analytics records that an action happened, not what you wrote.
- Precise location. Only a coarse country is derived, and your raw IP address is not retained as part of product analytics.

**Retention:** aggregated API metrics are kept on a rolling basis (approximately 90 days) and then expire automatically.

---

## Cookies

ryOS sets a single functional cookie:

| Cookie | Purpose | Type |
|--------|---------|------|
| `ryos_auth` | Keeps you signed in after login | `HttpOnly`, `SameSite=Lax`, scoped to `/api` |

This cookie is strictly necessary for the authentication feature and is only set after you choose to log in. ryOS does not set advertising or cross-site tracking cookies, so no cookie-consent banner is required for non-essential tracking — there is none.

---

## Accounts and cloud sync

Creating an account and using cloud sync are **optional**.

If you register and sign in:

- Your username and credentials are stored on the server to authenticate you.
- With cloud sync enabled, your local app state is replicated to the server (via `/api/sync/v2/*`) so it can be restored on other devices. Binary content (such as files and images) is content-addressed and de-duplicated.
- You can log out, log out of all devices, change your password, or delete your account from **Control Panels → Account**.

If you never sign in, none of this data leaves your browser.

---

## AI features

When you use AI features (such as Chats with Ryo, AI-generated applets, Internet Explorer's time-travel generation, audio transcription, or translation), the relevant input is sent to an AI provider to produce a response.

- For signed-in users, ryOS may store long-term "memories" and daily notes derived from your interactions (via `/api/ai/extract-memories` and `/api/ai/process-daily-notes`) so the assistant can remember context across sessions. This data is tied to your account and can be removed by deleting your account.
- AI requests are processed by third-party model providers (see below). Do not share information through AI features that you would not want processed by those providers.

---

## Third-party services and processors

Depending on which features you use and how the instance is configured, ryOS may send data to the following third-party services. They act as processors for the corresponding feature:

| Service | Used for |
|---------|----------|
| OpenAI / Anthropic / Google AI | AI chat, applet generation, transcription, translation |
| ElevenLabs | Text-to-speech |
| YouTube | Video metadata and playback (iPod, Videos, TV) |
| Apple MapKit / MusicKit | Maps place search and Apple Music playback |
| Pusher | Real-time chat rooms and presence |
| Telegram | Optional account linking |
| IP geolocation provider (e.g. `ipwho.is`) | Coarse country lookup for analytics |
| Google Fonts | Loading fonts |

These services are contacted only when you use the relevant feature or when an operator has configured it. Each provider processes data under its own privacy policy.

---

## Camera and microphone

The Photo Booth app uses your device camera, and some apps use your microphone (e.g. audio transcription). Photo Booth captures are processed and stored **locally** in your browser. Audio you choose to transcribe is sent to the transcription provider to produce text.

---

## Legal bases for processing (GDPR)

Where GDPR applies, ryOS relies on the following legal bases:

- **Performance of a contract** — providing the accounts, cloud sync, and features you request.
- **Legitimate interests** — keeping the service secure and reliable and improving it through privacy-conscious analytics, balanced against your rights.
- **Consent** — for optional features you actively choose to use (such as signing in, cloud sync, or AI features). You can withdraw consent by discontinuing the feature or deleting your account.

---

## Your rights

Subject to applicable law, you have the right to:

- **Access** the personal data held about you.
- **Export / portability** — back up your local data at any time from **Control Panels → backup**.
- **Rectification** — correct inaccurate data.
- **Erasure** — delete your local data via **Control Panels → reset**, and delete server-side data by deleting your account.
- **Restriction and objection** — to certain processing, including analytics.
- **Withdraw consent** for optional, consent-based processing.

To exercise rights that cannot be handled directly in the app, contact **support@os.ryo.lu**.

---

## International transfers

ryOS and its third-party processors may process data in countries outside your own, including the United States. Where required, transfers rely on appropriate safeguards such as the providers' standard contractual clauses.

---

## Children

ryOS is not directed to children under the age required for valid consent in their jurisdiction (typically 13–16). We do not knowingly collect personal data from children below that age.

---

## Data retention

- **Local data** persists in your browser until you clear it or reset ryOS.
- **Analytics metrics** expire automatically on a rolling window (approximately 90 days).
- **Account and synced data** persist while your account exists and are removed when you delete your account.

---

## Self-hosting

ryOS is open source. If you run your own instance, you are the data controller for that deployment and are responsible for its configuration, the third-party keys you enable, and compliance with applicable law. The defaults above describe the behavior of the code, not any particular deployment.

---

## Changes to this policy

We may update this policy as ryOS evolves. Material changes will be reflected here with an updated date at the top of the page.
