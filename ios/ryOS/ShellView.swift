import SwiftUI
import UIKit

/// Native shell around the ryOS web desktop: splash while the web client
/// boots, offline banner, boot-error state, and the webview itself.
struct ShellView: View {
    @ObservedObject var shell: ShellViewModel

    var body: some View {
        // The reader has to be the full screen. Laid out inside the safe
        // area, the webview stops at the Duo status strip and that band
        // stays black. Insets are still reported, so the page can clear
        // the bar and the dock.
        GeometryReader { geo in
            let topIsClearanceEdge = Self.isTopClearanceEdge(geo.safeAreaInsets)
            let sideTruth = Self.sideStatusBarTruth(
                isVerticalBar: !topIsClearanceEdge,
                viewSize: geo.size
            )
            duoBody(
                virtualTopInset: Self.virtualTopInset(
                    insets: geo.safeAreaInsets,
                    statusBarHeight: Self.currentStatusBarHeight()
                ),
                sideStatusBarExtent: sideTruth.extent,
                sideStatusBarHasCamera: sideTruth.hasCamera
            )
        }
        .ignoresSafeArea()
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
    /// the cluster is clock + wi-fi only, and it is 104pt whether that
    /// display is held tall or turned sideways. Height versus width cannot
    /// choose: the inner display held tall is tall too, and it has no camera.
    static let sideStatusBarExtentMeasured: CGFloat = 150
    static let sideStatusBarExtentOpenMeasured: CGFloat = 104

    /// Shorter side of the cover display is 466pt; the inner display's is
    /// 669pt in both orientations. The cover is the one with the camera.
    /// 560 sits in the gap either way the safe area is or isn't included.
    static let coverShortSideMaximum: CGFloat = 560

    /// One contract everywhere (always reported, 0 where meaningless): a
    /// nonzero extent only where the Duo side bar exists (side inset ≥ 70,
    /// checked by the caller). The extent is the cluster's depth in that
    /// strip: 150 on the cover (camera), 104 on the inner display. These are
    /// the fallback; the holder replaces the extent with the live status
    /// column bottom (`liveSideStatusBottom`) whenever the system reports it.
    static func sideStatusBarTruth(isVerticalBar: Bool, viewSize: CGSize) -> (extent: CGFloat, hasCamera: Bool) {
        guard isVerticalBar else { return (0, false) }
        let cover = min(viewSize.width, viewSize.height) < coverShortSideMaximum
        if cover { return (sideStatusBarExtentMeasured, true) }
        return (sideStatusBarExtentOpenMeasured, false)
    }

    /// Live bottom of the status column, from the system's occlusion regions
    /// (iOS 27.1 `reservedRegions(kind: .occlusion)`), in screen points.
    /// On the folded Duo the region covers the strip from the top through
    /// the camera and the status items, and it grows with the Dynamic Island
    /// (a Live Activity pushes the clock and 5G down), so its bottom is where
    /// the status items end right now. Only regions inside a side strip of
    /// `stripWidth` that start near the top and end in the top 60% of the
    /// screen count. nil means nothing usable: keep the fixed extent.
    /// Rounded up to whole points so sub-point jitter is never pushed.
    static func liveSideStatusBottom(occlusions: [CGRect], screen: CGSize, stripWidth: CGFloat) -> CGFloat? {
        guard stripWidth >= sideBarMinimumInset, screen.width > 0, screen.height > 0 else { return nil }
        let strips = [
            CGRect(x: 0, y: 0, width: stripWidth, height: screen.height),
            CGRect(x: screen.width - stripWidth, y: 0, width: stripWidth, height: screen.height),
        ]
        var best: CGFloat?
        for region in occlusions where !region.isNull && !region.isEmpty {
            // Mostly inside one strip: the column, not a camera elsewhere.
            let inColumn = strips.contains { strip in
                let overlap = region.intersection(strip)
                return !overlap.isNull && overlap.width >= region.width * 0.5
            }
            guard inColumn,
                  region.minY < screen.height * 0.25,
                  region.maxY > 0,
                  region.maxY < screen.height * 0.6 else { continue }
            best = max(best ?? 0, region.maxY)
        }
        return best.map { $0.rounded(.up) }
    }

    /// Centre of the status column, in points from the screen edge that
    /// holds the side strip. The system draws the column (camera, clock,
    /// Wi-Fi) a little inward of the strip's centre: in the 84pt Duo strip
    /// the camera region's centre and the clock and Wi-Fi glyphs all sit
    /// 47.8pt from the edge, folded and open (iOS 27.1 simulator, 2026-11-23),
    /// not at 42. On the cover the camera occlusion region (37pt wide, inside
    /// the strip) gives the centre directly; it stays put when a Live Activity
    /// grows the island. A region narrower than the strip, mostly inside it
    /// and starting near the top, counts; the full-strip column region says
    /// nothing about the centre. nil means no such region (the inner display
    /// held sideways has none): use `sideStatusColumnCenterFallback`.
    /// Rounded to half points so sub-point jitter is never pushed.
    static func liveSideStatusCenter(occlusions: [CGRect], screen: CGSize, stripWidth: CGFloat) -> CGFloat? {
        guard stripWidth >= sideBarMinimumInset, screen.width > 0, screen.height > 0 else { return nil }
        var best: (top: CGFloat, center: CGFloat)?
        for region in occlusions where !region.isNull && !region.isEmpty {
            guard region.width < stripWidth - 1,
                  region.minY < screen.height * 0.25 else { continue }
            let right = CGRect(x: screen.width - stripWidth, y: 0, width: stripWidth, height: screen.height)
            let left = CGRect(x: 0, y: 0, width: stripWidth, height: screen.height)
            let center: CGFloat
            if region.intersection(right).width >= region.width * 0.9 {
                center = screen.width - region.midX
            } else if region.intersection(left).width >= region.width * 0.9 {
                center = region.midX
            } else {
                continue
            }
            if best == nil || region.minY < best!.top { best = (region.minY, center) }
        }
        return best.map { ($0.center * 2).rounded() / 2 }
    }

    /// Where the column centre is when no region gives it (the inner display
    /// held sideways): the same 6pt inward of the strip's centre measured on
    /// both poses. Only for a side strip; 0 otherwise.
    static func sideStatusColumnCenterFallback(stripWidth: CGFloat) -> CGFloat {
        guard stripWidth >= sideBarMinimumInset else { return 0 }
        return stripWidth / 2 + sideStatusColumnInwardShift
    }

    static let sideStatusColumnInwardShift: CGFloat = 6

    /// On the folded cover the live column region runs ~17pt below the drawn
    /// status pill (region bottom 174, pill bottom 157.3), so the page's 12pt
    /// clearance left a 28.7pt visible gap above the dock. Ryo asked for half
    /// that: the reported extent is pulled up by this much on the cover only,
    /// for a ~14.7pt gap and a longer dock. The inner display keeps its gap.
    static let coverDockGapReduction: CGFloat = 14

    /// Top inset the page would otherwise miss. Geometry only, no device names.
    /// Duo (side inset at least 70): the real top inset is 0, but the top
    /// ~20pt is system-reserved. A reported top inset (regular iPhone
    /// portrait) already covers the bar, so adding to it would double.
    /// A wide side inset with no top inset is the landscape island, which
    /// sits on the side. No inset on any edge while a status bar is still
    /// drawn (iPad full screen, where the bar overlays without an inset)
    /// reports the bar's own height.
    static func virtualTopInset(insets: EdgeInsets, statusBarHeight: CGFloat) -> CGFloat {
        let side = max(insets.leading, insets.trailing)
        if side >= sideBarMinimumInset { return 20 }
        if insets.top > 1 { return 0 }
        if side >= 20 { return 0 }
        return max(0, statusBarHeight)
    }

    /// Height of the status bar actually drawn for this scene. 0 when the
    /// bar is hidden, which is how a windowed iPad scene reports itself.
    static func currentStatusBarHeight() -> CGFloat {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        guard let manager = scene?.statusBarManager, !manager.isStatusBarHidden else { return 0 }
        return manager.statusBarFrame.height
    }

    /// The webview is full bleed on every device and the page clears the
    /// system bars itself. Inside the shell the menubar, windows, icons and
    /// toasts start below env(safe-area-inset-top), and the wallpaper fills
    /// the strip behind the status bar.
    private func duoBody(virtualTopInset: CGFloat, sideStatusBarExtent: CGFloat, sideStatusBarHasCamera: Bool) -> some View {
        ZStack(alignment: .top) {
            Color.black
                .ignoresSafeArea()

            ShellWebView(shell: shell,
                         virtualTopInset: virtualTopInset,
                         sideStatusBarExtent: sideStatusBarExtent,
                         sideStatusBarHasCamera: sideStatusBarHasCamera)
                .ignoresSafeArea()

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
