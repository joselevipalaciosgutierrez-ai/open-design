import AppKit
import SwiftUI

/// The app's monkey (AssistantMonkey.tsx), drawn from the same 40-unit
/// geometry and moved by the same motion model, so it is one character on the
/// notch and in the app. Its eyes follow the pointer anywhere on screen.
struct MonkeyView: NSViewRepresentable {
    var state: MonkeyState
    /// The speech engine's mouth while speaking (from the app), or nil.
    var mouthLevel: Double?
    var size: CGFloat

    func makeNSView(context: Context) -> MonkeyNSView { MonkeyNSView() }

    func updateNSView(_ view: MonkeyNSView, context: Context) {
        view.state = state
        view.mouthLevel = mouthLevel
        view.wake()
    }

    func sizeThatFits(_ proposal: ProposedViewSize, nsView: MonkeyNSView, context: Context) -> CGSize? {
        CGSize(width: size, height: size)
    }
}

/// Draws with Core Graphics, and, like the app's monkey, only animates while
/// something moves: at rest it sleeps and checks ten times a second for the
/// pointer, a state change, or the next blink.
final class MonkeyNSView: NSView {
    var state: MonkeyState = .idle
    var mouthLevel: Double?
    private let motion = MonkeyMotion()
    private var timer: Timer?
    private var awake = false
    private var lastMouse = NSPoint.zero
    private var lastMouseMove = 0.0
    private var lastState: MonkeyState = .idle

    override var isFlipped: Bool { true }
    // Only draws: the click goes to the button around it.
    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.backgroundColor = .clear
        schedule(awake: true)
    }

    required init?(coder: NSCoder) { fatalError() }

    private static func nowMs() -> Double { ProcessInfo.processInfo.systemUptime * 1000 }

    func wake() {
        if !awake { schedule(awake: true) }
    }

    private func schedule(awake: Bool) {
        self.awake = awake
        timer?.invalidate()
        let t = Timer(timeInterval: awake ? 1.0 / 60 : 0.1, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func tick() {
        let now = Self.nowMs()
        let mouse = NSEvent.mouseLocation
        if mouse != lastMouse { lastMouse = mouse; lastMouseMove = now }
        if !awake {
            if now - lastMouseMove < 100 || state != lastState || now >= motion.nextWake { schedule(awake: true) }
            return
        }
        lastState = state
        needsDisplay = true
        let settled = motion.moved < 0.004 && state != .speak && !motion.animatingGesture(now) && now - lastMouseMove > 600
        if settled { schedule(awake: false) }
    }

    private func cursorGaze() -> (Double, Double) {
        guard let window else { return (0, 0) }
        let centre = window.convertPoint(toScreen: convert(NSPoint(x: bounds.midX, y: bounds.midY), to: nil))
        return gazeToward(lastMouse.x - centre.x, centre.y - lastMouse.y)
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let cg = NSGraphicsContext.current?.cgContext else { return }
        let m = motion
        m.step(now: Self.nowMs(), state: state, target: cursorGaze(), level: state == .speak ? mouthLevel : nil)

        let white = CGColor(gray: 1, alpha: 1)
        let patch = CGColor(red: 0.871, green: 0.871, blue: 0.89, alpha: 1)
        let inner = CGColor(red: 0.831, green: 0.831, blue: 0.851, alpha: 1)
        let ink = CGColor(red: 0.078, green: 0.078, blue: 0.086, alpha: 1)
        let tongueColor = CGColor(red: 0.878, green: 0.498, blue: 0.525, alpha: 1)

        func circle(_ x: Double, _ y: Double, _ r: Double, _ color: CGColor) {
            cg.setFillColor(color)
            cg.fillEllipse(in: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
        }
        func around(_ cx: Double, _ cy: Double, _ transform: () -> Void, _ body: () -> Void) {
            cg.saveGState()
            cg.translateBy(x: cx, y: cy); transform(); cg.translateBy(x: -cx, y: -cy)
            body()
            cg.restoreGState()
        }

        cg.saveGState()
        let unit = bounds.width / 40
        cg.scaleBy(x: unit, y: unit)
        // The face sits inside the disc at 82%, as in the app; the head turns with the gaze.
        around(20, 20, { cg.scaleBy(x: 0.82, y: 0.82); cg.rotate(by: (m.gx * 8 + m.tilt) * .pi / 180) }) {
            around(6.5, 21, { cg.translateBy(x: 0, y: m.ear); cg.rotate(by: m.ear * -2 * .pi / 180); cg.scaleBy(x: m.earLS, y: m.earLS) }) {
                circle(6.5, 21, 6, white); circle(6.5, 21, 3, inner)
            }
            around(33.5, 21, { cg.translateBy(x: m.earRX, y: m.ear); cg.rotate(by: m.ear * 2 * .pi / 180); cg.scaleBy(x: m.earRS, y: m.earRS) }) {
                circle(33.5, 21, 6, white); circle(33.5, 21, 3, inner)
            }
            circle(20, 20, 15, white)

            cg.saveGState()
            cg.translateBy(x: m.gx * 2.4 + m.shift, y: m.gy * 2.2)
            circle(14.5, 18, 5.6, patch)
            circle(25.5, 18, 5.6, patch)
            cg.setFillColor(patch)
            cg.fillEllipse(in: CGRect(x: 11, y: 18.5, width: 18, height: 14))

            cg.setStrokeColor(ink)
            cg.setLineCap(.round)
            func brow(_ x0: Double, _ cx: Double, _ x1: Double, lift: Double, rot: Double) {
                around((x0 + x1) / 2, 12.9, { cg.translateBy(x: 0, y: lift); cg.rotate(by: rot * .pi / 180) }) {
                    cg.setLineWidth(0.9)
                    cg.move(to: CGPoint(x: x0, y: 13.4))
                    cg.addQuadCurve(to: CGPoint(x: x1, y: 13.4), control: CGPoint(x: cx, y: 12))
                    cg.strokePath()
                }
            }
            brow(11.6, 14.5, 17.4, lift: m.brow, rot: m.rotL)
            brow(22.6, 25.5, 28.4, lift: m.browR + m.browLift, rot: m.rotR)

            func eye(_ x: Double, closeBy: Double) {
                around(x, 18, { cg.translateBy(x: m.gx * 1.9, y: m.gy * 1.7); cg.scaleBy(x: m.eyeScale, y: m.eyeScale * closeBy) }) {
                    circle(x, 18, 2, ink)
                    circle(x + 0.7, 17.3, 0.6, white)
                }
            }
            eye(14.5, closeBy: m.blink)
            eye(25.5, closeBy: m.blink * m.winkScale)
            circle(18.3, 23, 0.7, ink)
            circle(21.7, 23, 0.7, ink)

            let geo = MouthGeometry(open: m.open, wide: m.wide, round: m.round)
            if geo.visible {
                let cavity = CGRect(x: 20 - geo.rx, y: geo.cy - geo.ry, width: geo.rx * 2, height: geo.ry * 2)
                cg.setFillColor(ink)
                cg.fillEllipse(in: cavity)
                cg.saveGState()
                cg.addEllipse(in: cavity); cg.clip()
                cg.setFillColor(tongueColor)
                cg.fillEllipse(in: CGRect(x: 20 - geo.tongueRx, y: geo.tongueCy - geo.tongueRy, width: geo.tongueRx * 2, height: geo.tongueRy * 2))
                cg.restoreGState()
            } else {
                cg.setLineWidth(1.5)
                switch m.mouthShape {
                case .smile: cg.move(to: CGPoint(x: 15.6, y: 27)); cg.addQuadCurve(to: CGPoint(x: 24.4, y: 27), control: CGPoint(x: 20, y: 30.4))
                case .smirk: cg.move(to: CGPoint(x: 16, y: 27.8)); cg.addQuadCurve(to: CGPoint(x: 24.6, y: 26.4), control: CGPoint(x: 20, y: 29.4))
                case .flat: cg.move(to: CGPoint(x: 16.5, y: 28)); cg.addLine(to: CGPoint(x: 23.5, y: 28))
                }
                cg.strokePath()
            }
            cg.restoreGState()
        }
        cg.restoreGState()
    }
}
