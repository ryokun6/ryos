import AVFoundation
import Foundation
import MediaPlayer
import UIKit

/// Native media playback (build 10). The web client hands direct-media
/// sources over to the shell, which plays them through AVPlayer so playback
/// survives backgrounding — the webview cannot keep its own media alive in
/// the background on modern iOS (WebKit suspends the page, and the web
/// content process cannot take a background media assertion). This is the
/// native-player architecture Ato approved; the web client stays the queue
/// owner and receives events for its UI. See
/// handoff/bridge-methods-native-playback.md for the web-side contract.
@MainActor
final class NativePlayerController: NSObject {
    static let shared = NativePlayerController()

    private var player: AVPlayer?
    private var endObserver: NSObjectProtocol?
    private var timeObserver: Any?

    /// True while the native player holds a source. MediaHapticsController
    /// consults this before any destructive audio-session release so a
    /// stale web-side report cannot tear down native playback.
    var ownsSource: Bool { player != nil }

    /// Delivers JSON playback events into the page. Set by ShellWebView.
    var onEvent: ((String) -> Void)?

    // MARK: Playback

    func play(source: NativeMediaSource) {
        stopInternal(clearNowPlaying: false)
        let item = AVPlayerItem(url: source.url)
        let newPlayer = AVPlayer(playerItem: item)
        player = newPlayer

        MediaHapticsController.shared.setNowPlaying(NowPlayingInfo(
            title: source.title,
            artist: source.artist,
            album: source.album,
            durationSeconds: source.durationSeconds,
            artworkUrl: source.artworkUrl
        ))
        MediaHapticsController.shared.setAudioActive(true)

        if let start = source.startAtSeconds, start > 0 {
            newPlayer.seek(to: CMTime(seconds: start, preferredTimescale: 600))
        }
        newPlayer.play()
        installObservers(player: newPlayer, item: item)
 announce    }

    func pause() {
        player?.pause()
        emitState("paused")
    }

    func resume() {
        player?.play()
        emitState("playing")
    }

    func seek(to seconds: Double) {
        player?.seek(to: CMTime(seconds: seconds, preferredTimescale: 600))
        emitState("seeked")
    }

    /// Lock-screen toggle for handed-over playback.
    func togglePlayPause() {
        guard let player else { return }
        if player.rate > 0 { pause() } else { resume() }
    }

    func stop() {
        stopInternal(clearNowPlaying: true)
        MediaHapticsController.shared.setAudioActive(false)
        emitEvent(["state": "stopped"])
    }

    // MARK: Observers

    private func installObservers(player newPlayer: AVPlayer, item: AVPlayerItem) {
        endObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: item,
            queue: .main
        ) { [weak self] _ in
            self?.emitState("ended")
        }
        timeObserver = newPlayer.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 1, preferredTimescale: 4),
            queue: .main
        ) { [weak self] _ in
            self?.tick()
        }
    }

    /// Per-second: refresh the now-playing elapsed time and rate so the lock
    /// screen stays live while the native player owns playback (the web
    /// client's updatePlayback ticks stop for handed-over sources).
    private func tick() {
        guard let player, let item = player.currentItem else { return }
        let position = item.currentTime().seconds
        guard position.isFinite else { return }
        MediaHapticsController.shared.updatePlayback(
            positionSeconds: position,
            rate: player.rate
        )
    }

    // MARK: Events

    private func emitState(_ state: String) {
        var payload: [String: Any] = ["state": state]
        if let player, let item = player.currentItem {
            let position = item.currentTime().seconds
            if position.isFinite { payload["positionSeconds"] = position }
            let duration = item.duration.seconds
            if duration.isFinite { payload["durationSeconds"] = duration }
        }
        emitEvent(payload)
    }

    private func emitEvent(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
              let json = String(data: data, encoding: .utf8) else { return }
        onEvent?(json)
    }

    private func stopInternal(clearNowPlaying: Bool) {
        if let observer = endObserver { NotificationCenter.removeObserver(observer) }
        endObserver = nil
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
            timeObserver = nil
        }
        player?.pause()
        player = nil
        if clearNowPlaying {
            MediaHapticsController.shared.setNowPlaying(nil)
        }
    }

    deinit {
        if let observer = endObserver { NotificationCenter.removeObserver(observer) }
    }
}

/// Source handed over by the web client for native playback.
struct NativeMediaSource: Codable {
    var url: String
    var title: String
    var artist: String?
    var album: String?
    var durationSeconds: Double?
    var artworkUrl: String?
    var startAtSeconds: Double?
}
