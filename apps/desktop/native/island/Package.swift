// swift-tools-version: 5.9
// Open Design's island: a small native companion that lives on the MacBook
// notch (talk to Lev, write to Lev, see notifications). See README.md.
import PackageDescription

let package = Package(
    name: "OpenDesignIsland",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "OpenDesignIsland", path: "Sources/OpenDesignIsland"),
    ]
)
