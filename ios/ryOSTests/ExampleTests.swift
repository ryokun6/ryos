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
