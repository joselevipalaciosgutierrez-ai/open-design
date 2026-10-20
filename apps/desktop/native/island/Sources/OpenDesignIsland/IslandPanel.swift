import AppKit

/// The island's window: a borderless, transparent, non-activating panel at the
/// screen-saver level, so it sits over the menu bar and the notch, on every
/// Space, without taking focus from the app the person is using. The same
/// recipe notch apps (DynamicNotchKit, boring.notch) use.
final class IslandPanel: NSPanel {
    init(contentRect: NSRect) {
        super.init(
            contentRect: contentRect,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        level = .screenSaver
        collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        isMovable = false
        hidesOnDeactivate = false
    }

    // Writing to Lev needs the keyboard; the panel takes it only when asked.
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}
