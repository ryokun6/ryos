import SwiftUI
import WebKit
import ObjectiveC
import Network
import AuthenticationServices
import PhotosUI
import ImageIO
import UniformTypeIdentifiers

/// WKWebView shell around https://os.ryo.lu. The web client detects the
/// injected `window.ryosDesktop` bridge (the same contract the Electron
/// desktop shell installs) and hands the shell its notification state.
struct ShellWebView: UIViewControllerRepresentable {
    let shell: ShellViewModel
    /// Top inset reported to the page in Duo poses: the measured system
    /// reserved band (~20pt, closed pose — taps below it, dead inside it).
    /// Zero on regular iPhone, where the natural status-bar inset already
    /// covers the same role. Read-only signal for the page's env(); the web
    /// owns all layout and hit targets in the band (one-owner redivision).
    var virtualTopInset: CGFloat = 0
    /// Vertical extent of the system-drawn status cluster inside a vertical
    /// bar (Duo closed pose: 150pt), reported to the page through the bridge
    /// as `window.ryosDesktop.sideStatusBarExtent` — one contract, 0 where a
    /// vertical bar doesn't exist. The web's side dock derives its top
    /// offset (extent + 12pt clearance) and max height from it.
    var sideStatusBarExtent: CGFloat = 0
    /// Whether the measured cluster includes the camera dot (closed pose:
    /// true; open pose and regular iPhones: false). Companion to
    /// `sideStatusBarExtent`, reported through the same bridge contract.
    var sideStatusBarHasCamera: Bool = false

    func makeCoordinator() -> Coordinator {
        Coordinator(shell: shell)
    }

    func makeUIViewController(context: Context) -> UIViewController {
        let config = WKWebViewConfiguration()
        let userContent = config.userContentController
        // Scripts are installed at the first real safe-area measurement, so
        // the document-start seed is the dock offset, not a zero that the
        // page would paint before the correction arrived.
        userContent.add(context.coordinator, name: "ryosBridge")
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        // MusicKit's authorize() opens Apple's sign-in page with window.open.
        // iOS WebKit's default only lets that through during a live tap and
        // otherwise returns null without ever asking createWebViewWith.
        config.preferences.javaScriptCanOpenWindowsAutomatically = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.scrollView.isScrollEnabled = false
        // Full-bleed visuals with a reported inset: .never keeps the scroll
        // view from consuming safe areas into contentInset (which would
        // shift the page); env(safe-area-inset-*) still sees the insets.
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        let holder = ShellWebHolderController()
        holder.edgesForExtendedLayout = .all
        holder.extendedLayoutIncludesOpaqueBars = true
        holder.onLayout = { [weak holder] in
            guard let root = holder?.view.window?.rootViewController else { return }
            StatusBarStyleController.shared.installIfNeeded(on: root)
        }
        holder.view.backgroundColor = .black
        webView.frame = holder.view.bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        holder.view.addSubview(webView)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.02, green: 0.03, blue: 0.08, alpha: 1)
        context.coordinator.attach(webView)
        ShellRouter.shared.attach(webView)
        holder.onMeasuredGeometry = { [weak coordinator = context.coordinator] extent, camera in
            coordinator?.applyMeasuredSideStatus(extent, hasCamera: camera)
        }
        return holder
    }

    func updateUIViewController(_ holder: UIViewController, context: Context) {
        // Reaches the page only as env(safe-area-inset-top). The holder may
        // raise it to the bottom of the iPad window controls.
        if let holder = holder as? ShellWebHolderController {
            holder.minimumTopInset = virtualTopInset
        }
        // The side-dock offset is measured from the holder's own safe area.
        // This view's GeometryReader ignores that area so the wallpaper can
        // reach the edge, and the insets it reports are 0 — pushing them
        // would pull the dock up through the camera.
    }
}

/// Plain holder whose layout changes (rotation, iPad window resize, split
/// view) re-measure the window controls. A stock UIViewController has no hook
/// the representable can see.
final class ShellWebHolderController: UIViewController {
    var onLayout: (() -> Void)?
    /// Side-dock extent and camera flag, from this view's own safe area.
    var onMeasuredGeometry: ((CGFloat, Bool) -> Void)?
    /// Geometry inset (the Duo band, or an iPad status bar the system did not
    /// report). The window controls can only raise it.
    var minimumTopInset: CGFloat = 0 {
        didSet { if oldValue != minimumTopInset { applyTopInset() } }
    }
    private var lastSize: CGSize = .zero
    /// The system has delivered safe-area insets for the window. A layout
    /// before that reports a zero side inset and would bake the wrong dock.
    private var safeAreaReady = false
    private var appeared = false
    /// Bottom of the window controls in the view, latched from a measurement
    /// taken before our own inset was added, so it cannot feed back.
    private var latchedControlBottom: CGFloat = 0
    private var applying = false
    /// ignoresSafeArea clears the strip a frame after it is measured.
    /// Remember it for this display so that 0 does not pull the dock up.
    private var latchedStrip: CGFloat = 0
    private var latchedShortSide: CGFloat = 0

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        applyTopInset()
        onLayout?()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        if view.window != nil { safeAreaReady = true }
        if !applying { applyTopInset() }
        onLayout?()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        appeared = true
        safeAreaReady = true
        applyTopInset()
    }

    /// One top inset for everything. The page already starts the menubar at
    /// env(safe-area-inset-top), so the controls are not a separate layout:
    /// their bottom becomes that inset, the same way the status bar does.
    private func applyTopInset() {
        guard !applying, view.bounds.width > 0 else { return }
        let already = additionalSafeAreaInsets.top
        let systemTop = max(0, view.safeAreaInsets.top - already)
        // The SwiftUI read of the status-bar height can be 0 on the first
        // pass. Read it again here, on every layout, and only when the system
        // itself reported no top inset (iPad full screen). A reported inset
        // (iPhone) is left alone so it is not added twice.
        let side = resolvedSideInset()
        let systemBottom = max(0, view.safeAreaInsets.bottom - additionalSafeAreaInsets.bottom)
        let measuredTop = ShellView.virtualTopInset(
            insets: EdgeInsets(
                top: systemTop,
                leading: view.safeAreaInsets.left,
                bottom: systemBottom,
                trailing: view.safeAreaInsets.right
            ),
            statusBarHeight: ShellView.currentStatusBarHeight()
        )
        // SwiftUI's reader is full-bleed and reports no insets, so its
        // requested top can be 0 on the cover. The view's own insets are
        // the ones the page will see.
        let floor = max(minimumTopInset, measuredTop)
        publishSideStatus(side: side)
        if view.bounds.size != lastSize {
            lastSize = view.bounds.size
            latchedControlBottom = 0
            if abs(already - floor) > 0.5 {
                applying = true
                additionalSafeAreaInsets.top = floor
                applying = false
                return
            }
        }
        let guideTop = view.layoutGuide(for: .safeArea(cornerAdaptation: .horizontal)).layoutFrame.minY
        let extra = guideTop - view.safeAreaInsets.top
        // Only trust the guide while our inset is the bare minimum. Once we
        // have raised it, a guide that includes our own inset would grow.
        if extra > 0.5, abs(already - floor) < 0.5 {
            latchedControlBottom = systemTop + floor + extra
        }
        let clearance = max(systemTop + floor, latchedControlBottom)
        let needed = max(floor, clearance - systemTop)
        guard abs(needed - already) > 0.5 else { return }
        applying = true
        additionalSafeAreaInsets.top = needed
        applying = false
    }

    /// The holder sits in a reader that ignores the safe area, so its own
    /// insets stay 0 while the webview and the window still have the Duo
    /// strip. The page lays the side dock out from those, so a 0 here
    /// pulls the dock up to the top of the strip.
    private func resolvedSideInset() -> CGFloat {
        func side(_ insets: UIEdgeInsets) -> CGFloat {
            max(insets.left, insets.right)
        }
        var best = side(view.safeAreaInsets)
        if let window = view.window {
            best = max(best, side(window.safeAreaInsets))
        }
        for subview in view.subviews {
            best = max(best, side(subview.safeAreaInsets))
        }
        return best
    }

    /// Dock offset for the status strip. A zero side inset before the
    /// system has installed the strip is ignored until the view appears,
    /// so an iPad (no side strip) still loads and the cover does not bake
    /// a dock that starts on top of the camera.
    /// The cluster belongs to the display. The holder's bounds can be the
    /// safe-area rect; use the screen, whose shorter side stays 466 on the
    /// cover and 669 on the inner display either way it is held.
    private func publishSideStatus(side: CGFloat) {
        guard safeAreaReady, view.bounds.width > 0 else { return }
        if side < 1, !appeared { return }
        let display = view.window?.windowScene?.screen.bounds.size ?? view.bounds.size
        let shortSide = min(display.width, display.height)
        var strip = side
        if strip >= ShellView.sideBarMinimumInset {
            latchedStrip = strip
            latchedShortSide = shortSide
        } else if latchedStrip >= ShellView.sideBarMinimumInset,
                  abs(shortSide - latchedShortSide) < 40 {
            strip = latchedStrip
        } else {
            latchedStrip = 0
            latchedShortSide = 0
        }
        let truth = ShellView.sideStatusBarTruth(
            isVerticalBar: strip >= ShellView.sideBarMinimumInset,
            viewSize: display
        )
        onMeasuredGeometry?(truth.extent, truth.hasCamera)
    }
}

final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, ASWebAuthenticationPresentationContextProviding {
    private weak var shell: ShellViewModel?
    private weak var webView: WKWebView?
    private let pathMonitor = NWPathMonitor()
    private var hasAskedForPermission = false
    /// Latest geometry-reported side status-bar truth; (re)pushed to the
    /// page whenever it changes and once after boot-finished, because early
    /// evaluations land before the page's bridge exists.
    private var sideStatusBarExtent: CGFloat = 0
    private var sideStatusBarHasCamera = false
    /// Held until the page's file picker finishes. WebKit waits on the
    /// completion handler, so dropping this early cancels the pick.
    private var fileOpenPanel: FileOpenPanel?

    init(shell: ShellViewModel) {
        self.shell = shell
        super.init()
    }

    private var didStartLoad = false

    /// First measurement installs the document-start seed and loads. Later
    /// ones (a fold, a rotation) push the same contract to the live page.
    func applyMeasuredSideStatus(_ extent: CGFloat, hasCamera: Bool) {
        let changed = extent != sideStatusBarExtent || hasCamera != sideStatusBarHasCamera
        sideStatusBarExtent = extent
        sideStatusBarHasCamera = hasCamera
        if !didStartLoad {
            didStartLoad = true
            installPreludeAndLoad()
            return
        }
        guard changed else { return }
        pushSideStatusBarExtent()
    }

    private func installPreludeAndLoad() {
        guard let webView else { return }
        let content = webView.configuration.userContentController
        content.removeAllUserScripts()
        let prelude = "window.__ryosInitialSideStatusBar="
            + "{extent:\(Double(sideStatusBarExtent)),hasCamera:\(sideStatusBarHasCamera)};"
        content.addUserScript(
            WKUserScript(source: prelude, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        content.addUserScript(
            WKUserScript(
                source: DesktopBridge.injectedJavaScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        webView.load(URLRequest(url: ShellViewModel.origin))
    }

    private func pushSideStatusBarExtent() {
        guard let webView else { return }
        let value = Double(sideStatusBarExtent)
        let camera = sideStatusBarHasCamera
        webView.evaluateJavaScript(
            "window.__ryosSetSideStatusBarExtent && window.__ryosSetSideStatusBarExtent(\(value),\(camera))",
            completionHandler: nil
        )
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

    /// `<input type="file">`. The page hides every upload control, and some
    /// are not even in the document, so WebKit's own panel has no view to
    /// anchor its popover to and UIKit aborts the app. Present from the web
    /// view instead. The completion handler has to run exactly once.
    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor ([URL]?) -> Void
    ) {
        fileOpenPanel?.cancel()
        let panel = FileOpenPanel()
        fileOpenPanel = panel
        panel.present(from: webView, parameters: parameters) { [weak self] urls in
            Task { @MainActor in
                completionHandler(urls)
                if self?.fileOpenPanel === panel {
                    self?.fileOpenPanel = nil
                }
            }
        }
    }

    // MARK: WKNavigationDelegate

    /// Resources fully loaded but the web client never reports boot-finished
    /// — that is the watchdog's only strike condition (see ShellViewModel:
    /// boot-slow never counts, boot-broken does).
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        shell?.bootResourcesArrived()
        pushSideStatusBarExtent()
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
        // Subframes (Internet Explorer pages, applets) and popups share this
        // content controller; only the shell's own top-level page may drive
        // the native bridge.
        guard message.name == "ryosBridge",
              message.frameInfo.isMainFrame,
              Self.isShellOrigin(message.frameInfo.securityOrigin),
              let body = message.body as? [String: Any],
              let kind = body["kind"] as? String else { return }

        switch kind {
        case "invoke":
            guard let id = body["id"] as? String else { return }
            handleInvoke(id: id, name: body["name"] as? String ?? "", args: body["args"])
        case "boot-finished":
            shell?.reportBootFinished()
            ShellRouter.shared.markPageReady()
            pushSideStatusBarExtent()
        case "app-active":
            ShellRouter.shared.firePendingRoom()
        default:
            break
        }
    }

    static func isShellOrigin(_ origin: WKSecurityOrigin) -> Bool {
        let expected = ShellViewModel.origin
        guard origin.protocol == expected.scheme,
              origin.host.caseInsensitiveCompare(expected.host ?? "") == .orderedSame
        else { return false }
        let defaultPort = expected.scheme == "https" ? 443 : 80
        let expectedPort = expected.port ?? defaultPort
        return origin.port == 0 || origin.port == expectedPort
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
        case "toggleMaximize", "quitAndInstall", "checkForUpdates":
            reply(id, NSNull())
        // The page treats a missing dialog as "use the file input instead".
        // Null is not that result: the page reads `.canceled` and throws,
        // so the input never opens. A cancel lets it fall through.
        case "openFile", "saveFile":
            reply(id, ["canceled": true])
        case "openAuthSheet":
            runAuthSheet(id: id, args: args as? [String: Any])
        case "playHaptic":
            if let pattern = (args as? [String: Any])?["pattern"] as? String {
                MediaHapticsController.shared.playHaptic(pattern)
            }
            reply(id, true)
        case "setStatusBarTone":
            let tone = (args as? [String: Any])?["tone"] as? String
            StatusBarStyleController.shared.setDarkText(tone == "dark")
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


/// Status-bar glyph colour. The page decides it from the wallpaper and the
/// shell applies it; the system appearance is not the surface under the
/// glyphs. Starts light (white glyphs) over the black boot screen. Changes
/// the style only, never the bar's visibility.
@MainActor
final class StatusBarStyleController {
    static let shared = StatusBarStyleController()
    private(set) var style: UIStatusBarStyle = .lightContent
    private var installed = false

    func setDarkText(_ dark: Bool) {
        let next: UIStatusBarStyle = dark ? .darkContent : .lightContent
        guard next != style else { return }
        style = next
        refresh()
    }

    /// SwiftUI's hosting controller owns the status bar and does not defer to
    /// children, so the root's class gains the two overrides below. Done once.
    func installIfNeeded(on root: UIViewController) {
        guard !installed else { return }
        let name = "ryOSStatusBarHost"
        if let existing = NSClassFromString(name) {
            object_setClass(root, existing)
        } else if let sub = objc_allocateClassPair(type(of: root), name, 0) {
            for sel in [
                #selector(getter: UIViewController.preferredStatusBarStyle),
                #selector(getter: UIViewController.childForStatusBarStyle),
            ] {
                guard let method = class_getInstanceMethod(StatusBarStyleHost.self, sel) else { continue }
                class_addMethod(sub, sel, method_getImplementation(method), method_getTypeEncoding(method))
            }
            objc_registerClassPair(sub)
            object_setClass(root, sub)
        }
        installed = true
        refresh()
    }

    private func refresh() {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        for scene in scenes {
            for window in scene.windows {
                window.rootViewController?.setNeedsStatusBarAppearanceUpdate()
            }
        }
    }
}

/// Source of the two methods copied onto the root controller's subclass.
final class StatusBarStyleHost: UIViewController {
    @objc override var preferredStatusBarStyle: UIStatusBarStyle {
        StatusBarStyleController.shared.style
    }

    @objc override var childForStatusBarStyle: UIViewController? { nil }
}


/// The page's file picker. WebKit would anchor a popover to the file input,
/// and those inputs have no box, so UIKit aborts. Every sheet here is anchored
/// to the web view, which always has one. `finish` runs the page's completion
/// exactly once.
final class FileOpenPanel: NSObject, UIDocumentPickerDelegate, PHPickerViewControllerDelegate, UIImagePickerControllerDelegate, UINavigationControllerDelegate, UIAdaptivePresentationControllerDelegate {
    private var completion: (([URL]?) -> Void)?
    private var finished = false
    /// The action sheet is going away because the next picker is coming up,
    /// not because the user cancelled.
    private var handedOff = false
    private weak var presented: UIViewController?

    func present(
        from webView: WKWebView,
        parameters: WKOpenPanelParameters,
        completion: @escaping ([URL]?) -> Void
    ) {
        self.completion = completion
        guard let presenter = Self.frontmost(for: webView) else {
            finish(nil)
            return
        }

        let sheet = UIAlertController(title: nil, message: nil, preferredStyle: .actionSheet)
        sheet.addAction(UIAlertAction(title: String(localized: "Photo Library"), style: .default) { [weak self] _ in
            self?.presentPhotoLibrary(from: webView, multiple: parameters.allowsMultipleSelection)
        })
        if UIImagePickerController.isSourceTypeAvailable(.camera) {
            sheet.addAction(UIAlertAction(title: String(localized: "Take Photo or Video"), style: .default) { [weak self] _ in
                self?.presentCamera(from: webView)
            })
        }
        sheet.addAction(UIAlertAction(title: String(localized: "Choose File"), style: .default) { [weak self] _ in
            self?.presentDocuments(from: webView, parameters: parameters)
        })
        sheet.addAction(UIAlertAction(title: String(localized: "Cancel"), style: .cancel) { [weak self] _ in
            self?.finish(nil)
        })
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = webView
            popover.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.midY, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        sheet.presentationController?.delegate = self
        presented = sheet
        presenter.present(sheet, animated: true)
    }

    func cancel() {
        presented?.dismiss(animated: false)
        finish(nil)
    }

    private func presentPhotoLibrary(from webView: WKWebView, multiple: Bool) {
        var config = PHPickerConfiguration(photoLibrary: .shared())
        config.selectionLimit = multiple ? 0 : 1
        config.filter = .any(of: [.images, .videos])
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = self
        picker.presentationController?.delegate = self
        handOff(picker, from: webView)
    }

    private func presentCamera(from webView: WKWebView) {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.mediaTypes = [UTType.image.identifier, UTType.movie.identifier]
        picker.delegate = self
        picker.presentationController?.delegate = self
        handOff(picker, from: webView)
    }

    private func presentDocuments(from webView: WKWebView, parameters: WKOpenPanelParameters) {
        var types: [UTType] = [.item]
        if parameters.allowsDirectories {
            types.insert(.folder, at: 0)
        }
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true)
        picker.allowsMultipleSelection = parameters.allowsMultipleSelection
        picker.delegate = self
        picker.modalPresentationStyle = .formSheet
        picker.presentationController?.delegate = self
        handOff(picker, from: webView)
    }

    /// The action sheet is already dismissing itself. Presenting on top of
    /// that fails, so the next picker waits until the sheet is gone.
    private func handOff(_ controller: UIViewController, from webView: WKWebView) {
        handedOff = true
        let show = { [weak self] in
            guard let self else { return }
            self.handedOff = false
            self.present(controller, from: webView)
        }
        if let presented, presented.presentingViewController != nil {
            presented.dismiss(animated: true, completion: show)
        } else {
            show()
        }
    }

    private func present(_ controller: UIViewController, from webView: WKWebView) {
        guard let presenter = Self.frontmost(for: webView) else {
            finish(nil)
            return
        }
        presented = controller
        presenter.present(controller, animated: true)
    }

    private static func frontmost(for webView: WKWebView) -> UIViewController? {
        var responder: UIResponder? = webView
        var found: UIViewController?
        while let next = responder?.next {
            if let controller = next as? UIViewController {
                found = controller
                break
            }
            responder = next
        }
        if found == nil {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
            found = (scene?.keyWindow ?? scene?.windows.first)?.rootViewController
        }
        while let presented = found?.presentedViewController, !presented.isBeingDismissed {
            found = presented
        }
        return found
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        // The action sheet also dismisses on the way to the next picker.
        if handedOff { return }
        guard presentationController.presentedViewController === presented else { return }
        finish(nil)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        let copies = urls.compactMap { Self.copyImport($0, suggestedName: $0.lastPathComponent) }
        controller.dismiss(animated: true)
        finish(copies.isEmpty ? nil : copies)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finish(nil)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard !results.isEmpty else {
            finish(nil)
            return
        }
        let bucket = ImportBucket()
        let group = DispatchGroup()
        for result in results {
            let provider = result.itemProvider
            let type = Self.importTypeIdentifier(for: provider)
            let suggested = provider.suggestedName
            group.enter()
            provider.loadFileRepresentation(forTypeIdentifier: type) { url, _ in
                if let url, let copy = FileOpenPanel.copyImport(url, suggestedName: suggested) {
                    bucket.add(copy)
                }
                group.leave()
            }
        }
        group.notify(queue: .main) { [weak self] in
            let urls = bucket.take()
            self?.finish(urls.isEmpty ? nil : urls)
        }
    }

    func imagePickerController(
        _ picker: UIImagePickerController,
        didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
        picker.dismiss(animated: true)
        if let media = info[.mediaURL] as? URL, let copy = Self.copyImport(media, suggestedName: media.lastPathComponent) {
            finish([copy])
            return
        }
        if let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 0.9) {
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("photo-\(UUID().uuidString).jpg")
            if (try? data.write(to: url)) != nil {
                finish([url])
                return
            }
        }
        finish(nil)
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true)
        finish(nil)
    }

    private func finish(_ urls: [URL]?) {
        guard !finished else { return }
        finished = true
        let handler = completion
        completion = nil
        handler?(urls)
    }

    /// A library photo lists a Live Photo package ahead of the still, and
    /// that package is not an image file. Take a type the page can decode.
    nonisolated static func importTypeIdentifier(for provider: NSItemProvider) -> String {
        let identifiers = provider.registeredTypeIdentifiers
        let preferred: [UTType] = [
            .jpeg, .png, .gif, .webP, .heic, .heif, .image,
            .movie, .mpeg4Movie, .quickTimeMovie, .video,
        ]
        for want in preferred {
            if let match = identifiers.first(where: { UTType($0)?.conforms(to: want) == true }) {
                return match
            }
        }
        return identifiers.first ?? UTType.data.identifier
    }

    /// The provider's URL is deleted when its callback returns, and a
    /// security-scoped document URL dies with the picker. Copy first.
    /// A photo-library HEIF becomes JPEG here. Safari's own file input does
    /// that before the page sees the photo; the page cannot decode HEIF.
    nonisolated static func copyImport(_ url: URL, suggestedName: String?) -> URL? {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        var name = suggestedName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        name = name.replacingOccurrences(of: "/", with: "-")
        if name.isEmpty { name = "file" }
        let ext = url.pathExtension
        if !ext.isEmpty, (name as NSString).pathExtension.isEmpty {
            name += "." + ext
        }
        let dest = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(UUID().uuidString)-\(name)")
        do {
            try FileManager.default.copyItem(at: url, to: dest)
        } catch {
            return nil
        }
        guard isHEIF(dest) else { return dest }
        guard let jpeg = transcodeHEIFToJPEG(dest) else { return dest }
        try? FileManager.default.removeItem(at: dest)
        return jpeg
    }

    private nonisolated static func isHEIF(_ url: URL) -> Bool {
        if let type = UTType(filenameExtension: url.pathExtension) {
            if type.conforms(to: .heic) || type.conforms(to: .heif) { return true }
            if type.conforms(to: .jpeg) || type.conforms(to: .png) || type.conforms(to: .gif)
                || type.conforms(to: .webP) || type.conforms(to: .movie) || type.conforms(to: .video)
                || type.conforms(to: .pdf) || type.conforms(to: .text) {
                return false
            }
        }
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let typeID = CGImageSourceGetType(source) else { return false }
        let type = UTType(typeID as String)
        return type?.conforms(to: .heic) == true || type?.conforms(to: .heif) == true
    }

    /// One still frame. Quality matches the camera path's JPEG.
    private nonisolated static func transcodeHEIFToJPEG(_ url: URL) -> URL? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let dest = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(UUID().uuidString).jpg")
        guard let destination = CGImageDestinationCreateWithURL(
            dest as CFURL,
            UTType.jpeg.identifier as CFString,
            1,
            nil
        ) else { return nil }
        let options = [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary
        CGImageDestinationAddImageFromSource(destination, source, 0, options)
        guard CGImageDestinationFinalize(destination) else {
            try? FileManager.default.removeItem(at: dest)
            return nil
        }
        return dest
    }
}

/// Photos load off the main thread. The bucket is the only thing that crosses.
private final class ImportBucket: @unchecked Sendable {
    private let lock = NSLock()
    private var urls: [URL] = []
    func add(_ url: URL) {
        lock.lock()
        urls.append(url)
        lock.unlock()
    }
    func take() -> [URL] {
        lock.lock()
        defer { lock.unlock() }
        return urls
    }
}
