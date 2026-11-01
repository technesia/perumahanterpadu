import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * URL database. DATABASE_URL diutamakan; bila kosong, memakai POSTGRES_PRISMA_URL yang diisi otomatis
 * oleh integrasi Supabase–Vercel (koneksi pooler untuk serverless).
 */
const datasourceUrl = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || undefined;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ datasourceUrl, log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
