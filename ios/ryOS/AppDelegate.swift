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
        NSLog("ryOS: APNs registration failed: \(error.localizedDescription)")
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
        // In the foreground the web client receives the same message over
        // realtime and decides itself (toast, unread badge, or nothing when
        // the room is open), so relay pushes would duplicate it. Local
        // notifications come from the web client's own showNotification.
        let isRelayPush = notification.request.trigger is UNPushNotificationTrigger
        completionHandler(isRelayPush ? [] : [.banner, .sound])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let roomId = response.notification.request.content.userInfo["chatRoomId"] as? String
        DispatchQueue.main.async {
            ShellRouter.shared.queue(roomId: roomId)
            ShellRouter.shared.firePendingRoom()
        }
        completionHandler()
    }
}
