import type { Tx } from "./db";

/**
 * Nomor dokumen berurutan dan aman dari race condition (UPSERT atomik).
 * Contoh hasil: IPL-2026-000001.
 */
export async function nextNumber(tx: Tx, organizationId: string, prefix: string, date = new Date()) {
  const year = date.getFullYear();
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO counters ("organizationId", key, year, value)
    VALUES (${organizationId}, ${prefix}, ${year}, 1)
    ON CONFLICT ("organizationId", key, year)
    DO UPDATE SET value = counters.value + 1
    RETURNING value`;
  const value = Number(rows[0].value);
  return `${prefix}-${year}-${String(value).padStart(6, "0")}`;
}
