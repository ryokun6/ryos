import Foundation
import UIKit
import UserNotifications

extension Notification.Name {
    static let ryOSAPNsTokenArrived = Notification.Name("ryOSAPNsTokenArrived")
}
import UIKit
import UserNotifications

/// Notification state fed to the shell by the web client through the
/// desktop bridge (mirrors the desktop-shell contract's shapes).
struct ShellNotificationState: Codable {
    var username: String?
    var isAuthenticated: Bool
    var chatsOpen: Bool
    var currentRoomId: String?
    var rooms: [ShellRoom]?
}

struct ShellRoom: Codable {
    var id: String
    var type: String?
}

struct ShellNotificationOptions {
    var title: String
    var body: String?
    var chatRoomId: String?
}

@MainActor
final class ShellViewModel: ObservableObject {
    static let origin = URL(string: "https://os.ryo.lu")!

    enum BootPhase: Equatable {
        case downloading   // first-ever launch: fetching the web client
        case loading       // cache path: booting from the saved copy
    }

    @Published var bootPhase: BootPhase
    @Published var isOffline = false
    // Splash only when the app has nothing to show yet (Ryo + Colo's rule):
    // first-ever launch or a cold boot with no cached copy. Cached starts go
    // straight to the webview — the web client paints its own boot anyway.
    // Both are set in init from the ever-booted flag.
    @Published var splashVisible: Bool

    // Freshest state the web client reported through the bridge.
    var notificationState = ShellNotificationState(
        username: nil, isAuthenticated: false, chatsOpen: false,
        currentRoomId: nil, rooms: nil
    )

    var signedInUsername: String? {
        notificationState.isAuthenticated ? notificationState.username : nil
    }

    private var hasAskedForNotificationPermission = false

    init() {
        // First-ever launch (or wiped cache): splash up until boot-finished.
        // Every cached start: no splash, webview renders immediately.
        let everBooted = UserDefaults.standard.bool(forKey: "ryos.everBooted")
        _bootPhase = Published(initialValue: everBooted ? .loading : .downloading)
        _splashVisible = Published(initialValue: !everBooted)
        NotificationCenter.default.addObserver(
            forName: .ryOSAPNsTokenArrived, object: nil, queue: .main
        ) { [weak self] notification in
            guard let token = notification.userInfo?["token"] as? String else { return }
            Task { @MainActor [weak self] in
                self?.handleAPNsToken(token)
            }
        }
    }

    /// The web client told us its state changed; remember it and register
    /// the device with the relay once we have an APNs token.
    func updateNotificationState(_ state: ShellNotificationState) {
        let wasSignedIn = notificationState.isAuthenticated
        notificationState = state
        registerWithRelay()
        if state.isAuthenticated && !wasSignedIn {
            // First signed-in foreground moment: ask for notification
            // permission (design spec §5 — never at first launch).
            requestNotificationPermissionOnce()
        }
    }

    func handleAPNsToken(_ token: String) {
        RelayClient.shared.update(apnsToken: token)
        registerWithRelay()
    }

    func showNotification(_ options: ShellNotificationOptions) {
        NotificationPresenter.shared.show(options)
    }

    func reportBootFinished() {
        splashVisible = false
        bootPhase = .loading
        UserDefaults.standard.set(true, forKey: "ryos.everBooted")
    }

    func reportBootFailed(_ message: String) {
        NSLog("ryOS boot failure: \(message)")
        splashVisible = false
    }

    private func registerWithRelay() {
        let state = notificationState
        RelayClient.shared.registerDevice(
            username: state.username,
            isAuthenticated: state.isAuthenticated,
            rooms: (state.rooms ?? []).map(\.id)
        )
    }

    private func requestNotificationPermissionOnce() {
        guard !hasAskedForNotificationPermission else { return }
        hasAskedForNotificationPermission = true
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }
}

/// Renders the web client's `showNotification` bridge calls as local
/// notifications (used while the app is alive and Chats is closed).
@MainActor
final class NotificationPresenter {
    static let shared = NotificationPresenter()

    func show(_ options: ShellNotificationOptions) {
        let content = UNMutableNotificationContent()
        content.title = options.title
        content.body = options.body ?? ""
        if let roomId = options.chatRoomId {
            content.userInfo["chatRoomId"] = roomId
            content.threadIdentifier = roomId
        }
        let request = UNNotificationRequest(
            identifier: UUID().uuidString, content: content, trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }
}
