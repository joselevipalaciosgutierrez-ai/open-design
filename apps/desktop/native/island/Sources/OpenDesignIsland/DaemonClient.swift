import Foundation

/// What the app reports for the island (contracts/api/island.ts `IslandState`).
struct IslandState: Decodable, Equatable {
    var appConnected = false
    var phase = "idle"
    var monkey = "idle"
    var mouth: Double? = nil
    var reply: String? = nil
    var notice: String? = nil
}

/// The island's only line to Open Design: the daemon's `/api/island` relay.
/// It sends the person's clicks and words and listens for the app's state.
/// The island never runs Lev or the voice itself, so both stay one thing.
final class DaemonClient {
    let base: URL
    var onState: (IslandState) -> Void = { _ in }

    init(base: URL) { self.base = base }

    /// The daemon's address: `--daemon-url <url>`, else `OD_DAEMON_URL`.
    static func resolveBase() -> URL? {
        let args = CommandLine.arguments
        if let i = args.firstIndex(of: "--daemon-url"), i + 1 < args.count { return URL(string: args[i + 1]) }
        if let env = ProcessInfo.processInfo.environment["OD_DAEMON_URL"] { return URL(string: env) }
        return nil
    }

    /// Returns whether the app was there to act on it.
    @discardableResult
    func send(_ body: [String: String]) async -> Bool {
        var request = URLRequest(url: base.appendingPathComponent("api/island/command"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        guard let (data, _) = try? await URLSession.shared.data(for: request),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return json["delivered"] as? Bool ?? false
    }

    /// Follows the state stream for as long as the island runs, reconnecting when the daemon restarts.
    func listen() {
        Task.detached { [weak self] in
            while let self {
                await self.readStream()
                await MainActor.run { self.onState(IslandState()) }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
    }

    private func readStream() async {
        var request = URLRequest(url: base.appendingPathComponent("api/island/events"))
        request.timeoutInterval = 3600
        guard let (bytes, response) = try? await URLSession.shared.bytes(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return }
        do {
            for try await line in bytes.lines {
                guard line.hasPrefix("data:") else { continue }
                let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                if let data = payload.data(using: .utf8), let state = try? JSONDecoder().decode(IslandState.self, from: data) {
                    await MainActor.run { self.onState(state) }
                }
            }
        } catch {}
    }
}
