import Foundation

// The app's monkey motion (apps/web/src/runtime/assistant/monkey-motion.ts),
// ported line for line so the island's monkey is the same character: the same
// poses, blinks, winks, syllable mouth and easing. Keep the two in step.

enum MonkeyState: String {
    case idle, listen, think, speak, surprise, wink
}

enum MouthShape { case smile, flat, smirk }

struct MonkeyPose {
    var brow: Double
    var browRight: Double? = nil
    var browRotLeft: Double
    var browRotRight: Double
    var ear: Double
    var eyeScale: Double
    var look: (Double, Double)? = nil
    var lookBias: (Double, Double)? = nil
    var headTilt: Double = 0
    var faceShift: Double = 0
    var earScaleLeft: Double = 1
    var earScaleRight: Double = 1
    var earShiftRight: Double = 0
    var mouth: MouthShape
    var talk = false
    var round = false
}

let POSES: [MonkeyState: MonkeyPose] = [
    .idle: MonkeyPose(brow: 0, browRotLeft: 0, browRotRight: 0, ear: 0, eyeScale: 1, mouth: .smile),
    .listen: MonkeyPose(brow: -1.3, browRotLeft: 0, browRotRight: 0, ear: -1.5, eyeScale: 1.05, look: (-0.5, 0.1),
                        headTilt: -10, faceShift: -2.4, earScaleLeft: 0.9, earScaleRight: 1.2, earShiftRight: 1.1, mouth: .smile),
    .think: MonkeyPose(brow: -1.5, browRight: 0.4, browRotLeft: -10, browRotRight: 3, ear: 0, eyeScale: 1, lookBias: (0.35, -0.5), mouth: .smirk),
    .speak: MonkeyPose(brow: -0.4, browRotLeft: 0, browRotRight: 0, ear: 0, eyeScale: 1, mouth: .smile, talk: true),
    .surprise: MonkeyPose(brow: -2.6, browRotLeft: 0, browRotRight: 0, ear: -2.2, eyeScale: 1.3, look: (0, 0), mouth: .smile, round: true),
    .wink: MonkeyPose(brow: -0.3, browRotLeft: 0, browRotRight: 0, ear: 0, eyeScale: 1, mouth: .smirk),
]

func damp(_ current: Double, _ target: Double, _ rate: Double, _ dt: Double) -> Double {
    current + (target - current) * (1 - exp(-rate * dt))
}

func blinkScale(_ elapsedMs: Double) -> Double {
    elapsedMs >= 0 && elapsedMs < 150 ? 1 - 0.92 * sin((elapsedMs / 150) * .pi) : 1
}

func nextBlinkAt(_ now: Double) -> Double { now + 3000 + Double.random(in: 0..<1) * 3500 }
func nextGestureAt(_ now: Double) -> Double { now + 18000 + Double.random(in: 0..<1) * 22000 }

func leanedGaze(_ gaze: (Double, Double), _ bias: (Double, Double), follow: Double = 0.7) -> (Double, Double) {
    let clamp = { (v: Double) in max(-1, min(1, v)) }
    return (clamp(gaze.0 * follow + bias.0), clamp(gaze.1 * follow + bias.1))
}

func gazeToward(_ dx: Double, _ dy: Double) -> (Double, Double) {
    let dist = hypot(dx, dy) == 0 ? 1 : hypot(dx, dy)
    let k = min(1, dist / 160)
    return ((dx / dist) * k, (dy / dist) * k)
}

/// Syllables, not a sine wave: 170–300 ms each, a breath every 4–6.
final class SyllableMouth {
    private var open = 0.0, wide = 0.0, until = 0.0, count = 0
    private var pauseEvery = 4 + Int.random(in: 0..<3)
    func reset() { open = 0; wide = 0; until = 0; count = 0; pauseEvery = 4 + Int.random(in: 0..<3) }
    func sample(_ now: Double) -> (open: Double, wide: Double) {
        if now >= until {
            count += 1
            if count % pauseEvery == 0 {
                open = 0; wide = 0
                until = now + 260 + Double.random(in: 0..<1) * 260
                pauseEvery = 4 + Int.random(in: 0..<3)
            } else {
                open = 0.28 + Double.random(in: 0..<1) * 0.62
                wide = Double.random(in: 0..<1) * 2 - 1
                until = now + 170 + Double.random(in: 0..<1) * 130
            }
        }
        return (open, wide)
    }
}

struct MouthGeometry {
    let visible: Bool
    let rx, ry, cy: Double
    let tongueRx, tongueRy, tongueCy: Double
    init(open: Double, wide: Double, round: Bool) {
        ry = 0.6 + open * 3.3
        rx = round ? 2.3 : 2.5 + (wide + 1) * 0.75
        cy = 27.4 + ry * 0.45
        visible = open > 0.06
        tongueRx = rx * 0.66; tongueRy = ry * 0.5; tongueCy = cy + ry * 0.52
    }
}

/// Where every part of the face is right now; `step` moves it one frame.
final class MonkeyMotion {
    var brow = 0.0, browR = 0.0, rotL = 0.0, rotR = 0.0, ear = 0.0, eyeScale = 1.0
    var gx = 0.0, gy = 0.0, open = 0.0, wide = 0.0, winkScale = 1.0
    var tilt = 0.0, shift = 0.0, earLS = 1.0, earRS = 1.0, earRX = 0.0
    var blink = 1.0
    var mouthShape: MouthShape = .smile
    var round = false

    private var last: Double? = nil
    private var blinkAt = 0.0, blinkStart = -1e9, gestureAt = 0.0, winkUntil = 0.0
    private var lastState: MonkeyState = .idle
    private let mouth = SyllableMouth()

    /// - Parameters: `now` in ms; `target` the cursor gaze (-1…1); `level` the speech engine's mouth, or nil.
    /// How much the face moved in the last step; near zero means it can sleep.
    private(set) var moved = 0.0
    var nextWake: Double { min(blinkAt, gestureAt) }
    var animatingGesture: (Double) -> Bool { { now in now < self.winkUntil || now - self.blinkStart < 200 } }

    func step(now: Double, state: MonkeyState, target: (Double, Double), level: Double?) {
        let before = gx + gy + brow + browR + rotL + rotR + ear + eyeScale + winkScale + tilt + shift + earLS + earRS + earRX + open + wide
        if last == nil { blinkAt = nextBlinkAt(now); gestureAt = nextGestureAt(now) }
        let dt = min(0.05, max(0, (now - (last ?? now)) / 1000))
        last = now
        let pose = POSES[state]!
        if state != lastState {
            if state == .wink { winkUntil = now + 900 }
            if state == .speak { mouth.reset() }
            lastState = state
        }
        if state == .idle && now > gestureAt { winkUntil = now + 520; gestureAt = nextGestureAt(now) }
        if now > blinkAt { blinkStart = now; blinkAt = nextBlinkAt(now) }
        blink = blinkScale(now - blinkStart)
        let winking = now < winkUntil

        let gaze = pose.look ?? (pose.lookBias.map { leanedGaze(target, $0) } ?? target)
        gx = damp(gx, gaze.0, 9, dt)
        gy = damp(gy, gaze.1, 9, dt)
        brow = damp(brow, pose.brow, 12, dt)
        browR = damp(browR, pose.browRight ?? pose.brow, 12, dt)
        rotL = damp(rotL, pose.browRotLeft, 12, dt)
        rotR = damp(rotR, pose.browRotRight, 12, dt)
        ear = damp(ear, pose.ear, 10, dt)
        eyeScale = damp(eyeScale, pose.eyeScale, 14, dt)
        winkScale = damp(winkScale, winking ? 0.08 : 1, 30, dt)
        tilt = damp(tilt, pose.headTilt, 7, dt)
        shift = damp(shift, pose.faceShift, 7, dt)
        earLS = damp(earLS, pose.earScaleLeft, 8, dt)
        earRS = damp(earRS, pose.earScaleRight, 8, dt)
        earRX = damp(earRX, pose.earShiftRight, 8, dt)

        var openTarget = 0.0, wideTarget = 0.0
        if pose.talk {
            if let level { openTarget = level } else { let s = mouth.sample(now); openTarget = s.open; wideTarget = s.wide }
        } else if pose.round {
            openTarget = 0.7; wideTarget = -1
        }
        open = damp(open, openTarget, pose.talk ? 15 : 12, dt)
        wide = damp(wide, wideTarget, 12, dt)
        mouthShape = pose.mouth
        round = pose.round
        browLift = winking ? 0.8 : 0
        moved = abs((gx + gy + brow + browR + rotL + rotR + ear + eyeScale + winkScale + tilt + shift + earLS + earRS + earRX + open + wide) - before)
    }

    var browLift = 0.0
}
