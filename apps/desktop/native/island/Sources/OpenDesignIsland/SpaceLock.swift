import AppKit

// macOS animates every window, even "all Spaces" ones, during the three-finger
// swipe between Spaces, which made the island vanish and come back. Notch apps
// (boring.notch, NotchNook) avoid it by putting their window in a private
// SkyLight space above all others, which the swipe never moves. Private API:
// if a future macOS drops a symbol the island simply falls back to the normal
// behaviour (the calls are resolved at runtime with dlsym).
enum SpaceLock {
    private typealias MainConnection = @convention(c) () -> Int32
    private typealias SpaceCreate = @convention(c) (Int32, Int32, CFDictionary?) -> UInt64
    private typealias SpaceSetLevel = @convention(c) (Int32, UInt64, Int32) -> Int32
    private typealias ShowSpaces = @convention(c) (Int32, CFArray) -> Int32
    private typealias AddWindows = @convention(c) (Int32, CFArray, CFArray) -> Int32

    private static var space: UInt64 = 0

    static func pin(_ window: NSWindow) {
        guard let handle = dlopen("/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight", RTLD_LAZY),
              let mainSym = dlsym(handle, "SLSMainConnectionID"),
              let createSym = dlsym(handle, "SLSSpaceCreate"),
              let levelSym = dlsym(handle, "SLSSpaceSetAbsoluteLevel"),
              let showSym = dlsym(handle, "SLSShowSpaces"),
              let addSym = dlsym(handle, "SLSAddWindowsToSpaces")
        else { return }
        let connection = unsafeBitCast(mainSym, to: MainConnection.self)()
        if space == 0 {
            space = unsafeBitCast(createSym, to: SpaceCreate.self)(connection, 1, nil)
            _ = unsafeBitCast(levelSym, to: SpaceSetLevel.self)(connection, space, Int32.max)
            _ = unsafeBitCast(showSym, to: ShowSpaces.self)(connection, [NSNumber(value: space)] as CFArray)
        }
        _ = unsafeBitCast(addSym, to: AddWindows.self)(
            connection,
            [NSNumber(value: window.windowNumber)] as CFArray,
            [NSNumber(value: space)] as CFArray
        )
    }
}
