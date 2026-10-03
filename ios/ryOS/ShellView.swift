import SwiftUI

/// Native shell around the ryOS web desktop: splash while the web client
/// boots, offline banner, boot-error state, and the webview itself.
struct ShellView: View {
    @ObservedObject var shell: ShellViewModel

    var body: some View {
        GeometryReader { geo in
            let topIsClearanceEdge = Self.isTopClearanceEdge(geo.safeAreaInsets)
            let sideTruth = Self.sideStatusBarTruth(
                isVerticalBar: !topIsClearanceEdge,
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
    /// the bar is horizontal at the top (regular iPhone portrait) or rotated
    /// to a side narrower than the Duo strip (notched iPhone landscape,
    /// ~59pt), the page keeps main's behavior. 70pt separates the measured
    /// 84pt Duo strip (both poses) from every iPhone's landscape bar.
    static func isTopClearanceEdge(_ insets: EdgeInsets) -> Bool {
        max(insets.leading, insets.trailing) < sideBarMinimumInset
    }

    /// Side-inset width that means "this is the Duo status-bar strip".
    /// Measured 84pt on both Duo poses; a notched iPhone in landscape
    /// reports ~59pt.
    static let sideBarMinimumInset: CGFloat = 70

    /// Measured vertical extent of the system-drawn status cluster inside
    /// the trailing side bar, plus whether the camera dot is part of it.
    /// On the closed outer display (466×678, trailing strip 84pt) the
    /// cluster — camera dot, clock, wi-fi chip — occupies the top 150pt
    /// (pixel-scanned off the live simulator 2026-10-03: camera ~30–67,
    /// clock ~84–99, chip+dots ending at 150). On the open inner display
    /// (951×669, same 84pt trailing strip) the cluster is clock + wi-fi
    /// only. The first cut reserved 88pt — the wi-fi glyphs' depth — but
    /// the chip's glass circle runs deeper: pixel-scanned 2026-10-03 the
    /// circle's fade reaches ~100–102pt and kissed the dock pill placed at
    /// extent+12. Reserve 104pt, which restores the closed pose's ~13pt
    /// gap between cluster content and the dock. Geometry-keyed
    /// measurements, not pose names.
    static let sideStatusBarExtentMeasured: CGFloat = 150
    static let sideStatusBarExtentOpenMeasured: CGFloat = 104

    /// One contract everywhere (always reported, 0 where meaningless): a
    /// nonzero extent only where the Duo side bar exists (side inset ≥ 70,
    /// checked by the caller via isTopClearanceEdge). The extent is the
    /// cluster's depth in that strip: 150 with the camera dot (closed), 104
    /// without (open).
    static func sideStatusBarTruth(isVerticalBar: Bool, viewSize: CGSize) -> (extent: CGFloat, hasCamera: Bool) {
        guard isVerticalBar else { return (0, false) }
        if viewSize.height > viewSize.width { return (sideStatusBarExtentMeasured, true) }
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
