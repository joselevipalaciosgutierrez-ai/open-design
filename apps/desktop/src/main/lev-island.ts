import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { app } from "electron";

const POLL_MS = 2000;
const BINARY = "OpenDesignIsland";

/**
 * Where the island helper (apps/desktop/native/island, a small SwiftUI app)
 * is: `OD_ISLAND_BIN`, next to the packaged app's resources, or the Swift
 * build output when running from the repository.
 */
export function resolveIslandBinary(env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates: string[] = [];
  if (env.OD_ISLAND_BIN) candidates.push(env.OD_ISLAND_BIN);
  if (process.resourcesPath) candidates.push(join(process.resourcesPath, BINARY));
  let dir = app.getAppPath();
  for (let i = 0; i < 6; i += 1) {
    candidates.push(join(dir, "native", "island", ".build", "release", BINARY));
    candidates.push(join(dir, "apps", "desktop", "native", "island", ".build", "release", BINARY));
    dir = dirname(dir);
  }
  return candidates.find((file) => existsSync(file)) ?? null;
}

/**
 * Keeps Lev Island in step with the `levIsland` setting: started when it is
 * on, asked to leave (it animates back into the notch, then exits) when it is
 * turned off, and stopped with the app. macOS only.
 */
export function startLevIsland(discoverDaemonUrl: () => Promise<string | null>): () => void {
  if (process.platform !== "darwin") return () => {};
  let child: ChildProcess | null = null;
  let stopped = false;

  const stopChild = () => {
    child?.kill("SIGTERM");
    child = null;
  };

  const tick = async () => {
    if (stopped) return;
    try {
      const base = await discoverDaemonUrl();
      if (!base) return;
      const response = await fetch(new URL("/api/app-config", base));
      if (!response.ok) return;
      const { config } = (await response.json()) as { config?: { levIsland?: boolean } };
      const wanted = config?.levIsland === true;
      if (wanted && !child) {
        const binary = resolveIslandBinary();
        if (!binary) return;
        const started = spawn(binary, ["--daemon-url", base], { stdio: "ignore" });
        started.on("exit", () => {
          if (child === started) child = null;
        });
        started.on("error", () => {
          if (child === started) child = null;
        });
        child = started;
      } else if (!wanted && child) {
        stopChild();
      }
    } catch {
      // The daemon is restarting; try again on the next tick.
    }
  };

  const timer = setInterval(() => void tick(), POLL_MS);
  void tick();
  app.on("will-quit", stopChild);
  return () => {
    stopped = true;
    clearInterval(timer);
    stopChild();
  };
}
