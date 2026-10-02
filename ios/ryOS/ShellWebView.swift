import SwiftUI
import WebKit
import Network
import AuthenticationServices

/// WKWebView shell around https://os.ryo.lu. The web client detects the
/// injected `window.ryosDesktop` bridge (the same contract the Electron
/// desktop shell installs) and hands the shell its notification state.
struct ShellWebView: UIViewRepresentable {
    let shell: ShellViewModel

    func makeCoordinator() -> Coordinator {
        Coordinator(shell: shell)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let userContent = config.userContentController
        userContent.addUserScript(
            WKUserScript(
                source: DesktopBridge.injectedJavaScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        userContent.add(context.coordinator, name: "ryosBridge")
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.scrollView.isScrollEnabled = false
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.02, green: 0.03, blue: 0.08, alpha: 1)
        context.coordinator.attach(webView)
        ShellRouter.shared.attach(webView)
        webView.load(URLRequest(url: ShellViewModel.origin))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}

final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, ASWebAuthenticationPresentationContextProviding {
    private weak var shell: ShellViewModel?
    private weak var webView: WKWebView?
    private let pathMonitor = NWPathMonitor()
    private var hasAskedForPermission = false

    init(shell: ShellViewModel) {
        self.shell = shell
        super.init()
    }

    func attach(_ webView: WKWebView) {
        self.webView = webView

        pathMonitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            DispatchQueue.main.async {
                guard let shell = self?.shell, shell.isOffline == online else { return }
                shell.isOffline = !online
            }
        }
        pathMonitor.start(queue: DispatchQueue(label: "ryos.pathmonitor"))
    }

    // MARK: WKUIDelegate

    /// Popup windows (window.open): Apple Music's MusicKit JS authorize()
    /// runs its sign-in dance inside a popup it opens itself. WKWebView
    /// silently drops window.open when the UIDelegate doesn't implement this,
    /// which is why Apple Music sign-in dies without any error in the shell
    /// while the same flow works in Safari. We present the popup as a sheet
    /// sharing the main webview's data store — same shape as the Electron
    /// desktop's popup window, so the web client needs no changes: the popup
    /// completes its redirects on the app origin, MusicKit JS picks the token
    /// up from shared storage and closes itself (webViewDidClose dismisses).
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        let popup = AuthPopupPresenter.presentPopup(
            from: webView,
            configuration: configuration,
            coordinator: self
        )
        pushLog("Auth popup opened \(navigationAction.request.url?.absoluteString ?? "")")
        return popup
    }

    /// The web client asked for an isolated OAuth run (bridge `openAuthSheet`):
    /// Apple-recommended system sheet, ephemeral Safari session, resolves the
    /// bridge invoke with the final callback URL for the web client to finish
    /// its handshake. Generic: any service with a redirect-based web sign-in.
    private var authSession: ASWebAuthenticationSession?

    func runAuthSheet(id: String, args: [String: Any]?) {
        guard let raw = args? ["url"] as? String,
              let url = URL(string: raw), url.scheme == "https",
              let callbackPattern = (args? ["callback"] as? String).map(String.init),
              !callbackPattern.isEmpty else {
            reject(id, "openAuthSheet needs an https url and a non-empty callback")
            return
        }
        let session = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: nil,
            completionHandler: { [weak self] callbackURL, error in
                guard let self else { return }
                self.authSession = nil
                if let callbackURL {
                    pushLog("Auth sheet completed")
                    self.reply(id, ["url": callbackURL.absoluteString])
                } else {
                    let message = error?.localizedDescription ?? "cancelled"
                    pushLog("Auth sheet ended: \(message)")
                    self.reject(id, message)
                }
            }
        )
        session.prefersEphemeralWebBrowserSession = true
        session.presentationContextProvider = self
        authSession = session
        session.start()
    }

    /// Geolocation: the web client's navigator.geolocation asks route here.
    /// Answered from the app's Core Location permission; the first ask triggers
    /// the system when-in-use dialog (the native prompt, never a custom one).
    func webView(
        _ webView: WKWebView,
        requestGeolocationPermissionForOrigin origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        LocationPermissionController.shared.handleWebAsk(
            origin: origin.protocol + "://" + origin.host,
            decide: decisionHandler
        )
    }

    // MARK: WKNavigationDelegate

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        // First-ever launch with no cached copy and no network.
        shell?.reportBootFailed(error.localizedDescription)
    }

    // MARK: WKScriptMessageHandler

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "ryosBridge",
              let body = message.body as? [String: Any],
              let kind = body["kind"] as? String else { return }

        switch kind {
        case "invoke":
            guard let id = body["id"] as? String else { return }
            handleInvoke(id: id, name: body["name"] as? String ?? "", args: body["args"])
        case "boot-finished":
            shell?.reportBootFinished()
            ShellRouter.shared.markPageReady()
        case "app-active":
            ShellRouter.shared.firePendingRoom()
        default:
            break
        }
    }

    private func handleInvoke(id: String, name: String, args: Any?) {
        switch name {
        case "platform":
            reply(id, "ios")
        case "getVersion":
            reply(id, Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0")
        case "canShowNotifications":
            reply(id, true)
        case "shouldShowNativeNotification":
            reply(id, UIApplication.shared.applicationState != .active)
        case "isFullscreen":
            reply(id, true)
        case "showNotification":
            handleShowNotification(args as? [String: Any])
            reply(id, ["shown": true])
        case "configureChatNotifications":
            handleNotificationState((args as? [String: Any])?["state"])
            reply(id, ["managed": true, "ready": false])
        case "updateChatNotificationState":
            handleNotificationState((args as? [String: Any])?["state"])
            reply(id, true)
        case "stopChatNotifications":
            Task { @MainActor in
                self.shell?.notificationState.isAuthenticated = false
            }
            reply(id, true)
        case "toggleMaximize", "quitAndInstall", "checkForUpdates", "openFile", "saveFile":
            reply(id, NSNull())
        case "openAuthSheet":
            runAuthSheet(id: id, args: args as? [String: Any])
        case "playHaptic":
            if let pattern = (args as? [String: Any])?["pattern"] as? String {
                MediaHapticsController.shared.playHaptic(pattern)
            }
            reply(id, true)
        case "getLocationPermissionStatus":
            reply(id, LocationPermissionController.shared.webStatus)
        default:
            reply(id, NSNull())
        }
    }

    private func handleShowNotification(_ args: [String: Any]?) {
        guard let options = args?["options"] as? [String: Any],
              let title = options["title"] as? String else { return }
        let chatRoomId = options["chatRoomId"] as? String
        shell?.showNotification(ShellNotificationOptions(
            title: String(title.prefix(120)),
            body: (options["body"] as? String).map { String($0.prefix(240)) },
            chatRoomId: chatRoomId
        ))
    }

    private func handleNotificationState(_ raw: Any?) {
        guard let dict = raw as? [String: Any],
              let data = try? JSONSerialization.data(withJSONObject: dict, options: []),
              let state = try? JSONDecoder().decode(ShellNotificationState.self, from: data)
        else { return }
        Task { @MainActor in
            self.shell?.updateNotificationState(state)
            if state.isAuthenticated { self.requestNotificationPermissionIfNeeded() }
        }
    }

    private func requestNotificationPermissionIfNeeded() {
        guard !hasAskedForPermission else { return }
        hasAskedForPermission = true
        let center = UNUserNotificationCenter.current()
        pushLog("Requesting notification permission")
        center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            pushLog(
                "Notification permission granted=\(granted)"
                    + (error.map { " (\($0.localizedDescription))" } ?? "")
            )
            guard granted else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    // MARK: ASWebAuthenticationPresentationContextProviding

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        webView?.window ?? ASPresentationAnchor()
    }

    // MARK: Bridge replies

    private func reply(_ id: String, _ value: Any) {
        guard let json = bridgeJSON(["id": id, "ok": true, "value": value]) else { return }
        webView?.evaluateJavaScript("window.__ryosReply(\(json))", completionHandler: nil)
    }

    private func reject(_ id: String, _ message: String) {
        guard let json = bridgeJSON(["id": id, "ok": false, "value": message]) else { return }
        webView?.evaluateJavaScript("window.__ryosReply(\(json))", completionHandler: nil)
    }
}

/// Presents a web popup (window.open from the main page) as a sheet sharing
/// the main webview's data store, and tears it down on window.close().
/// macOS/Electron shells handle the same flow with a child window; iOS has
/// no default, so this is the shell's own.
@MainActor
enum AuthPopupPresenter {
    static func presentPopup(
        from webView: WKWebView,
        configuration: WKWebViewConfiguration,
        coordinator: Coordinator
    ) -> WKWebView? {
        guard let anchor = nearestViewController(of: webView) else { return nil }

        let popup = WKWebView(frame: .zero, configuration: configuration)
        popup.uiDelegate = coordinator
        popup.allowsBackForwardNavigationGestures = true

        let container = UIViewController()
        container.modalPresentationStyle = .pageSheet
        let bar = UIView()
        bar.translatesAutoresizingMaskIntoConstraints = false
        let close = UIButton(type: .system)
        close.setTitle("Close", for: .normal)
        close.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        close.setTitleColor(.systemBlue, for: .normal)
        close.accessibilityLabel = "Close"
        let done = { [weak container] in
            container?.dismiss(animated: true)
        }
        close.addAction(UIAction { _ in done() }, for: .touchUpInside)
        bar.addSubview(close)
        popup.translatesAutoresizingMaskIntoConstraints = false

        container.view.backgroundColor = .systemBackground
        container.view.addSubview(popup)
        container.view.addSubview(bar)
        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: container.view.safeAreaLayoutGuide.topAnchor),
            bar.leadingAnchor.constraint(equalTo: container.view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: container.view.trailingAnchor),
            bar.heightAnchor.constraint(equalToConstant: 44),
            close.trailingAnchor.constraint(equalTo: bar.layoutMarginsGuide.trailingAnchor, constant: -8),
            close.centerYAnchor.constraint(equalTo: bar.centerYAnchor),
            popup.topAnchor.constraint(equalTo: bar.bottomAnchor),
            popup.leadingAnchor.constraint(equalTo: container.view.leadingAnchor),
            popup.trailingAnchor.constraint(equalTo: container.view.trailingAnchor),
            popup.bottomAnchor.constraint(equalTo: container.view.bottomAnchor),
        ])
        anchor.present(container, animated: true)
        return popup
    }

    static func dismissPopup(containing webView: WKWebView) {
        var responder: UIResponder? = webView.next
        while let current = responder {
            if let vc = current as? UIViewController {
                vc.dismiss(animated: true)
                return
            }
            responder = current.next
        }
    }

    private static func nearestViewController(of view: UIView) -> UIViewController? {
        var responder: UIResponder? = view.next
        while let current = responder {
            if let vc = current as? UIViewController { return vc }
            responder = current.next
        }
        return nil
    }

    /// window.close() from the popup (MusicKit's authorize popup does exactly
    /// this after completing its handshake) — dismiss the hosting sheet.
    func webViewDidClose(_ webView: WKWebView) {
        AuthPopupPresenter.dismissPopup(containing: webView)
    }
}

/// Serializes a bridge payload to a safe JS object literal.
func bridgeJSON(_ object: [String: Any]) -> String? {
    guard let data = try? JSONSerialization.data(withJSONObject: object, options: []),
          let string = String(data: data, encoding: .utf8) else { return nil }
    return string
}
