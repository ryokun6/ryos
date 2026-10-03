import SwiftUI

/// Native shell around the ryOS web desktop: splash while the web client
/// boots, offline banner, boot-error state, and the webview itself.
struct ShellView: View {
    @ObservedObject var shell: ShellViewModel

    var body: some View {
        GeometryReader { geo in
            let topIsClearanceEdge = Self.isTopClearanceEdge(geo.safeAreaInsets)
            let sideTruth = Self.sideStatusBarTruth(
                insets: geo.safeAreaInsets,
                viewSize: geo.size
            )
            duoBody(
                topIsClearanceEdge: topIsClearanceEdge,
                sideStatusBarExtent: sideTruth.extent,
                sideStatusBarHasCamera: sideTruth.hasCamera
            )
        }
    }

    /// A vertical status bar shows up as a large side safe-area inset; when
    /// the bar is horizontal at the top (regular iPhone), both side insets
    /// are zero. 8pt comfortably separates the two shapes.
    static func isTopClearanceEdge(_ insets: EdgeInsets) -> Bool {
        max(insets.leading, insets.trailing) < 8
    }

    /// Measured vertical extent of the system-drawn status cluster inside
    /// the trailing side bar, plus whether the camera dot is part of it.
    /// On the closed outer display (466×678, trailing strip 84pt) the
    /// cluster — camera dot, clock, wi-fi chip — occupies the top 150pt
    /// (pixel-scanned off the live simulator 2026-10-03: camera ~30–67,
    /// clock ~84–99, chip+dots ending at 150). On the open inner display
    /// (951×669, same 84pt trailing strip) the cluster is clock + wi-fi
    /// only, ending at 88pt. Geometry-keyed measurements, not pose names.
    static let sideStatusBarExtentMeasured: CGFloat = 150
    static let sideStatusBarExtentOpenMeasured: CGFloat = 88

    /// One contract everywhere (always reported, 0 where meaningless): a
    /// nonzero extent only where the vertical side bar exists. Both Duo
    /// poses share the same 84pt trailing strip (probe-confirmed: env right
    /// = 84 in both), so the extent is the cluster's depth in that strip:
    /// 150 with the camera dot (closed), 88 without (open). Regular iPhones
    /// have no vertical bar in portrait (zero side insets). In landscape a
    /// notched iPhone rotates its bar to a side too (~59pt), which must NOT
    /// read as the Duo open pose — the 70pt gate separates the measured 84
    /// (Duo) from every iPhone's landscape bar width (≤ ~59).
    static func sideStatusBarTruth(insets: EdgeInsets, viewSize: CGSize) -> (extent: CGFloat, hasCamera: Bool) {
        let side = max(insets.leading, insets.trailing)
        guard side >= 8 else { return (0, false) }
        if viewSize.height > viewSize.width { return (sideStatusBarExtentMeasured, true) }
        guard side >= 70 else { return (0, false) }
        return (sideStatusBarExtentOpenMeasured, false)
    }

    /// Clearance follows the status bar's actual edge, read from the live
    /// safe-area geometry (GeometryProxy.safeAreaInsets — Apple documents no
    /// API that even names iPhone Duo, it reports as an iPhone). On iPhone Duo
    /// the bar is VERTICAL on a side edge (the trailing safe-area inset, 84pt
    /// on the closed outer display; one side on the inner display in
    /// landscape), so there is no top bar to clear: the web runs to the very
    /// top and the web client clears the bar zone itself via its
    /// --desktop-content-left/right env(safe-area-inset-*) bindings (PR 1965).
    /// Regular iPhones always have zero side insets, so they keep the top
    /// clearance with the web menubar flush beneath the black strip.
    private func duoBody(topIsClearanceEdge: Bool, sideStatusBarExtent: CGFloat, sideStatusBarHasCamera: Bool) -> some View {
        ZStack(alignment: .top) {
            // Solid black behind the status bar, per the design reference:
            // the web menubar sits flush beneath it. Ignore every edge so the
            // status-bar region stays black in any pose — on iPhone Duo's
            // inner display in landscape the inset moves to a side edge, and
            // leaving it un-painted shows the white window background there.
            Color.black
                .ignoresSafeArea()

            ShellWebView(shell: shell,
                         virtualTopInset: topIsClearanceEdge ? 0 : 20,
                         sideStatusBarExtent: sideStatusBarExtent,
                         sideStatusBarHasCamera: sideStatusBarHasCamera)
                // Full bleed on the sides always (the web clears any vertical
                // bar itself — insetting here would double it as black bars
                // down the display edge), and the top too when the bar is a
                // side bar (Duo, either pose). Top respect stays only where
                // the status bar is horizontal at the top.
                .ignoresSafeArea(edges: topIsClearanceEdge
                    ? [.bottom, .leading, .trailing]
                    : .all)

            if shell.splashVisible {
                SplashView(bootPhase: shell.bootPhase, offline: shell.isOffline)
                    .transition(.opacity)
                    .zIndex(2)
            } else if shell.isOffline {
                OfflineBanner()
                    .padding(.top, 4)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.25), value: shell.splashVisible)
        .animation(.easeOut(duration: 0.2), value: shell.isOffline)
    }
}
/// Launch screen: pure black, one rounded progress bar — nothing else
/// (Ryo's spec, exact values from Colo: 240×6pt bar, track white 20%,
/// fill white, no gradient, centered on screen). First-ever launch names
/// the step ("Downloading ryOS…"); later launches are the fast cache path.
struct SplashView: View {
    let bootPhase: ShellViewModel.BootPhase
    let offline: Bool

    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()

            VStack(spacing: 16) {
                SplashProgressBar(fraction: bootPhase == .loading ? 0.9 : 0.25)
                    .frame(width: 240, height: 6)

                if bootPhase == .downloading {
                    Text("Downloading ryOS…")
                        .font(.callout)
                        .foregroundStyle(.white.opacity(0.75))
                }
            }
        }
        .accessibilityElement()
        .accessibilityLabel(Text("Loading ryOS"))
    }
}

/// Minimal loading bar: 6pt capsule, gray track (white 20%), white fill,
/// fully rounded ends — no gradient, no glow.
struct SplashProgressBar: View {
    var fraction: Double

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.20))
                Capsule()
                    .fill(Color.white)
                    .frame(width: max(10, geo.size.width * fraction))
                    .animation(.easeOut(duration: 0.4), value: fraction)
            }
        }
        .frame(height: 6)
    }
}

/// Offline capsule docked under the status bar, above the web menubar
/// (spec §3). Tapping retries by reloading the webview's current state.
struct OfflineBanner: View {
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 12, weight: .semibold))
            Text("Offline · showing last loaded version")
                .font(.footnote)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 14)
        .frame(height: 36)
        .background(.ultraThinMaterial, in: Capsule())
        .shadow(color: .black.opacity(0.35), radius: 4, y: 2)
        .padding(.top, 4)
        .accessibilityLabel(Text("Offline. Showing last loaded version. Double-tap to retry."))
    }
}
