import { prisma } from "../db";

const WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_KEY = 10;

/**
 * Rate limiting berbasis database (tetap berlaku walau aplikasi berjalan di
 * beberapa instance). Key berupa `ip:<ip>` atau `id:<identifier>`.
 */
export async function isRateLimited(keys: string[]): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const counts = await prisma.loginAttempt.groupBy({
    by: ["key"],
    where: { key: { in: keys }, success: false, createdAt: { gte: since } },
    _count: { _all: true },
  });
  return counts.some((c) => c._count._all >= MAX_FAILURES_PER_KEY);
}

export async function recordAttempt(keys: string[], success: boolean) {
  await prisma.loginAttempt.createMany({ data: keys.map((key) => ({ key, success })) });
}

export async function pruneAttempts() {
  await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } },
  });
}
