import AppKit

/// Where the notch is, from Apple's own screen APIs: the free areas left and
/// right of the camera housing (`auxiliaryTopLeftArea` / `auxiliaryTopRightArea`)
/// and the top safe-area inset. A screen without a notch gets a pill of the
/// menu bar's height, centred, so the island looks the same everywhere.
struct NotchGeometry {
    /// The camera housing, in screen coordinates (origin bottom-left).
    let notch: NSRect
    let hasNotch: Bool

    init(screen: NSScreen) {
        let frame = screen.frame
        if let left = screen.auxiliaryTopLeftArea, let right = screen.auxiliaryTopRightArea, screen.safeAreaInsets.top > 0 {
            let width = frame.width - left.width - right.width
            let height = screen.safeAreaInsets.top
            notch = NSRect(x: frame.midX - width / 2, y: frame.maxY - height, width: width, height: height)
            hasNotch = true
        } else {
            let height = max(24, frame.maxY - screen.visibleFrame.maxY)
            let width: CGFloat = 200
            notch = NSRect(x: frame.midX - width / 2, y: frame.maxY - height, width: width, height: height)
            hasNotch = false
        }
    }

    /// The screen to show the island on: the built-in one when it has a notch.
    static func preferredScreen() -> NSScreen? {
        NSScreen.screens.first { $0.safeAreaInsets.top > 0 } ?? NSScreen.main
    }
}
