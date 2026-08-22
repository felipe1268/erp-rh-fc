import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The child process uses the production tsx loader because this project's
// Vitest/Vite transformer cannot import server/db.ts reliably. Its runner
// starts an isolated PostgreSQL instance and removes it after every execution.
describe("purchase automatic alert concurrency", () => {
  it("keeps each alert unique and sends quotation e-mail only once", () => {
    const runner = path.resolve(
      process.cwd(),
      "server/services/purchaseAutoJobs.concurrency.runner.ts",
    );
    expect(fs.existsSync(runner)).toBe(true);

    const proc = spawnSync("npx", ["tsx", runner], {
      encoding: "utf8",
      timeout: 120_000,
      env: { ...process.env, NODE_ENV: "test" },
    });

    const stdout = proc.stdout ?? "";
    const stderr = proc.stderr ?? "";
    const jsonLine = stdout
      .split("\n")
      .reverse()
      .find((line) => line.trim().startsWith("{"));
    const report = jsonLine ? JSON.parse(jsonLine) : null;

    if (proc.status !== 0 || !report || report.failures > 0) {
      throw new Error(
        `Purchase alert concurrency runner failed (exit=${proc.status}).\n` +
        `Failures: ${JSON.stringify(report?.results?.filter((result: any) => !result.ok) ?? [], null, 2)}\n` +
        `stderr (tail): ${stderr.slice(-2_000)}`,
      );
    }

    expect(report.failures).toBe(0);
    expect(report.total).toBeGreaterThanOrEqual(8);
  }, 150_000);
});