import UIKit
import WebKit

/// Device battery for the web client. WKWebView has no
/// `navigator.getBattery()`, so the shell reads UIDevice and Low Power Mode
/// and hands them to the injected bridge: seeded at document start as
/// `window.__ryosInitialBattery`, then pushed through
/// `window.__ryosSetBattery(level, charging, lowPowerMode)` on every change,
/// once the page has booted, and on return to the foreground (battery
/// notifications don't arrive while the app is suspended). The bridge backs
/// `ryosDesktop.getBattery()` / `onBatteryChange` and a `navigator.getBattery()`
/// polyfill with them.
@MainActor
final class BatteryBridgeController {
    static let shared = BatteryBridgeController()

    struct Reading {
        /// 0...1, rounded to whole percent.
        var level: Double
        var charging: Bool
        var lowPowerMode: Bool
    }

    private weak var webView: WKWebView?
    private var observers: [NSObjectProtocol] = []

    func attach(_ webView: WKWebView) {
        self.webView = webView
        guard observers.isEmpty else { return }
        UIDevice.current.isBatteryMonitoringEnabled = true
        let center = NotificationCenter.default
        for name in [
            UIDevice.batteryLevelDidChangeNotification,
            UIDevice.batteryStateDidChangeNotification,
            Notification.Name.NSProcessInfoPowerStateDidChange,
            UIApplication.didBecomeActiveNotification,
        ] {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated { BatteryBridgeController.shared.push() }
            })
        }
    }

    /// An unknown battery (the simulator reports -1 / .unknown) reads as
    /// level 1, charging: the Battery Status API's values for a device
    /// without a battery.
    var reading: Reading {
        let device = UIDevice.current
        let lowPowerMode = ProcessInfo.processInfo.isLowPowerModeEnabled
        let raw = Double(device.batteryLevel)
        guard device.batteryState != .unknown, raw.isFinite, raw >= 0 else {
            return Reading(level: 1, charging: true, lowPowerMode: lowPowerMode)
        }
        return Reading(
            level: (min(raw, 1) * 100).rounded() / 100,
            charging: device.batteryState == .charging || device.batteryState == .full,
            lowPowerMode: lowPowerMode
        )
    }

    /// Document-start user script seeding the bridge's initial values.
    var preludeScript: String {
        let value = reading
        return "window.__ryosInitialBattery="
            + "{level:\(value.level),charging:\(value.charging),lowPowerMode:\(value.lowPowerMode)};"
    }

    func push() {
        guard let webView else { return }
        let value = reading
        webView.evaluateJavaScript(
            "window.__ryosSetBattery && window.__ryosSetBattery("
                + "\(value.level),\(value.charging),\(value.lowPowerMode))",
            completionHandler: nil
        )
    }
}
