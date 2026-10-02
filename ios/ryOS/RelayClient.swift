import Foundation
import WebKit

/// Native half of the `[push]` trail (Console.app / Xcode). Never pass full
/// device tokens, the session cookie, or message text.
func pushLog(_ message: String) {
    NSLog("ryOS: [push] %@", message)
}

/// `abcd…wxyz` — same shape as `redactDeviceToken` in api/_utils/push-relay.ts.
func redactedPushToken(_ token: String) -> String {
    token.count > 8 ? "\(token.prefix(4))…\(token.suffix(4))" : "****"
}

@MainActor
final class ShellRouter {
    static let shared = ShellRouter()

    private var pendingRoomId: String?
    private weak var webView: WKWebView?
    /// Set on `boot-finished`: the page and its injected bridge exist, and the
    /// bridge holds the room until the web client subscribes.
    private var pageReady = false

    func attach(_ webView: WKWebView) {
        self.webView = webView
        firePendingRoom()
    }

    func queue(roomId: String?) {
        pushLog("Queued tapped room \(roomId ?? "nil") (pageReady=\(pageReady))")
        pendingRoomId = roomId
    }

    func markPageReady() {
        pushLog("Web client ready (pendingRoom=\(pendingRoomId != nil))")
        pageReady = true
        firePendingRoom()
    }

    /// Called when a notification is tapped (app cold or backgrounded) and
    /// once the web client is ready to receive the room id.
    func firePendingRoom() {
        // A cold-launch tap arrives before the page loads; keep it queued.
        guard pageReady, let webView, let roomId = pendingRoomId else { return }
        pendingRoomId = nil
        pushLog("Delivering tapped room \(roomId) to web client")
        let escaped = roomId
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        webView.evaluateJavaScript(
            "window.__ryosEmitOpenRoom && window.__ryosEmitOpenRoom('\(escaped)')",
            completionHandler: { _, error in
                if let error {
                    pushLog("Delivering tapped room failed: \(error.localizedDescription)")
                }
            }
        )
    }
}

/// Forwards the APNs token and the signed-in session to the notification
/// relay so it can watch the user's chat channels and push while the app
/// is closed. Primary target is the web origin itself (`api/push/register`:
/// `{ deviceToken, appVersion?, rooms? }`, authenticated by the `ryos_auth`
/// cookie and an allowed `Origin`). The standalone AirBuild worker is only
/// tried when the primary rejects or cannot be reached.
@MainActor
final class RelayClient {
    static let shared = RelayClient()
    /// Mirrors `MAX_ROOMS_PER_DEVICE` in api/_utils/push-relay.ts.
    private static let maxRooms = 200
    private var primaryEndpoint: URL {
        ShellViewModel.origin.appending(path: "api/push/register")
    }
    private let fallbackEndpoint = URL(string: "https://ryos-notifications.apps.air.build/api/register")!
    var apnsToken: String?
    /// Token + session + rooms of the last registration the primary accepted;
    /// the web client reports state on every room switch, and the route is
    /// rate limited, so identical registrations are skipped.
    private var registeredKey: String?
    private var inFlightKey: String?
    /// Last logged reason registration could not start (logged once per change).
    private var lastSkipReason: String?

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }

    func update(apnsToken: String?) {
        self.apnsToken = apnsToken
    }

    private func logSkip(_ reason: String?) {
        guard reason != lastSkipReason else { return }
        lastSkipReason = reason
        if let reason { pushLog("Device registration waiting: \(reason)") }
    }

    func registerDevice(
        username: String?, isAuthenticated: Bool, rooms: [String]
    ) {
        guard isAuthenticated else { return logSkip("signed out") }
        guard let token = apnsToken, !token.isEmpty else { return logSkip("no APNs token") }
        let roomIds = Array(Array(Set(rooms)).sorted().prefix(Self.maxRooms))

        // URLSession does not share WebKit's cookie jar, so read the HttpOnly
        // session cookie from the web view's store for every attempt.
        SessionCookieReader.shared.readAuthCookieHeader { [weak self] cookieHeader in
            guard let self else { return }
            guard let cookieHeader else { return self.logSkip("no ryos_auth cookie") }
            self.logSkip(nil)
            let key = [token, cookieHeader, roomIds.joined(separator: ",")].joined(separator: "|")
            guard key != self.registeredKey, key != self.inFlightKey else { return }
            self.inFlightKey = key
            pushLog("Registering device \(redactedPushToken(token)) rooms=\(roomIds.count)")
            self.postPrimary(token: token, rooms: roomIds, cookieHeader: cookieHeader) { accepted in
                if self.inFlightKey == key { self.inFlightKey = nil }
                if accepted {
                    self.registeredKey = key
                } else {
                    self.postFallback(
                        token: token, username: username, rooms: roomIds, cookieHeader: cookieHeader
                    )
                }
            }
        }
    }

    private func postPrimary(
        token: String,
        rooms: [String],
        cookieHeader: String,
        completion: @escaping @MainActor (Bool) -> Void
    ) {
        let payload: [String: Any] = [
            "deviceToken": token,
            "appVersion": appVersion,
            "rooms": rooms,
        ]
        guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return }
        var request = URLRequest(url: primaryEndpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // The API rejects requests without an allowed Origin/Referer.
        request.setValue(ShellViewModel.origin.absoluteString, forHTTPHeaderField: "Origin")
        request.setValue(cookieHeader, forHTTPHeaderField: "Cookie")
        request.httpBody = body
        URLSession.shared.dataTask(with: request) { _, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode
            let accepted = status == 200
            pushLog(
                "POST api/push/register \(redactedPushToken(token)) -> "
                    + (status.map { String($0) } ?? "no response")
                    + (error.map { " (\($0.localizedDescription))" } ?? "")
            )
            DispatchQueue.main.async { completion(accepted) }
        }.resume()
    }

    /// Legacy worker contract: the worker cannot see our cookies, so the
    /// session travels in the body and `X-Ryos-Auth`.
    private func postFallback(
        token: String, username: String?, rooms: [String], cookieHeader: String
    ) {
        let payload: [String: Any] = [
            "deviceToken": token,
            "username": username.map { $0 as Any } ?? NSNull(),
            "isAuthenticated": true,
            "rooms": rooms,
            "authCookie": cookieHeader,
            "appVersion": appVersion,
        ]
        guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return }
        var request = URLRequest(url: fallbackEndpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(cookieHeader, forHTTPHeaderField: "X-Ryos-Auth")
        request.httpBody = body
        pushLog("Primary register failed; trying AirBuild fallback for \(redactedPushToken(token))")
        URLSession.shared.dataTask(with: request) { _, response, error in
            let status = (response as? HTTPURLResponse)?.statusCode
            pushLog(
                "AirBuild fallback register \(redactedPushToken(token)) -> "
                    + (status.map { String($0) } ?? "no response")
                    + (error.map { " (\($0.localizedDescription))" } ?? "")
            )
        }.resume()
    }
}

/// Reads the ryOS session cookie (`ryos_auth`, HttpOnly) out of the shared
/// webview cookie store — the only place the native layer can see it.
@MainActor
final class SessionCookieReader {
    static let shared = SessionCookieReader()
    /// Fresh `ryos_auth=…` header from the default web view store (the shell's
    /// `websiteDataStore`), or nil when signed out.
    func readAuthCookieHeader(_ completion: @escaping @MainActor (String?) -> Void) {
        WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
            let header = cookies.first { $0.name == "ryos_auth" }
                .map { "\($0.name)=\($0.value)" }
            DispatchQueue.main.async { completion(header) }
        }
    }
}
