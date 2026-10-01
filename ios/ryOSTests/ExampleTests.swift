import Foundation
import Testing

struct ExampleTests {
    @Test
    func appMetadataIsPresent() throws {
        for key in ["CFBundleIdentifier", "CFBundleDisplayName", "CFBundleShortVersionString", "CFBundleVersion"] {
            let value = try #require(Bundle.main.object(forInfoDictionaryKey: key) as? String)
            #expect(!value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }
}
