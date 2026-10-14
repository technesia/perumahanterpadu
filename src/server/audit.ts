import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "./db";

const SENSITIVE_KEY = /pass(word)?|token|secret|hash|nik|idnumber|accessurl/i;

/** Hapus nilai sensitif dari metadata sebelum disimpan ke audit log. */
export function sanitizeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeMetadata);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[disamarkan]" : sanitizeMetadata(v);
    }
    return out;
  }
  return value;
}

export interface AuditInput {
  action: string;
  module: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  status?: "SUCCESS" | "FAILED";
}

/** Audit log append-only; tidak ada fungsi update/delete di codebase. */
export async function writeAudit(
  actor: { organizationId: string; userId: string | null; name: string; primaryRole: string; ip?: string | null },
  input: AuditInput,
  tx: Tx = prisma,
) {
  await tx.auditLog.create({
    data: {
      organizationId: actor.organizationId,
      userId: actor.userId,
      userName: actor.name,
      userRole: actor.primaryRole,
      action: input.action,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      status: input.status ?? "SUCCESS",
      ipAddress: actor.ip ?? null,
      metadata: input.metadata
        ? (sanitizeMetadata(input.metadata) as Prisma.InputJsonValue)
        : undefined,
    },
  });
}
