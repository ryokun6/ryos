import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import ryOS

struct ExampleTests {
    @Test func appMetadataIsPresent() throws {
        for key in ["CFBundleIdentifier", "CFBundleDisplayName", "CFBundleShortVersionString", "CFBundleVersion"] {
            let value = try #require(Bundle.main.object(forInfoDictionaryKey: key) as? String)
            #expect(!value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }

    @Test func heifPhotoBecomesJpeg() throws {
        let heic = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(UUID().uuidString).heic")
        defer { try? FileManager.default.removeItem(at: heic) }
        try writeSolidImage(to: heic, type: .heic, width: 8, height: 4)

        let delivered = try #require(FileOpenPanel.copyImport(heic, suggestedName: "IMG_0001.HEIC"))
        defer { try? FileManager.default.removeItem(at: delivered) }

        #expect(delivered.pathExtension.lowercased() == "jpg")
        let bytes = try Data(contentsOf: delivered)
        #expect(bytes.starts(with: [0xFF, 0xD8, 0xFF]))
        #expect(imageType(of: delivered) == .jpeg)
        let size = try #require(pixelSize(of: delivered))
        #expect(size == (8, 4))
    }

    @Test func extensionlessHeifPhotoBecomesJpeg() throws {
        let heic = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(UUID().uuidString).heic")
        let bare = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
        defer {
            try? FileManager.default.removeItem(at: heic)
            try? FileManager.default.removeItem(at: bare)
        }
        try writeSolidImage(to: heic, type: .heic, width: 3, height: 2)
        try FileManager.default.copyItem(at: heic, to: bare)
        #expect(bare.pathExtension.isEmpty)

        let delivered = try #require(FileOpenPanel.copyImport(bare, suggestedName: nil))
        defer { try? FileManager.default.removeItem(at: delivered) }
        #expect(delivered.pathExtension.lowercased() == "jpg")
        #expect(imageType(of: delivered) == .jpeg)
        let size = try #require(pixelSize(of: delivered))
        #expect(size == (3, 2))
    }

    @Test func jpegPhotoIsCopiedUnchanged() throws {
        let jpeg = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(UUID().uuidString).jpg")
        defer { try? FileManager.default.removeItem(at: jpeg) }
        try writeSolidImage(to: jpeg, type: .jpeg, width: 5, height: 6)
        let original = try Data(contentsOf: jpeg)

        let delivered = try #require(FileOpenPanel.copyImport(jpeg, suggestedName: "shot"))
        defer { try? FileManager.default.removeItem(at: delivered) }
        #expect(delivered.pathExtension.lowercased() == "jpg")
        #expect(try Data(contentsOf: delivered) == original)
    }

    @Test func photoTypePrefersTheStillOverALivePhotoPackage() {
        let provider = NSItemProvider()
        provider.registerDataRepresentation(forTypeIdentifier: "com.apple.live-photo", visibility: .all) { completion in
            completion(Data(), nil)
            return nil
        }
        provider.registerDataRepresentation(forTypeIdentifier: UTType.heic.identifier, visibility: .all) { completion in
            completion(Data(), nil)
            return nil
        }
        #expect(FileOpenPanel.importTypeIdentifier(for: provider) == UTType.heic.identifier)
    }
}

private func writeSolidImage(to url: URL, type: UTType, width: Int, height: Int) throws {
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let context = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: width * 4,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        throw ImageFixtureError.context
    }
    context.setFillColor(red: 1, green: 0, blue: 0, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    guard let image = context.makeImage() else { throw ImageFixtureError.image }
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL, type.identifier as CFString, 1, nil) else {
        throw ImageFixtureError.destination
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { throw ImageFixtureError.finalize }
}

private func imageType(of url: URL) -> UTType? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let typeID = CGImageSourceGetType(source) else { return nil }
    return UTType(typeID as String)
}

private func pixelSize(of url: URL) -> (Int, Int)? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = props[kCGImagePropertyPixelWidth] as? Int,
          let height = props[kCGImagePropertyPixelHeight] as? Int else { return nil }
    return (width, height)
}

private enum ImageFixtureError: Error {
    case context, image, destination, finalize
}

/// The side dock follows the live bottom of the Duo status column.
@MainActor
struct StatusColumnTests {
    private let cover = CGSize(width: 466, height: 678)

    @Test func restingColumnRegionGivesItsBottom() {
        let region = CGRect(x: 382, y: 0, width: 84, height: 174)
        #expect(ShellView.liveSideStatusBottom(occlusions: [region], screen: cover, stripWidth: 84) == 174)
    }

    @Test func grownIslandMovesTheBottomDown() {
        // A Live Activity grows the island; clock and 5G end near 203pt.
        let grown = CGRect(x: 382, y: 0, width: 84, height: 215.4)
        #expect(ShellView.liveSideStatusBottom(occlusions: [grown], screen: cover, stripWidth: 84) == 216)
    }

    @Test func leftStripCountsToo() {
        let region = CGRect(x: 0, y: 0, width: 84, height: 180)
        #expect(ShellView.liveSideStatusBottom(occlusions: [region], screen: cover, stripWidth: 84) == 180)
    }

    @Test func regionsOutsideTheColumnAreIgnored() {
        let topCentre = CGRect(x: 150, y: 10, width: 120, height: 37)
        let fullHeight = CGRect(x: 382, y: 0, width: 84, height: 678)
        let low = CGRect(x: 382, y: 500, width: 84, height: 40)
        #expect(ShellView.liveSideStatusBottom(occlusions: [topCentre, fullHeight, low], screen: cover, stripWidth: 84) == nil)
    }

    @Test func cameraRegionGivesTheColumnCentre() {
        // Cover, iOS 27.1 simulator: camera region and full-strip column.
        let camera = CGRect(x: 399.6666666666667, y: 29.333333333333332, width: 37, height: 37)
        let column = CGRect(x: 382, y: 0, width: 84, height: 174)
        #expect(ShellView.liveSideStatusCenter(occlusions: [column, camera], screen: cover, stripWidth: 84) == 48)
        // A grown island keeps its centre.
        let grown = CGRect(x: camera.minX, y: camera.minY, width: 37, height: 120)
        #expect(ShellView.liveSideStatusCenter(occlusions: [column, grown], screen: cover, stripWidth: 84) == 48)
    }

    @Test func leftStripCentreIsMirrored() {
        let camera = CGRect(x: 29.333333333333332, y: 29.333333333333332, width: 37, height: 37)
        #expect(ShellView.liveSideStatusCenter(occlusions: [camera], screen: cover, stripWidth: 84) == 48)
    }

    @Test func fullStripRegionAloneGivesNoCentre() {
        // Inner display held sideways: only the full-strip region, so the
        // shell falls back to the measured 6pt inward shift.
        let open = CGSize(width: 951, height: 669)
        let column = CGRect(x: 867, y: 0, width: 84, height: 124)
        #expect(ShellView.liveSideStatusCenter(occlusions: [column], screen: open, stripWidth: 84) == nil)
        #expect(ShellView.sideStatusColumnCenterFallback(stripWidth: 84) == 48)
        // Regular iPhone: no strip, no centre.
        let island = CGRect(x: 140, y: 11, width: 122, height: 37)
        #expect(ShellView.liveSideStatusCenter(occlusions: [island], screen: CGSize(width: 402, height: 874), stripWidth: 0) == nil)
        #expect(ShellView.sideStatusColumnCenterFallback(stripWidth: 0) == 0)
    }

    @Test func noVerticalBarMeansNoLiveValue() {
        // Regular iPhone portrait: no side strip, the island never counts.
        let island = CGRect(x: 140, y: 11, width: 122, height: 37)
        #expect(ShellView.liveSideStatusBottom(occlusions: [island], screen: CGSize(width: 402, height: 874), stripWidth: 0) == nil)
        #expect(ShellView.liveSideStatusBottom(occlusions: [], screen: cover, stripWidth: 84) == nil)
    }
}
