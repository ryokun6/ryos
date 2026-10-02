import AVFoundation
import UIKit

/// Shell-side audio session recovery (Ryo's report: after restoring the app
/// from background, system sounds and the web client's audio contexts can
/// stay dead, while the same flows recover in Safari).
///
/// WebKit manages the shared AVAudioSession for WKWebView media itself, but
/// it does not re-activate the session when the app is foregrounded after a
/// suspension — Safari does this for its own tabs, which is why the web app
/// recovers there and not in the shell. This controller restores Safari's
/// behavior: activate the session on foreground and after every interruption
/// ends, and never deactivate it (deactivating would kill the existing
/// background-audio feature).
@MainActor
final class AudioSessionController {
    static let shared = AudioSessionController()
    private var observers: [NSObjectProtocol] = []

    func start() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { [weak self] _ in
            self?.recover("foreground")
        })
        observers.append(center.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
        ) { [weak self] notification in
            guard let info = notification.userInfo,
                  let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw),
                  type == .ended else { return }
            let shouldResume = (info[AVAudioSessionInterruptionOptionKey] as? UInt)
                .map { AVAudioSession.InterruptionOptions(rawValue: $0).contains(.shouldResume) } ?? false
            guard shouldResume else { return }
            self?.recover("interruption-ended")
        })
    }

    private func recover(_ reason: String) {
        let session = AVAudioSession.sharedInstance()
        do {
            // .playback matches WebKit's own category for audible web media;
            // .mixWithOthers keeps silent-mode state and other apps' audio
            // behaving like Safari's tabs do.
            if session.category != .playback {
                try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            }
            try session.setActive(true)
            NSLog("ryOS: [audio] session re-activated (\(reason))")
        } catch {
            NSLog("ryOS: [audio] re-activation failed (\(reason)): \(error.localizedDescription)")
        }
    }
}
