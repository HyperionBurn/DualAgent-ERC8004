import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface LockMetadata {
  pid: number;
  startedAt: string;
  serviceName: string;
  host: string;
  cwd: string;
}

export interface SingleInstanceLock {
  lockFilePath: string;
  release: () => void;
}

export interface SingleInstanceLockSnapshot {
  lockFilePath: string;
  exists: boolean;
  metadata: LockMetadata | null;
  isRunning: boolean;
}

export interface StopSingleInstanceResult {
  serviceName: string;
  lockFilePath: string;
  pid: number | null;
  stopped: boolean;
  message: string;
}

function parseLockMetadata(lockFilePath: string): LockMetadata | null {
  try {
    const raw = fs.readFileSync(lockFilePath, "utf8");
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw) as Partial<LockMetadata>;
    if (!Number.isInteger(parsed.pid)) return null;

    return {
      pid: Number(parsed.pid),
      startedAt: String(parsed.startedAt || ""),
      serviceName: String(parsed.serviceName || ""),
      host: String(parsed.host || ""),
      cwd: String(parsed.cwd || ""),
    };
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // ESRCH means the process does not exist, everything else is treated as alive.
    return code !== "ESRCH";
  }
}

function buildLockMetadata(serviceName: string): LockMetadata {
  return {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    serviceName,
    host: os.hostname(),
    cwd: process.cwd(),
  };
}

function lockFileForService(serviceName: string): string {
  const lockDir = path.join(process.cwd(), ".runtime-locks");
  fs.mkdirSync(lockDir, { recursive: true });
  return path.join(lockDir, `${serviceName}.lock`);
}

function writeLockFile(lockFilePath: string, metadata: LockMetadata): void {
  const fd = fs.openSync(lockFilePath, "wx");
  try {
    fs.writeFileSync(fd, JSON.stringify(metadata, null, 2), { encoding: "utf8" });
  } finally {
    fs.closeSync(fd);
  }
}

function removeStaleLockIfPossible(lockFilePath: string): boolean {
  const metadata = parseLockMetadata(lockFilePath);
  if (metadata && isProcessAlive(metadata.pid)) {
    return false;
  }

  try {
    fs.unlinkSync(lockFilePath);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function getSingleInstanceLockSnapshot(serviceName: string): SingleInstanceLockSnapshot {
  const lockFilePath = lockFileForService(serviceName);
  if (!fs.existsSync(lockFilePath)) {
    return {
      lockFilePath,
      exists: false,
      metadata: null,
      isRunning: false,
    };
  }

  const metadata = parseLockMetadata(lockFilePath);
  if (!metadata) {
    removeStaleLockIfPossible(lockFilePath);
    return {
      lockFilePath,
      exists: fs.existsSync(lockFilePath),
      metadata: null,
      isRunning: false,
    };
  }

  const isRunning = isProcessAlive(metadata.pid);
  if (!isRunning) {
    removeStaleLockIfPossible(lockFilePath);
  }

  return {
    lockFilePath,
    exists: fs.existsSync(lockFilePath),
    metadata,
    isRunning,
  };
}

export async function stopSingleInstanceService(serviceName: string, timeoutMs = 5000): Promise<StopSingleInstanceResult> {
  const snapshot = getSingleInstanceLockSnapshot(serviceName);

  if (!snapshot.metadata) {
    return {
      serviceName,
      lockFilePath: snapshot.lockFilePath,
      pid: null,
      stopped: false,
      message: `${serviceName} is not running.`,
    };
  }

  const pid = snapshot.metadata.pid;
  if (pid === process.pid) {
    return {
      serviceName,
      lockFilePath: snapshot.lockFilePath,
      pid,
      stopped: false,
      message: `Refusing to stop the current ${serviceName} process.`,
    };
  }

  if (!snapshot.isRunning) {
    removeStaleLockIfPossible(snapshot.lockFilePath);
    return {
      serviceName,
      lockFilePath: snapshot.lockFilePath,
      pid,
      stopped: false,
      message: `${serviceName} is already stopped.`,
    };
  }

  try {
    process.kill(pid);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") {
      removeStaleLockIfPossible(snapshot.lockFilePath);
      return {
        serviceName,
        lockFilePath: snapshot.lockFilePath,
        pid,
        stopped: true,
        message: `${serviceName} was already stopped.`,
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      serviceName,
      lockFilePath: snapshot.lockFilePath,
      pid,
      stopped: false,
      message: `[lock] Failed to stop ${serviceName} (pid ${pid}): ${message}`,
    };
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      try {
        fs.unlinkSync(snapshot.lockFilePath);
      } catch {
        // Ignore cleanup failures after a successful stop.
      }

      return {
        serviceName,
        lockFilePath: snapshot.lockFilePath,
        pid,
        stopped: true,
        message: `${serviceName} stopped successfully.`,
      };
    }

    await delay(100);
  }

  if (!isProcessAlive(pid)) {
    try {
      fs.unlinkSync(snapshot.lockFilePath);
    } catch {
      // Ignore cleanup failures after a successful stop.
    }

    return {
      serviceName,
      lockFilePath: snapshot.lockFilePath,
      pid,
      stopped: true,
      message: `${serviceName} stopped successfully.`,
    };
  }

  return {
    serviceName,
    lockFilePath: snapshot.lockFilePath,
    pid,
    stopped: false,
    message: `${serviceName} is still running after the stop signal.`,
  };
}

export function acquireSingleInstanceLock(serviceName: string): SingleInstanceLock {
  const lockFilePath = lockFileForService(serviceName);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeLockFile(lockFilePath, buildLockMetadata(serviceName));

      let released = false;
      const cleanup = () => {
        if (released) return;
        released = true;
        try {
          fs.unlinkSync(lockFilePath);
        } catch {
          // Ignore cleanup failures on shutdown.
        }
      };

      const onExit = () => cleanup();
      process.once("exit", onExit);

      return {
        lockFilePath,
        release: () => {
          process.removeListener("exit", onExit);
          cleanup();
        },
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        throw new Error(`[lock] Failed to acquire ${serviceName} lock: ${(error as Error).message}`);
      }

      if (attempt === 0 && removeStaleLockIfPossible(lockFilePath)) {
        continue;
      }

      const holder = parseLockMetadata(lockFilePath);
      const holderInfo = holder
        ? `pid=${holder.pid} host=${holder.host || "unknown"} startedAt=${holder.startedAt || "unknown"}`
        : "unknown holder";

      throw new Error(
        `[lock] ${serviceName} is already running (${holderInfo}). If this is stale, stop that process and retry. Lock file: ${lockFilePath}`
      );
    }
  }

  throw new Error(`[lock] Unable to acquire ${serviceName} lock`);
}
