import AVFoundation
import MediaPlayer
import UIKit

/// Native side of the haptics + background-audio bridge (build 6).
///
/// The web client calls, through the existing `ryosDesktop` invoke surface:
///   playHaptic(pattern)      pattern: "light" | "medium" | "heavy" |
///                            "success" | "warning" | "error" | "rigid" | "soft"
///   setNowPlaying(info|null) info: { title, artist?, album?, durationSeconds?,
///                                    artworkUrl? } — null clears it
///   setAudioActive(bool)     true while any ryOS window is playing audio;
///                            the shell then keeps the session alive in
///                            background (UIBackgroundModes: audio)
///
/// The web side needs no changes beyond calling these; full spec lives in
/// the bridge-methods handoff for Ryo.
@MainActor
final class MediaHapticsController {
    static let shared = MediaHapticsController()

    private var audioConfigured = false
    private var releaseTask: Task<Void, Never>?
    private var nowPlayingInfo: [String: Any]?
    /// Remote-command handlers, installed once.
    private var remoteCommandsInstalled = false
    /// Lock-screen remote commands forwarded to the page. Values:
    /// "toggle-play-pause" | "play" | "pause". The web client assigns its own
    /// `window.__ryosDesktopRemoteCommand` function; the shell evaluates it
    /// when the lock-screen/user controls fire.
    var onRemoteCommand: ((String) -> Void)?

    // MARK: Audio session

    func setAudioActive(_ active: Bool) {
        let session = AVAudioSession.sharedInstance()
        if active {
            cancelRelease()
            if !audioConfigured {
                try? session.setCategory(.playback, mode: .default, options: [])
                try? session.setActive(true)
                audioConfigured = true
                installRemoteCommands()
            }
        } else if audioConfigured {
            // Mirror the web client's release grace (its MediaCore handoff
            // can briefly report no active source): delay the one destructive
            // call so a source that returns within the window never tears the
            // session down mid-playback.
            let task = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 200_000_000)
                guard !Task.isCancelled, let self else { return }
                self.releaseTask = nil
                guard self.audioConfigured else { return }
                try? session.setActive(false, options: [.notifyOthersOnDeactivation])
                self.audioConfigured = false
            }
            releaseTask = task
        }
    }

    private func cancelRelease() {
        releaseTask?.cancel()
        releaseTask = nil
    }

    // MARK: Now playing

    func setNowPlaying(_ info: NowPlayingInfo?) {
        var centerInfo: [String: Any] = [:]
        if let info {
            centerInfo[MPMediaItemPropertyTitle] = info.title
            if let artist = info.artist { centerInfo[MPMediaItemPropertyArtist] = artist }
            if let album = info.album { centerInfo[MPMediaItemPropertyAlbumTitle] = album }
            if let duration = info.durationSeconds { centerInfo[MPMediaItemPropertyPlaybackDuration] = duration }
            nowPlayingInfo = centerInfo
            MPNowPlayingInfoCenter.default().nowPlayingInfo = centerInfo
            if let urlString = info.artworkUrl, let url = URL(string: urlString) {
                loadArtwork(from: url)
            }
        } else {
            nowPlayingInfo = nil
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        }
    }

    func updatePlayback(positionSeconds: Double, rate: Double) {
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = positionSeconds
        info[MPNowPlayingInfoPropertyPlaybackRate] = rate
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func loadArtwork(from url: URL) {
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data, let image = UIImage(data: data) else { return }
            let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            DispatchQueue.main.async {
                guard self?.nowPlayingInfo != nil else { return }
                var info = self?.nowPlayingInfo ?? [:]
                info[MPMediaItemPropertyArtwork] = artwork
                self?.nowPlayingInfo = info
                MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            }
        }.resume()
    }

    // MARK: Remote commands

    private func installRemoteCommands() {
        guard !remoteCommandsInstalled else { return }
        remoteCommandsInstalled = true
        let center = MPRemoteCommandCenter.shared()
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.onRemoteCommand?("toggle-play-pause")
            return .success
        }
        center.playCommand.addTarget { [weak self] _ in
            self?.onRemoteCommand?("play")
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            self?.onRemoteCommand?("pause")
            return .success
        }
    }

    // MARK: Haptics

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

struct NowPlayingInfo: Codable {
    var title: String
    var artist: String?
    var album: String?
    var durationSeconds: Double?
    var artworkUrl: String?
}