# Privacy Policy

ryOS is a web-based desktop environment that runs almost entirely in your browser. This policy explains what data ryOS handles, why, where it is stored, who it may be shared with, and the rights you have over it. It is written to align with the EU/UK General Data Protection Regulation (GDPR) and similar privacy laws.

For the Chrome extension, see the separate [ryOS Subtitles Privacy Policy](/docs/subtitles-privacy).

*Last updated: October 8, 2026.*

---

## Data controller and contact

The data controller for ryOS as hosted at `os.ryo.lu` is Ryo Lu. If you self-host ryOS, the operator of that deployment is the controller for their instance.

For privacy questions, data-subject requests, or complaints, contact **support@ryo.lu**. You also have the right to lodge a complaint with your local data protection authority.

---

## Summary

- ryOS stores most of your data **locally in your browser**. It never leaves your device unless you sign in and enable cloud sync, or use a feature that calls a server (such as AI chat).
- ryOS does **not** use third-party advertising or cross-site tracking cookies. There is no Google Analytics, no advertising SDKs, and no behavioral ad profiling.
- The only cookie ryOS sets is a functional, `HttpOnly` authentication cookie used after you log in.
- First-party, privacy-conscious usage analytics are collected to keep the system running and improve it. Chat message contents are **not** collected by analytics.
- You can export, reset, or delete your data at any time from **Control Panels**.
- The ryOS Mobile iPhone app adds only the notification feature described below; it collects nothing else.

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

When you use an AI feature, the relevant input is sent to an AI provider to produce a response. The AI features are:

- Chats with Ryo and the desktop assistant, including images you attach.
- Mentioning @ryo in a chat room. To reply, Ryo reads the room's recent messages along with the usernames of the people who posted them. This means messages you post in a room may be sent to the AI provider when anyone in that room mentions @ryo, not only when you do.
- AI inside applets and the Books reader.
- Generating applets, and creating TV channels from a description.
- Internet Explorer's time-travel generation, which sends the URL and year you choose.
- Audio transcription and translation.
- "Remove Background" in Stuff, which sends the image you choose.

Some AI processing happens without a message from you:

- For signed-in users, ryOS may store long-term "memories" and daily notes derived from your interactions (via `/api/ai/extract-memories` and `/api/ai/process-daily-notes`) so the assistant can remember context across sessions. An AI provider produces them: past conversations and daily notes are sent to a model to extract them. This data is tied to your account and can be removed by deleting your account.
- When a signed-in user who has memories opens Chats, ryOS sends those memories and recent daily notes to an AI provider (currently Google) to write a greeting. Signed-in messages to Ryo in Chats or the desktop assistant also include your memories, so Ryo can use them in the reply.
- AI requests are processed by third-party model providers (see below). Do not share information through AI features that you would not want processed by those providers.

---

## Notifications on the iPhone app (ryOS Mobile)

ryOS is also available as a native iPhone app, **ryOS Mobile**. It is a shell around the same web desktop: everything inside the app is covered by the sections above, and the app adds no analytics, advertising, or tracking of its own.

The one feature the app adds is chat notifications while the app is closed. When you sign in to ryOS inside the app and allow notifications, the app registers with the ryOS notification service (part of this service). Registration sends:

- your username and sign-in state,
- the list of chat rooms you're in,
- an Apple push token identifying your device for notifications,
- your ryOS sign-in session (so the service can check your chat rooms on your behalf), and
- the app version.

The service uses this for one purpose: checking your chat rooms for new messages and sending them to your device as push notifications. Message contents are read at the moment of checking and delivered as the notification text; no messages are stored. A small marker per device and room (the time of the last message seen) prevents duplicate notifications.

You can stop notifications at any time by turning them off for ryOS in iOS Settings, or by signing out of ryOS in the app — signing out also deletes the device's registration. You can also ask us to remove a registration by emailing **support@ryo.lu**. Deleting the app removes all data it keeps on the device.

---

## Third-party services and processors

Depending on which features you use and how the instance is configured, ryOS may send data to the following third-party services. They act as processors for the corresponding feature:

| Service | Used for |
|---------|----------|
| OpenAI / Anthropic / Google AI | The AI features listed above: AI chat and the desktop assistant (including attached images and, for signed-in users, memories), @ryo replies in chat rooms, AI in applets and Books, applet and TV channel generation, Internet Explorer generation, memory extraction and greetings, transcription, translation, image background removal (Stuff) |
| ElevenLabs | Text-to-speech |
| YouTube | Video metadata and playback (iPod, Videos, TV) |
| Apple MapKit / MusicKit | Maps place search and Apple Music playback |
| Pusher | Real-time chat rooms and presence |
| Apple Push Notification service (APNs) | Delivering chat notifications to the ryOS Mobile app |
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

To exercise rights that cannot be handled directly in the app, contact **support@ryo.lu**.

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
- **Notification registrations** for the ryOS Mobile app are kept while notifications are on and deleted when you sign out in the app or ask us to.

---

## Self-hosting

ryOS is open source. If you run your own instance, you are the data controller for that deployment and are responsible for its configuration, the third-party keys you enable, and compliance with applicable law. The defaults above describe the behavior of the code, not any particular deployment.

---

## Changes to this policy

We may update this policy as ryOS evolves. Material changes will be reflected here with an updated date at the top of the page.
