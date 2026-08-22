import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Rev. 5103 - The child process runs the validation through the tsx loader
// because this project's Vitest/Vite transformer cannot import server modules
// reliably (same rationale as purchaseAutoJobs.concurrency.test.ts). The runner
// asserts the advisory-lock serialization invariants and exits non-zero on any
// failure.
describe("socio administrador lock serialization", () => {
  it("serializes all socio-related writes with one company-scoped xact lock", () => {
    const runner = path.resolve(
      process.cwd(),
      "server/services/socioAdminLock.concurrency.runner.ts",
    );
    expect(fs.existsSync(runner)).toBe(true);

    const proc = spawnSync("npx", ["tsx", runner], {
      encoding: "utf8",
      timeout: 120_000,
      env: { ...process.env, NODE_ENV: "test" },
    });

    const stdout = proc.stdout ?? "";
    const stderr = proc.stderr ?? "";
    const passed = stdout.includes("socioAdminLock concurrency invariants: ALL PASSED");

    if (proc.status !== 0 || !passed) {
      throw new Error(
        `socioAdminLock concurrency runner failed (exit=${proc.status}).\n` +
        `stdout (tail): ${stdout.slice(-2_000)}\n` +
        `stderr (tail): ${stderr.slice(-2_000)}`,
      );
    }

    expect(proc.status).toBe(0);
    expect(passed).toBe(true);
  }, 150_000);
});
