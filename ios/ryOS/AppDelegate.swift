import SwiftUI
import UIKit
import UserNotifications

final class AppDelegate: NSObject, UIApplicationDelegate {
    private var centerDelegateHolder: NotificationTapDelegate?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let centerDelegate = NotificationTapDelegate()
        UNUserNotificationCenter.current().delegate = centerDelegate
        centerDelegateHolder = centerDelegate
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        pushLog("APNs token received \(redactedPushToken(token))")
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: .ryOSAPNsTokenArrived, object: nil, userInfo: ["token": token]
            )
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        pushLog("APNs registration failed: \(error.localizedDescription)")
    }
}

/// Handles foreground presentation and notification taps. Deliberately not
/// main-actor isolated: the system calls it from arbitrary queues.
final class NotificationTapDelegate: NSObject, UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show banners for relay pushes while the app is open but Chats is
        // closed; the web client covers the in-app toast UX itself.
        let roomId = notification.request.content.userInfo["chatRoomId"] as? String
        pushLog("Presenting foreground notification room=\(roomId ?? "nil")")
        completionHandler([.banner, .sound])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let roomId = response.notification.request.content.userInfo["chatRoomId"] as? String
        pushLog("Notification tapped room=\(roomId ?? "nil")")
        DispatchQueue.main.async {
            ShellRouter.shared.queue(roomId: roomId)
            ShellRouter.shared.firePendingRoom()
        }
        completionHandler()
    }
}
