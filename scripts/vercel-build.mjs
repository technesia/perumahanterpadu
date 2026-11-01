// Build di Vercel (dipanggil otomatis lewat script "vercel-build").
// Production: jalankan migration + seed idempoten (sinkron permission) memakai koneksi LANGSUNG
// ke database (DIRECT_URL), karena DATABASE_URL di Vercel memakai pooler mode transaksi.
// Preview deployment tidak menyentuh database production.
import { execSync } from "node:child_process";

const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

if (process.env.VERCEL_ENV === "production") {
  const direct = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!direct) throw new Error("DATABASE_URL / DIRECT_URL belum diset di Environment Variables Vercel.");
  for (const k of ["SESSION_SECRET", "DATA_ENCRYPTION_KEY", "ORGANIZATION_SLUG"]) {
    if (!process.env[k]) throw new Error(`${k} belum diset di Environment Variables Vercel.`);
  }
  run("npx prisma migrate deploy", { DATABASE_URL: direct });
  run("npx tsx prisma/seed.ts", { DATABASE_URL: direct });
} else {
  console.log(`[vercel-build] VERCEL_ENV=${process.env.VERCEL_ENV ?? "-"}: migration & seed dilewati.`);
}
run("npx next build");
