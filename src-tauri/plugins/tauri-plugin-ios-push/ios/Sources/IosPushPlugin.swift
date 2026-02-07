import Foundation
import SwiftRs
import Tauri
import UIKit
import UserNotifications
import WebKit

@objc(IosPushPlugin)
public class IosPushPlugin: Plugin, UNUserNotificationCenterDelegate {
    public static var instance: IosPushPlugin?

    private var pushToken: String?

    @objc override public func load(webview: WKWebView) {
        IosPushPlugin.instance = self
        UNUserNotificationCenter.current().delegate = self
    }

    deinit {
        if IosPushPlugin.instance === self {
            IosPushPlugin.instance = nil
        }
    }

    @objc public func requestPushPermission(_ invoke: Invoke) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) {
            granted, error in
            DispatchQueue.main.async {
                if let error = error {
                    invoke.reject(error.localizedDescription)
                    return
                }

                if granted {
                    UIApplication.shared.registerForRemoteNotifications()
                }

                invoke.resolve(["granted": granted])
            }
        }
    }

    @objc public func getPushToken(_ invoke: Invoke) {
        guard let token = self.pushToken, !token.isEmpty else {
            invoke.reject("APNs token not available yet")
            return
        }
        invoke.resolve(["token": token])
    }

    public func handleDeviceToken(_ deviceToken: Data) {
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        self.pushToken = tokenString

        do {
            try self.trigger("token", data: ["token": tokenString])
        } catch {
            // Best-effort event dispatch; token remains retrievable via getPushToken.
        }
    }

    public func handleDeviceTokenRegistrationError(_ error: Error) {
        do {
            try self.trigger("registration-error", data: [
                "message": error.localizedDescription
            ])
        } catch {
            // Best-effort event dispatch.
        }
    }

    public func handleRemoteNotification(_ userInfo: [AnyHashable: Any]) {
        let payload = sanitizeDictionary(userInfo)
        do {
            try self.trigger("notification", data: payload)
        } catch {
            // Best-effort event dispatch.
        }
    }

    public func handleRemoteNotificationTap(_ userInfo: [AnyHashable: Any]) {
        let payload = sanitizeDictionary(userInfo)
        do {
            try self.trigger("notification-tapped", data: payload)
        } catch {
            // Best-effort event dispatch.
        }
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        handleRemoteNotification(notification.request.content.userInfo)

        if #available(iOS 14.0, *) {
            completionHandler([.banner, .list, .sound, .badge])
        } else {
            completionHandler([.alert, .sound, .badge])
        }
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        handleRemoteNotificationTap(response.notification.request.content.userInfo)
        completionHandler()
    }

    private func sanitizeDictionary(_ dict: [AnyHashable: Any]) -> [String: Any] {
        var result: [String: Any] = [:]
        for (key, value) in dict {
            result[String(describing: key)] = sanitizeValue(value)
        }
        return result
    }

    private func sanitizeValue(_ value: Any) -> Any {
        if let string = value as? String { return string }
        if let number = value as? NSNumber { return number }
        if let bool = value as? Bool { return bool }
        if let int = value as? Int { return int }
        if let double = value as? Double { return double }
        if let float = value as? Float { return float }
        if value is NSNull { return NSNull() }
        if let date = value as? Date {
            return ISO8601DateFormatter().string(from: date)
        }
        if let array = value as? [Any] {
            return array.map { sanitizeValue($0) }
        }
        if let nested = value as? [AnyHashable: Any] {
            return sanitizeDictionary(nested)
        }
        return String(describing: value)
    }
}

@_cdecl("init_plugin_ios_push")
func initPlugin() -> Plugin {
    return IosPushPlugin()
}
