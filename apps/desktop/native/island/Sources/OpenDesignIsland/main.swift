import AppKit
import SwiftUI
import Combine

/// The island process: no Dock icon, no menu bar of its own (an accessory
/// app); one panel anchored to the top centre of the screen with the notch.
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var panel: IslandPanel?
    private let model = IslandModel()
    private var watchers: Set<AnyCancellable> = []

    /// Open Design itself: the packaged app, or Electron in development.
    private func isOpenDesign(_ app: NSRunningApplication?) -> Bool {
        guard let app else { return false }
        let name = app.localizedName ?? ""
        return name.hasPrefix("Open Design") || name.hasPrefix("Lev Design") || app.bundleIdentifier == "com.github.Electron"
    }

    private var client: DaemonClient?
    private var notchSize: CGSize = .zero

    private func updateHitArea() {
        guard let panel, panel.isVisible else { return }
        let size = model.expanded
            ? IslandView.expandedSize
            : CGSize(width: notchSize.width + IslandView.wing * 2, height: notchSize.height)
        let shape = NSRect(x: panel.frame.midX - size.width / 2, y: panel.frame.maxY - size.height, width: size.width, height: size.height)
        let inside = shape.contains(NSEvent.mouseLocation)
        if panel.ignoresMouseEvents == inside { panel.ignoresMouseEvents = !inside }
    }
    private var lingerTimer: Timer?

    /// Clicks and words go to the app through the daemon; the app's state comes back.
    private func connect() {
        guard let base = DaemonClient.resolveBase() else {
            model.localNotice = "Sin conexión con Lev Design."
            return
        }
        let client = DaemonClient(base: base)
        self.client = client
        let notOpen = "Abre Lev Design para hablar con Lev."
        client.onState = { [weak self] state in
            guard let self else { return }
            let wasBusy = self.model.busy
            self.model.state = state
            if state.appConnected, self.model.localNotice == notOpen { self.model.localNotice = nil }
            // After Lev finishes, its answer stays up for a moment.
            if wasBusy && !self.model.busy && (state.reply != nil || state.notice != nil) {
                self.model.lingering = true
                self.lingerTimer?.invalidate()
                self.lingerTimer = Timer.scheduledTimer(withTimeInterval: 8, repeats: false) { [weak self] _ in
                    self?.model.lingering = false
                }
            }
        }
        let flash = { [weak self] (text: String) in
            self?.model.localNotice = text
            Timer.scheduledTimer(withTimeInterval: 5, repeats: false) { [weak self] _ in
                if self?.model.localNotice == text { self?.model.localNotice = nil }
            }
        }
        model.onMonkey = { Task { @MainActor in if !(await client.send(["action": "voice"])) { flash(notOpen) } } }
        model.onSend = { text in Task { @MainActor in if !(await client.send(["action": "say", "text": text])) { flash(notOpen) } } }
        client.listen()
    }

    /// Comes out of the notch: the panel appears tucked in, then springs open.
    private func show() {
        guard let panel else { return }
        if !panel.isVisible { panel.orderFrontRegardless() }
        DispatchQueue.main.async { self.model.present = true }
    }

    /// Tucks back into the notch, then the panel goes away.
    private func hide(then done: (() -> Void)? = nil) {
        model.writing = false
        model.present = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            guard let self, !self.model.present else { return }
            self.panel?.orderOut(nil)
            done?()
        }
    }

    /// Turned off in Settings: the app sends SIGTERM; leave with the exit animation.
    private var termSource: DispatchSourceSignal?
    private func leaveOnTerminate() {
        signal(SIGTERM, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        source.setEventHandler { [weak self] in
            guard let self else { exit(0) }
            self.hide { exit(0) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { exit(0) }
        }
        source.resume()
        termSource = source
    }

    /// The island is for when the person is elsewhere; in Open Design it steps aside.
    private func followFrontApp(_ app: NSRunningApplication?) {
        guard let panel else { return }
        if isOpenDesign(app) {
            hide()
        } else {
            show()
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        place()
        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in self?.place() }
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            self?.followFrontApp(note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication)
        }
        // Writing needs the keyboard: take it while open, give it back when closed.
        model.$writing.removeDuplicates().sink { [weak self] open in
            guard let panel = self?.panel else { return }
            if open { panel.makeKey() } else { panel.resignKey() }
        }.store(in: &watchers)
        connect()
        leaveOnTerminate()
        // Only the black shape takes clicks; around it they reach the menu bar.
        Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in self?.updateHitArea() }
        followFrontApp(NSWorkspace.shared.frontmostApplication)
    }

    /// The panel is as big as the expanded island and hangs from the top edge,
    /// centred on the notch; the folded pill fills only its top. Clicks in the
    /// empty part fall through (`ignoresMouseEvents` follows the hover state).
    private func place() {
        guard let screen = NotchGeometry.preferredScreen() else { return }
        let geometry = NotchGeometry(screen: screen)
        let size = IslandView.expandedSize
        let frame = NSRect(
            x: geometry.notch.midX - size.width / 2,
            y: screen.frame.maxY - size.height,
            width: size.width,
            height: size.height
        )
        notchSize = geometry.notch.size
        let view = IslandView(model: model, notch: geometry.notch.size)
        if let panel {
            panel.setFrame(frame, display: true)
            panel.contentView = IslandHostingView(rootView: view)
        } else {
            let panel = IslandPanel(contentRect: frame)
            panel.contentView = IslandHostingView(rootView: view)
            panel.orderFrontRegardless()
            SpaceLock.pin(panel)
            self.panel = panel
        }
        if CommandLine.arguments.contains("--print-geometry") {
            print("notch \(geometry.notch) hasNotch=\(geometry.hasNotch) panel \(frame)")
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()

/// The island never takes focus from the app in front, so every click is a
/// "first" click: it must act at once instead of only waking the window.
final class IslandHostingView<Content: View>: NSHostingView<Content> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}
