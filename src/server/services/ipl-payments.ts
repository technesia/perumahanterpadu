import { z } from "zod";
import type { IplPaymentStatus, Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { assertCan, can, type AuthContext } from "../auth/context";
import { AppError, ConflictError, ForbiddenError, NotFoundError } from "../errors";
import { writeAudit } from "../audit";
import { nextNumber } from "../counters";
import { storeFile, type UploadInput } from "../storage";
import { optionalText, pageParams } from "../validation";
import { notifyPermissionHolders, notifyUser } from "./notifications";
import { PENDING_PAYMENT_STATUSES, residentUnits } from "./ipl";
import { getQrisProvider, type QrisWebhookEvent } from "../payments/qris";
import { applyAllocation, outstanding } from "@/lib/ipl";
import { periodLabel, rupiah } from "@/lib/format";
import { todayDate } from "@/lib/dates";

export const submitPaymentSchema = z.object({
  residentId: z.string().max(40).optional(),
  unitId: z.string().min(1, "Rumah wajib dipilih.").max(40),
  billIds: z.array(z.string().max(40)).min(1, "Pilih minimal satu periode.").max(120),
  amounts: z.record(z.coerce.number().int().positive()).optional(),
  method: z.enum(["CASH", "BANK_TRANSFER", "QRIS"], { errorMap: () => ({ message: "Metode pembayaran wajib dipilih." }) }),
  notes: optionalText(500),
  idempotencyKey: z.string().max(64).optional(),
});
export type SubmitPaymentInput = z.input<typeof submitPaymentSchema>;

type LockedBill = { id: string; unitId: string; amount: number; paidAmount: number; status: string; periodYear: number; periodMonth: number; organizationId: string };

async function lockBills(tx: Tx, ids: string[]) {
  return tx.$queryRaw<LockedBill[]>`
    SELECT id, "unitId", amount, "paidAmount", status::text AS status, "periodYear", "periodMonth", "organizationId"
    FROM ipl_bills WHERE id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;
}

/**
 * Mengajukan pembayaran IPL. Status awal selalu Menunggu Verifikasi (manual) atau
 * Menunggu Konfirmasi Provider (QRIS). Tidak pernah langsung Lunas.
 */
export async function submitPayment(ctx: AuthContext, input: SubmitPaymentInput, proof: UploadInput | null) {
  const data = submitPaymentSchema.parse(input);
  const staff = can(ctx, "ipl.payment_record");
  if (!staff) assertCan(ctx, "ipl.payment_submit");

  // Identitas warga: Member selalu dirinya sendiri — residentId dari request diabaikan.
  const residentId = staff ? data.residentId : ctx.residentId;
  if (!residentId) {
    throw new AppError(staff ? "Warga wajib dipilih." : "Akun Anda belum terhubung dengan data warga. Hubungi pengurus.", "VALIDATION", { residentId: "Warga wajib dipilih." });
  }
  const resident = await prisma.resident.findFirst({ where: { id: residentId, organizationId: ctx.organizationId, archivedAt: null } });
  if (!resident) throw new AppError("Warga tidak ditemukan.", "VALIDATION", { residentId: "Warga tidak ditemukan." });
  const units = await residentUnits(ctx.organizationId, residentId);
  if (!units.some((u) => u.id === data.unitId)) throw new AppError("Rumah tidak terhubung dengan warga ini.", "VALIDATION", { unitId: "Rumah tidak valid." });

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
  if (data.method === "BANK_TRANSFER" && !proof) {
    throw new AppError("Bukti transfer wajib diunggah.", "VALIDATION", { proof: "Bukti transfer wajib diunggah." });
  }
  const qris = data.method === "QRIS" ? getQrisProvider() : null;
  if (data.method === "QRIS" && !qris) {
    throw new AppError("Pembayaran QRIS belum aktif. Silakan gunakan transfer bank dengan bukti transfer.", "VALIDATION", { method: "QRIS belum tersedia." });
  }
  if (data.idempotencyKey) {
    const dup = await prisma.iplPayment.findUnique({ where: { organizationId_idempotencyKey: { organizationId: ctx.organizationId, idempotencyKey: data.idempotencyKey } } });
    if (dup) return dup;
  }

  const billIds = [...new Set(data.billIds)];
  const payment = await prisma.$transaction(async (tx) => {
    const bills = await lockBills(tx, billIds);
    if (bills.length !== billIds.length || bills.some((b) => b.organizationId !== ctx.organizationId || b.unitId !== data.unitId)) {
      throw new AppError("Periode tagihan tidak valid untuk rumah ini.", "VALIDATION", { billIds: "Periode tidak valid." });
    }
    const pending = await tx.iplPaymentAllocation.findMany({
      where: { billId: { in: billIds }, payment: { status: { in: [...PENDING_PAYMENT_STATUSES] } } },
      select: { billId: true },
    });
    const allocations: { billId: string; amount: number }[] = [];
    for (const b of bills) {
      const label = periodLabel(b.periodYear, b.periodMonth);
      if (b.status === "PAID") throw new ConflictError(`Periode ${label} sudah lunas.`);
      if (b.status === "VOID") throw new ConflictError(`Tagihan periode ${label} telah dibatalkan.`);
      if (pending.some((p) => p.billId === b.id)) throw new ConflictError(`Periode ${label} sedang menunggu verifikasi pembayaran lain.`);
      const remaining = outstanding(b);
      const requested = data.amounts?.[b.id] ?? remaining;
      if (requested !== remaining) {
        if (!org.allowPartialPayment) throw new AppError(`Nominal periode ${label} harus ${rupiah(remaining)} (pembayaran parsial tidak diizinkan).`);
        if (requested > remaining) throw new AppError(`Nominal periode ${label} melebihi sisa tagihan ${rupiah(remaining)}.`);
      }
      allocations.push({ billId: b.id, amount: requested });
    }
    const total = allocations.reduce((s, a) => s + a.amount, 0);
    const number = await nextNumber(tx, ctx.organizationId, "IPL");
    const status: IplPaymentStatus = data.method === "QRIS" ? "AWAITING_PROVIDER" : "PENDING_VERIFICATION";
    const p = await tx.iplPayment.create({
      data: {
        organizationId: ctx.organizationId, number, unitId: data.unitId, residentId, submittedById: ctx.userId,
        method: data.method, totalAmount: total, status, notes: data.notes, idempotencyKey: data.idempotencyKey ?? null,
        allocations: { create: allocations },
        histories: { create: { toStatus: status, actorId: ctx.userId, note: "Pengajuan dibuat" } },
      },
    });
    if (proof) {
      const file = await storeFile(tx, ctx.organizationId, proof, "ipl-proof", ctx.userId);
      await tx.iplPaymentProof.create({ data: { paymentId: p.id, fileId: file.id } });
    }
    const periods = bills.map((b) => periodLabel(b.periodYear, b.periodMonth)).join(", ");
    await writeAudit(ctx, {
      action: "IPL_PAYMENT_SUBMITTED", module: "ipl", entityType: "IplPayment", entityId: p.id,
      summary: `Pengajuan pembayaran ${number} ${rupiah(total)} untuk ${resident.fullName} (${periods})${proof ? " dengan bukti transfer" : ""}`,
      metadata: { method: data.method, periods: bills.length },
    }, tx);
    await notifyPermissionHolders(tx, ctx.organizationId, "ipl.payment_verify", {
      type: "IPL_PAYMENT_PENDING", title: "Pembayaran IPL menunggu verifikasi",
      body: `${resident.fullName} — ${rupiah(total)} (${bills.length} periode)`, link: `/ipl/pembayaran/${p.id}`,
    }, ctx.userId);
    return p;
  });

  if (qris) {
    try {
      const charge = await qris.createCharge({ orderId: payment.number, amount: payment.totalAmount });
      return prisma.iplPayment.update({ where: { id: payment.id }, data: { providerName: qris.name, providerTransactionId: charge.providerTransactionId } });
    } catch {
      await prisma.iplPayment.update({ where: { id: payment.id }, data: { status: "FAILED", histories: { create: { fromStatus: "AWAITING_PROVIDER", toStatus: "FAILED", note: "Gagal membuat transaksi QRIS" } } } });
      throw new AppError("Gagal membuat transaksi QRIS. Silakan coba lagi.");
    }
  }
  return payment;
}

async function lockPayment(tx: Tx, organizationId: string, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ipl_payments WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;
  if (!rows.length) throw new NotFoundError("Pembayaran tidak ditemukan.");
  return tx.iplPayment.findUniqueOrThrow({
    where: { id },
    include: { allocations: true, resident: { select: { fullName: true, userId: true } } },
  });
}

type ActorLike = { organizationId: string; userId: string | null; name: string; primaryRole: string };

/** Melunasi alokasi & mencatat pemasukan kas satu kali. Dipakai verifikasi manual dan webhook QRIS. */
async function settle(tx: Tx, payment: Awaited<ReturnType<typeof lockPayment>>, actor: ActorLike, note: string | null) {
  const bills = await lockBills(tx, payment.allocations.map((a) => a.billId));
  for (const a of payment.allocations) {
    const b = bills.find((x) => x.id === a.billId)!;
    if (b.status === "VOID") throw new ConflictError(`Tagihan periode ${periodLabel(b.periodYear, b.periodMonth)} telah dibatalkan.`);
    let next;
    try {
      next = applyAllocation(b, a.amount);
    } catch {
      throw new ConflictError(`Periode ${periodLabel(b.periodYear, b.periodMonth)} sudah terbayar oleh transaksi lain.`);
    }
    await tx.iplBill.update({ where: { id: b.id }, data: { ...next, paidAt: next.status === "PAID" ? new Date() : null } });
  }
  const now = new Date();
  const updated = await tx.iplPayment.update({
    where: { id: payment.id },
    data: {
      status: "APPROVED", verifiedAt: now, verifiedById: actor.userId, paidAt: payment.paidAt ?? now,
      histories: { create: { fromStatus: payment.status, toStatus: "APPROVED", note, actorId: actor.userId } },
    },
  });
  const category = await tx.financeCategory.findUniqueOrThrow({
    where: { organizationId_code: { organizationId: payment.organizationId, code: "INC_IPL" } },
  });
  await tx.financeTransaction.create({
    data: {
      organizationId: payment.organizationId,
      number: await nextNumber(tx, payment.organizationId, "KM"),
      type: "INCOME", source: "IPL_PAYMENT", categoryId: category.id, date: todayDate(now),
      description: `Pembayaran IPL ${payment.number} — ${payment.resident.fullName}`,
      amount: payment.totalAmount, method: payment.method, reference: payment.number,
      iplPaymentId: payment.id, createdById: actor.userId,
    },
  });
  return updated;
}

export async function approvePayment(ctx: AuthContext, paymentId: string, note?: string) {
  assertCan(ctx, "ipl.payment_verify");
  return prisma.$transaction(async (tx) => {
    const p = await lockPayment(tx, ctx.organizationId, paymentId);
    if (p.status !== "PENDING_VERIFICATION") throw new ConflictError("Pembayaran ini sudah diproses.");
    if (p.submittedById === ctx.userId && p.residentId === ctx.residentId) throw new ForbiddenError("Anda tidak dapat memverifikasi pembayaran milik sendiri.");
    const updated = await settle(tx, p, ctx, note?.trim() || null);
    await writeAudit(ctx, {
      action: "IPL_PAYMENT_APPROVED", module: "ipl", entityType: "IplPayment", entityId: p.id,
      summary: `Menyetujui pembayaran ${p.number} ${rupiah(p.totalAmount)} (${p.resident.fullName})`,
    }, tx);
    if (p.resident.userId) {
      await notifyUser(tx, ctx.organizationId, p.resident.userId, {
        type: "IPL_PAYMENT_APPROVED", title: "Pembayaran IPL disetujui", body: `${p.number} — ${rupiah(p.totalAmount)}`, link: "/riwayat-pembayaran",
      });
    }
    return updated;
  });
}

export async function rejectPayment(ctx: AuthContext, paymentId: string, reason: string) {
  assertCan(ctx, "ipl.payment_verify");
  const r = reason.trim();
  if (r.length < 5) throw new AppError("Alasan penolakan wajib diisi (minimal 5 karakter).", "VALIDATION", { reason: "Alasan wajib diisi." });
  return prisma.$transaction(async (tx) => {
    const p = await lockPayment(tx, ctx.organizationId, paymentId);
    if (p.status !== "PENDING_VERIFICATION") throw new ConflictError("Pembayaran ini sudah diproses.");
    // Status tagihan TIDAK diubah: periode tetap belum lunas dan dapat diajukan ulang.
    const updated = await tx.iplPayment.update({
      where: { id: p.id },
      data: {
        status: "REJECTED", rejectionReason: r, verifiedAt: new Date(), verifiedById: ctx.userId,
        histories: { create: { fromStatus: p.status, toStatus: "REJECTED", note: r, actorId: ctx.userId } },
      },
    });
    await writeAudit(ctx, {
      action: "IPL_PAYMENT_REJECTED", module: "ipl", entityType: "IplPayment", entityId: p.id,
      summary: `Menolak pembayaran ${p.number} (${p.resident.fullName})`, metadata: { reason: r },
    }, tx);
    if (p.resident.userId) {
      await notifyUser(tx, ctx.organizationId, p.resident.userId, {
        type: "IPL_PAYMENT_REJECTED", title: "Pembayaran IPL ditolak", body: `${p.number}: ${r}`, link: `/ipl/pembayaran/${p.id}`,
      });
    }
    return updated;
  });
}

/** Warga dapat membatalkan pengajuannya sendiri selama masih menunggu verifikasi. */
export async function cancelOwnPayment(ctx: AuthContext, paymentId: string) {
  return prisma.$transaction(async (tx) => {
    const p = await lockPayment(tx, ctx.organizationId, paymentId);
    if (p.submittedById !== ctx.userId && !(ctx.residentId && p.residentId === ctx.residentId)) throw new NotFoundError("Pembayaran tidak ditemukan.");
    if (p.status !== "PENDING_VERIFICATION") throw new ConflictError("Hanya pengajuan yang menunggu verifikasi yang dapat dibatalkan.");
    await tx.iplPayment.update({
      where: { id: p.id },
      data: { status: "CANCELLED", histories: { create: { fromStatus: p.status, toStatus: "CANCELLED", note: "Dibatalkan oleh pengaju", actorId: ctx.userId } } },
    });
    await writeAudit(ctx, { action: "IPL_PAYMENT_CANCELLED", module: "ipl", entityType: "IplPayment", entityId: p.id, summary: `Membatalkan pengajuan pembayaran ${p.number}` }, tx);
  });
}

/**
 * Konfirmasi dari provider QRIS (dipanggil webhook setelah signature diverifikasi provider adapter).
 * Idempoten: event yang sama berulang kali tidak menggandakan pelunasan maupun pemasukan.
 */
export async function applyProviderEvent(providerName: string, ev: QrisWebhookEvent) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.iplPayment.findUnique({
      where: { providerName_providerTransactionId: { providerName, providerTransactionId: ev.providerTransactionId } },
    });
    if (!found) throw new NotFoundError("Transaksi tidak dikenal.");
    const p = await lockPayment(tx, found.organizationId, found.id);
    if (p.status !== "AWAITING_PROVIDER") return { status: p.status, duplicate: true };
    const system: ActorLike = { organizationId: p.organizationId, userId: null, name: `Provider ${providerName}`, primaryRole: "SYSTEM" };
    if (ev.status === "PAID") {
      if (ev.amount !== p.totalAmount) {
        await writeAudit(system, { action: "QRIS_AMOUNT_MISMATCH", module: "ipl", entityType: "IplPayment", entityId: p.id, status: "FAILED", summary: `Nominal QRIS ${p.number} tidak cocok (${rupiah(ev.amount)} vs ${rupiah(p.totalAmount)})` }, tx);
        throw new ConflictError("Nominal tidak cocok.");
      }
      await tx.iplPayment.update({ where: { id: p.id }, data: { paidAt: ev.paidAt ?? new Date() } });
      await settle(tx, { ...p, paidAt: ev.paidAt ?? new Date() }, system, "Dikonfirmasi provider QRIS");
      await writeAudit(system, { action: "IPL_PAYMENT_APPROVED", module: "ipl", entityType: "IplPayment", entityId: p.id, summary: `Pembayaran QRIS ${p.number} dikonfirmasi provider` }, tx);
      return { status: "APPROVED" as const, duplicate: false };
    }
    if (ev.status === "FAILED" || ev.status === "EXPIRED") {
      await tx.iplPayment.update({
        where: { id: p.id },
        data: { status: "FAILED", histories: { create: { fromStatus: p.status, toStatus: "FAILED", note: `Provider: ${ev.status}` } } },
      });
      return { status: "FAILED" as const, duplicate: false };
    }
    return { status: p.status, duplicate: false };
  });
}

// ───────────────────────── Query ─────────────────────────

const PAYMENT_STATUSES = ["PENDING_VERIFICATION", "AWAITING_PROVIDER", "APPROVED", "REJECTED", "CANCELLED", "FAILED"] as const;

export async function listPayments(ctx: AuthContext, f: { q?: string; status?: string; page: number; ownOnly?: boolean }, pageSize = 20) {
  const where: Prisma.IplPaymentWhereInput = { organizationId: ctx.organizationId };
  if (f.ownOnly || !can(ctx, "ipl.view")) {
    assertCan(ctx, "ipl.self_view");
    where.OR = [{ submittedById: ctx.userId }, ...(ctx.residentId ? [{ residentId: ctx.residentId }] : [])];
  } else if (f.q) {
    const q = f.q.trim().slice(0, 60);
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { resident: { fullName: { contains: q, mode: "insensitive" } } },
      { unit: { houseNumber: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (f.status && (PAYMENT_STATUSES as readonly string[]).includes(f.status)) where.status = f.status as IplPaymentStatus;
  const [items, total] = await Promise.all([
    prisma.iplPayment.findMany({
      where, orderBy: { createdAt: "desc" }, ...pageParams(f.page, pageSize),
      include: {
        resident: { select: { fullName: true } }, unit: { select: { houseNumber: true } },
        allocations: { select: { bill: { select: { periodYear: true, periodMonth: true } } } },
      },
    }),
    prisma.iplPayment.count({ where }),
  ]);
  return { items, total };
}

export async function getPayment(ctx: AuthContext, id: string) {
  const p = await prisma.iplPayment.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      resident: { select: { id: true, fullName: true, phone: true, occupancyStatus: true } },
      unit: { select: { houseNumber: true, address: true } },
      allocations: { include: { bill: { include: { iplType: { select: { name: true } } } } } },
      proofs: { include: { file: { select: { id: true, originalName: true, mimeType: true, size: true } } } },
      histories: { orderBy: { createdAt: "asc" } },
      financeTransaction: { select: { number: true } },
    },
  });
  const staff = can(ctx, "ipl.view");
  if (!p || (!staff && p.submittedById !== ctx.userId && p.residentId !== ctx.residentId)) {
    throw new NotFoundError("Pembayaran tidak ditemukan.");
  }
  const actorIds = [...new Set([p.verifiedById, p.submittedById, ...p.histories.map((h) => h.actorId)].filter(Boolean))] as string[];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
  return { ...p, actorNames: Object.fromEntries(actors.map((a) => [a.id, a.name])), canVerify: can(ctx, "ipl.payment_verify") };
}
