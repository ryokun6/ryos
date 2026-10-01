import SwiftUI
import WebKit
import Network

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

final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
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
        center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
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

/// Serializes a bridge payload to a safe JS object literal.
func bridgeJSON(_ object: [String: Any]) -> String? {
    guard let data = try? JSONSerialization.data(withJSONObject: object, options: []),
          let string = String(data: data, encoding: .utf8) else { return nil }
    return string
}
