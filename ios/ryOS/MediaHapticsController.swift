import UIKit

/// Native side of the haptics bridge (build 6).
///
/// The web client calls, through the existing `ryosDesktop` invoke surface:
///   playHaptic(pattern)      pattern: "light" | "medium" | "heavy" |
///                            "success" | "warning" | "error" | "rigid" | "soft" |
///                            "selection"
@MainActor
final class MediaHapticsController {
    static let shared = MediaHapticsController()

    func playHaptic(_ pattern: String) {
        switch pattern {
        case "light":
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case "medium":
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        case "heavy":
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case "rigid":
            UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
        case "soft":
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        case "success":
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning":
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case "error":
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        default:
            UISelectionFeedbackGenerator().selectionChanged()
        }
    }
}
