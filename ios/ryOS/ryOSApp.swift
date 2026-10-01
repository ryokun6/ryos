import SwiftUI

@main
struct ryOSApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var shell = ShellViewModel()

    var body: some Scene {
        WindowGroup {
            ShellView(shell: shell)
                .environmentObject(shell)
        }
    }
}
