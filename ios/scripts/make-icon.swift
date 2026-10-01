// Composites the transparent app-icon master onto opaque black and writes the
// asset-catalog icon. Runs on the macOS builder (Xcode toolchain only).
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let src = root.appendingPathComponent("ryOS/AppIconSource.png")
let dst = root.appendingPathComponent("ryOS/Assets.xcassets/AppIcon.appiconset/AppIcon.png")

guard let srcRef = CGImageSourceCreateWithURL(src as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(srcRef, 0, nil) else {
    FileHandle.standardError.write("make-icon: cannot decode \(src.path)\n".data(using: .utf8)!)
    exit(1)
}

let w = image.width, h = image.height
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8,
                          bytesPerRow: w * 4, space: cs,
                          bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue) else {
    FileHandle.standardError.write("make-icon: cannot create context\n".data(using: .utf8)!)
    exit(1)
}
// Black matches the web manifest's icon background.
ctx.setFillColor(CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
guard let flat = ctx.makeImage() else {
    FileHandle.standardError.write("make-icon: cannot render\n".data(using: .utf8)!)
    exit(1)
}
guard let dest = CGImageDestinationCreateWithURL(dst as CFURL, UTType.png.identifier as CFString, 1, nil) else {
    FileHandle.standardError.write("make-icon: cannot open \(dst.path)\n".data(using: .utf8)!)
    exit(1)
}
CGImageDestinationAddImage(dest, flat, nil)
guard CGImageDestinationFinalize(dest) else {
    FileHandle.standardError.write("make-icon: cannot write\n".data(using: .utf8)!)
    exit(1)
}
print("make-icon: wrote \(dst.path) (\(w)x\(h), opaque)")
