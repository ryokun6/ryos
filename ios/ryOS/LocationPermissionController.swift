import CoreLocation
import WebKit

/// Native side of the geolocation bridge (build 9).
///
/// The web client's `navigator.geolocation` asks are surfaced by WebKit to the
/// shell's WKUIDelegate; this controller answers them from the app's own
/// Core Location permission:
///   - authorized: the web ask is granted immediately;
///   - not determined: the system when-in-use dialog is shown (the native
///     dialog IS the prompt, per design — never a custom pre-prompt) and the
///     web ask is answered when the user replies;
///   - denied/restricted: the web ask is denied.
///
/// The web client can also ask the bridge directly (invoke
/// "getLocationPermissionStatus") to mirror the native answer into its own
/// settings UI: "granted" | "denied" | "prompt".
@MainActor
final class LocationPermissionController: NSObject {
    static let shared = LocationPermissionController()

    private let manager = CLLocationManager()
    private var managerConfigured = false
    private var pendingAsks: [(String, (WKPermissionDecision) -> Void)] = []

    /// Maps the app's Core Location status to the string the web client sees.
    var webStatus: String {
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse: return "granted"
        case .denied, .restricted: return "denied"
        case .notDetermined: return "prompt"
        @unknown default: return "prompt"
        }
    }

    /// Answers one web geolocation ask. May resolve immediately, or after the
    /// system permission dialog if the user has never been asked.
    func handleWebAsk(origin: String, decide: @escaping (WKPermissionDecision) -> Void) {
        if !managerConfigured {
            managerConfigured = true
            manager.delegate = self
        }
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            decide(.grant)
        case .denied, .restricted:
            decide(.deny)
        case .notDetermined:
            pendingAsks.append((origin, decide))
            manager.requestWhenInUseAuthorization()
        @unknown default:
            decide(.deny)
        }
    }

    private func flushPending() {
        let decision: WKPermissionDecision
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse: decision = .grant
        case .notDetermined: return // more delegate callbacks will come
        default: decision = .deny
        }
        let asks = pendingAsks
        pendingAsks.removeAll()
        for (_, handler) in asks { handler(decision) }
    }
}

extension LocationPermissionController: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            self.flushPending()
        }
    }
}
