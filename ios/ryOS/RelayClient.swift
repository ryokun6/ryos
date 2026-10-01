import Foundation
import WebKit

@MainActor
final class ShellRouter {
    static let shared = ShellRouter()

    private var pendingRoomId: String?
    private weak var webView: WKWebView?

    func attach(_ webView: WKWebView) {
        self.webView = webView
        firePendingRoom()
    }

    func queue(roomId: String?) {
        pendingRoomId = roomId
    }

    /// Called when a notification is tapped (app cold or backgrounded) and
    /// once the web client is ready to receive the room id.
    func firePendingRoom() {
        guard let roomId = pendingRoomId else { return }
        pendingRoomId = nil
        guard let webView else { return }
        let escaped = roomId
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
        webView.evaluateJavaScript(
            "window.__ryosEmitOpenRoom && window.__ryosEmitOpenRoom('\(escaped)')",
            completionHandler: nil
        )
    }
}

/// Forwards the APNs token and the signed-in session to the notification
/// relay so it can watch the user's chat channels and push while the app
/// is closed. Primary target is the web origin itself (the in-ryos relay,
/// contract v1: /api/push/register); the standalone AirBuild worker is
/// kept as a fallback while the in-app relay is being deployed.
@MainActor
final class RelayClient {
    static let shared = RelayClient()
    private let primaryEndpoint = URL(string: "https://os.ryo.lu/api/push/register")!
    private let fallbackEndpoint = URL(string: "https://ryos-notifications.apps.air.build/api/register")!
    /// Flips to false once the in-ryos relay answers /api/push/register.
    private var useFallbackUntilPrimaryWorks = true
    var apnsToken: String?

    func update(apnsToken: String?) {
        self.apnsToken = apnsToken
    }

    func registerDevice(
        username: String?, isAuthenticated: Bool, rooms: [String]
    ) {
        guard let token = apnsToken, !token.isEmpty else { return }
        let payload: [String: Any?] = [
            "deviceToken": token,
            "username": username,
            "isAuthenticated": isAuthenticated,
            "rooms": rooms,
            "authCookie": SessionCookieReader.shared.authCookieHeader,
            "appVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0",
        ]
        guard let body = try? JSONSerialization.data(withJSONObject: payload, options: [.fragmentsAllowed]) else { return }

        // Same-origin register: the session cookie rides along from the
        // webview's shared store, so the server can identify the user
        // without us forwarding credentials in the body.
        let endpoint = useFallbackUntilPrimaryWorks ? fallbackEndpoint : primaryEndpoint
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if endpoint == fallbackEndpoint, let cookie = SessionCookieReader.shared.authCookieHeader {
            // Worker fallback: it cannot see our cookies, so the session
            // travels in the body (worker contract only).
            request.setValue(cookie, forHTTPHeaderField: "X-Ryos-Auth")
        } else {
            // The relay's CORS gate requires an Origin it recognizes, and
            // URLSession never sends one on its own — without this header
            // every native registration is answered 403 and the device
            // token never lands in the relay's store (found via the
            // closed-app push test, 2026-10-01). Web-origin is the value
            // the relay already allowlists for its own front-end.
            request.setValue("https://os.ryo.lu", forHTTPHeaderField: "Origin")
        }
        request.httpBody = body
        URLSession.shared.dataTask(with: request).resume()

        if useFallbackUntilPrimaryWorks {
            // Probe the primary once per registration cycle; on success it
            // becomes the only target.
            var probe = URLRequest(url: primaryEndpoint)
            probe.httpMethod = "POST"
            probe.timeoutInterval = 15
            probe.setValue("application/json", forHTTPHeaderField: "Content-Type")
            probe.setValue("https://os.ryo.lu", forHTTPHeaderField: "Origin")
            probe.httpBody = body
            URLSession.shared.dataTask(with: probe) { [weak self] _, response, _ in
                guard let self, let http = response as? HTTPURLResponse, http.statusCode == 200 else { return }
                DispatchQueue.main.async { self.useFallbackUntilPrimaryWorks = false }
            }.resume()
        }
    }
}

/// Reads the ryOS session cookie (`ryos_auth`, HttpOnly) out of the shared
/// webview cookie store — the only place the native layer can see it. It is
/// forwarded only to the fallback relay (the web origin gets it directly
/// from the cookie jar).
@MainActor
final class SessionCookieReader {
    static let shared = SessionCookieReader()
    private var cached: HTTPCookie?

    func refresh(from store: WKHTTPCookieStore) {
        store.getAllCookies { [weak self] cookies in
            let match = cookies.first { $0.name == "ryos_auth" }
            DispatchQueue.main.async {
                self?.cached = match
            }
        }
    }

    var authCookieHeader: String? {
        cached.map { "\($0.name)=\($0.value)" }
    }
}
