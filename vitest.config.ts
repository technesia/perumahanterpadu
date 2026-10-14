import { defineConfig } from "vitest/config";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// Test SELALU memakai TEST_DATABASE_URL (database terpisah yang di-reset).
function testDbUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (existsSync(".env")) {
    const m = readFileSync(".env", "utf8").match(/^TEST_DATABASE_URL="?([^"\n]+)"?/m);
    if (m) return m[1];
  }
  throw new Error("TEST_DATABASE_URL belum diset.");
}

// Setiap run memakai database sementara baru (dibuat & dihapus oleh global setup),
// sehingga migration selalu diuji dari database kosong.
const baseUrl = testDbUrl();
const runDb = `tprm_test_run_${Date.now()}`;
const runUrl = new URL(baseUrl);
runUrl.pathname = `/${runDb}`;
const url = runUrl.toString();
process.env.TEST_BASE_DATABASE_URL = baseUrl;
process.env.TEST_RUN_DATABASE = runDb;
process.env.TEST_RUN_DATABASE_URL = url;

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/server-only-stub.ts") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
    env: {
      DATABASE_URL: url,
      ORGANIZATION_SLUG: "taman-pesona-rajeg-mulya",
      SESSION_SECRET: "test-secret-test-secret-test-secret-00",
      STORAGE_DIR: "./storage-test",
      TZ: "UTC",
    },
  },
});
