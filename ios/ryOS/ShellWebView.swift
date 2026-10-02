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
        // MusicKit's authorize() opens Apple's sign-in page with window.open.
        // iOS WebKit's default only lets that through during a live tap and
        // otherwise returns null without ever asking createWebViewWith.
        config.preferences.javaScriptCanOpenWindowsAutomatically = true

        let webView = WKWebView(frame: .zero, configuration: config)
        #if DEBUG
        webView.isInspectable = true
        #endif
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
    /// opens Apple's sign-in page in a popup and waits on it, so a dropped
    /// popup is a sign-in that never settles. The shell's own page gets a
    /// sheet sharing the main webview's data store; Apple's page talks to
    /// MusicKit through window.opener and closes itself (webViewDidClose).
    /// Every outcome is logged under [auth] and reported to the web client
    /// (`onAuthPopupStatus`), which falls back to `openAuthSheet` when the
    /// sheet doesn't come up.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        let url = navigationAction.request.url?.absoluteString ?? ""
        let fromMainFrame = navigationAction.sourceFrame.isMainFrame
        authLog(
            "popup requested \(logURL(url)) mainFrame=\(fromMainFrame) "
                + "opener=\(webView === self.webView ? "shell" : "popup") app=\(appStateName())"
        )
        // Embedded pages (applets, Internet Explorer) still need a link tap:
        // automatic popups are for the shell's own page.
        if !fromMainFrame && navigationAction.navigationType != .linkActivated {
            authLog("popup refused: script window.open from an embedded frame")
            emitAuthPopupStatus("refused", reason: "embedded-frame", url: url)
            return nil
        }
        return AuthPopupPresenter.presentPopup(
            from: webView,
            configuration: configuration,
            url: url,
            coordinator: self
        )
    }

    func webViewDidClose(_ webView: WKWebView) {
        guard let controller = AuthPopupController.hosting(webView) else {
            authLog("window.close() from a page without a popup sheet; ignored")
            return
        }
        controller.close(reason: "window.close")
    }

    /// Tells the web client what happened to a popup sheet.
    func emitAuthPopupStatus(_ status: String, reason: String? = nil, url: String) {
        var payload: [String: Any] = ["status": status, "url": url]
        if let reason { payload["reason"] = reason }
        guard let json = bridgeJSON(payload) else { return }
        webView?.evaluateJavaScript(
            "window.__ryosEmitAuthPopupStatus && window.__ryosEmitAuthPopupStatus(\(json))",
            completionHandler: nil
        )
    }

    /// Bridge `openAuthSheet`: a redirect-based web sign-in in the system
    /// auth sheet (ephemeral ASWebAuthenticationSession). It finishes when
    /// the page navigates to `callback`, a custom scheme optionally followed
    /// by a prefix the final URL must start with; the invoke resolves with
    /// that URL, or rejects with "cancelled" or the error.
    private var authSession: ASWebAuthenticationSession?

    func runAuthSheet(id: String, args: [String: Any]?) {
        let reason = args?["reason"] as? String ?? ""
        guard let raw = args?["url"] as? String, let url = URL(string: raw), url.scheme == "https" else {
            authLog("auth sheet refused: needs an https url")
            reject(id, "openAuthSheet needs an https url")
            return
        }
        let callback = args?["callback"] as? String ?? ""
        guard let scheme = Self.callbackScheme(callback) else {
            authLog("auth sheet refused: callback \"\(callback)\" is not a custom scheme")
            reject(id, "openAuthSheet needs a custom-scheme callback such as ryos-auth://done")
            return
        }
        guard authSession == nil else {
            authLog("auth sheet refused: one is already open")
            reject(id, "an auth sheet is already open")
            return
        }
        let prefix = callback.contains(":") ? callback : scheme + ":"
        authLog(
            "auth sheet starting reason=\(reason.isEmpty ? "requested" : reason) "
                + "\(logURL(raw)) callback=\(prefix) app=\(appStateName())"
        )
        let session = ASWebAuthenticationSession(
            url: url,
            callback: .customScheme(scheme)
        ) { @Sendable [self] callbackURL, error in
            // May arrive off the main thread; only Sendable values cross over.
            let cancelled = (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin
            let message = error?.localizedDescription
            Task { @MainActor in
                self.finishAuthSheet(
                    id: id, callbackURL: callbackURL, prefix: prefix,
                    cancelled: cancelled, message: message
                )
            }
        }
        session.prefersEphemeralWebBrowserSession = true
        session.presentationContextProvider = self
        authSession = session
        guard session.start() else {
            authSession = nil
            authLog("auth sheet failed to start app=\(appStateName())")
            reject(id, "the auth sheet could not start")
            return
        }
    }

    private func finishAuthSheet(
        id: String, callbackURL: URL?, prefix: String, cancelled: Bool, message: String?
    ) {
        authSession = nil
        guard let callbackURL else {
            let outcome = cancelled ? "cancelled" : (message ?? "auth sheet failed")
            authLog("auth sheet ended: \(outcome)")
            reject(id, outcome)
            return
        }
        guard callbackURL.absoluteString.hasPrefix(prefix) else {
            authLog("auth sheet ended on an unexpected callback \(callbackURL.scheme ?? "?"):")
            reject(id, "unexpected auth sheet callback")
            return
        }
        authLog("auth sheet completed callback=\(prefix)")
        reply(id, ["url": callbackURL.absoluteString])
    }

    /// https callbacks need associated domains, which the app doesn't have.
    private static func callbackScheme(_ callback: String) -> String? {
        let scheme = URL(string: callback)?.scheme ?? callback
        let isCustom = scheme.range(of: "^[A-Za-z][A-Za-z0-9+.-]*$", options: .regularExpression) != nil
            && !["http", "https"].contains(scheme.lowercased())
        return isCustom ? scheme : nil
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

    /// Resources fully loaded but the web client never reports boot-finished
    /// — that is the watchdog's only strike condition (see ShellViewModel:
    /// boot-slow never counts, boot-broken does).
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        shell?.bootResourcesArrived()
    }

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
        if let window = webView?.window ?? foregroundWindow() { return window }
        authLog("auth sheet has no window to anchor to")
        return ASPresentationAnchor()
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

/// Presents a web popup (window.open) as a sheet sharing the main webview's
/// data store. macOS/Electron shells handle the same flow with a child
/// window; iOS has no default, so this is the shell's own. Presents from
/// whatever is frontmost, so an open sheet — or one still animating away
/// after a resume from background — doesn't swallow the popup.
@MainActor
enum AuthPopupPresenter {
    static func presentPopup(
        from webView: WKWebView,
        configuration: WKWebViewConfiguration,
        url: String,
        coordinator: Coordinator
    ) -> WKWebView? {
        let controller = AuthPopupController(configuration: configuration, url: url, coordinator: coordinator)
        controller.loadViewIfNeeded()
        guard present(controller, from: webView, retries: 2) else { return nil }
        // UIKit drops a refused present() without calling its completion.
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(3))
            if !controller.isPresentedSheet && !controller.isFinished {
                controller.fail("sheet did not present within 3s")
            }
        }
        return controller.popup
    }

    private static func present(
        _ controller: AuthPopupController, from webView: WKWebView, retries: Int
    ) -> Bool {
        guard let presenter = frontmostViewController(for: webView) else {
            controller.fail("no view controller to present from (window=\(webView.window != nil))")
            return false
        }
        authLog("popup presenting from \(type(of: presenter)) app=\(appStateName())")
        presenter.present(controller, animated: true) { controller.didPresent() }
        guard controller.presentingViewController == nil else { return true }
        guard retries > 0 else {
            controller.fail("present refused by \(type(of: presenter))")
            return true
        }
        authLog("popup present refused by \(type(of: presenter)); retrying")
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(500))
            guard !controller.isFinished else { return }
            _ = Self.present(controller, from: webView, retries: retries - 1)
        }
        return true
    }

    private static func frontmostViewController(for webView: WKWebView) -> UIViewController? {
        var top = (webView.window ?? foregroundWindow())?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}

/// One popup sheet. Every way it ends — Close, swipe-down, window.close(),
/// or never presenting — goes through `finish`, which logs the outcome and
/// reports it to the web client.
final class AuthPopupController: UIViewController {
    let popup: WKWebView
    let url: String
    private weak var coordinator: Coordinator?
    private var closeReason = "swipe"
    private(set) var isPresentedSheet = false
    private(set) var isFinished = false

    init(configuration: WKWebViewConfiguration, url: String, coordinator: Coordinator) {
        popup = WKWebView(frame: .zero, configuration: configuration)
        self.url = url
        self.coordinator = coordinator
        super.init(nibName: nil, bundle: nil)
        popup.uiDelegate = coordinator
        popup.allowsBackForwardNavigationGestures = true
        modalPresentationStyle = .pageSheet
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not supported")
    }

    override func loadView() {
        let root = UIView()
        root.backgroundColor = .systemBackground
        let bar = UIView()
        let close = UIButton(type: .system)
        close.setTitle("Close", for: .normal)
        close.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        close.setTitleColor(.systemBlue, for: .normal)
        close.accessibilityLabel = "Close"
        close.addAction(UIAction { [weak self] _ in self?.close(reason: "close-button") }, for: .touchUpInside)
        for subview in [bar, close, popup] {
            subview.translatesAutoresizingMaskIntoConstraints = false
        }
        bar.addSubview(close)
        root.addSubview(popup)
        root.addSubview(bar)
        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: root.safeAreaLayoutGuide.topAnchor),
            bar.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            bar.heightAnchor.constraint(equalToConstant: 44),
            close.trailingAnchor.constraint(equalTo: bar.layoutMarginsGuide.trailingAnchor, constant: -8),
            close.centerYAnchor.constraint(equalTo: bar.centerYAnchor),
            popup.topAnchor.constraint(equalTo: bar.bottomAnchor),
            popup.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            popup.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            popup.bottomAnchor.constraint(equalTo: root.bottomAnchor),
        ])
        view = root
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed { finish("closed", reason: closeReason) }
    }

    func didPresent() {
        isPresentedSheet = true
        authLog("popup presented \(logURL(url))")
        coordinator?.emitAuthPopupStatus("presented", url: url)
    }

    func close(reason: String) {
        closeReason = reason
        if presentingViewController != nil {
            dismiss(animated: true)
        } else {
            finish("closed", reason: reason)
        }
    }

    func fail(_ reason: String) {
        authLog("popup failed: \(reason) \(logURL(url)) app=\(appStateName())")
        finish("failed", reason: reason)
    }

    private func finish(_ status: String, reason: String) {
        guard !isFinished else { return }
        isFinished = true
        if status == "closed" { authLog("popup closed (\(reason)) \(logURL(url))") }
        popup.stopLoading()
        coordinator?.emitAuthPopupStatus(status, reason: reason, url: url)
    }

    static func hosting(_ webView: WKWebView) -> AuthPopupController? {
        var responder: UIResponder? = webView
        while let current = responder {
            if let controller = current as? AuthPopupController { return controller }
            responder = current.next
        }
        return nil
    }
}

/// Shell-side decision trail for popups and the auth sheet; filter the
/// device console on "[auth]".
func authLog(_ message: String) {
    NSLog("ryOS: [auth] %@", message)
}

/// Host and path only: sign-in URLs carry tokens in their query and fragment.
func logURL(_ raw: String) -> String {
    guard let url = URL(string: raw), let host = url.host else { return raw.isEmpty ? "(blank)" : "(opaque)" }
    return host + url.path
}

@MainActor
func appStateName() -> String {
    switch UIApplication.shared.applicationState {
    case .active: "active"
    case .inactive: "inactive"
    case .background: "background"
    @unknown default: "unknown"
    }
}

@MainActor
func foregroundWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    return scene?.keyWindow ?? scene?.windows.first
}

/// Serializes a bridge payload to a safe JS object literal.
func bridgeJSON(_ object: [String: Any]) -> String? {
    guard let data = try? JSONSerialization.data(withJSONObject: object, options: []),
          let string = String(data: data, encoding: .utf8) else { return nil }
    return string
}
