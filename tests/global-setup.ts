import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * Membuat database sementara khusus run ini, menjalankan seluruh migration dari
 * kosong (acceptance #50), lalu menghapus HANYA database sementara tersebut.
 */
export default async function setup() {
  const base = process.env.TEST_BASE_DATABASE_URL!;
  const runDb = process.env.TEST_RUN_DATABASE!;
  const runUrl = process.env.TEST_RUN_DATABASE_URL!;
  if (!/^tprm_test_run_\d+$/.test(runDb)) throw new Error("Nama database test tidak valid");

  const admin = new PrismaClient({ datasourceUrl: base });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${runDb}"`);
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: runUrl } });

  return async () => {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${runDb}" WITH (FORCE)`);
    await admin.$disconnect();
  };
}
