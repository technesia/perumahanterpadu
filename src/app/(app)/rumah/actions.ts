"use server";
import { withAuth } from "@/server/action";
import { addMembership, createUnit, endMembership, updateUnit, type unitSchema, type membershipSchema } from "@/server/services/units";
import type { z } from "zod";

export async function saveUnitAction(id: string | null, input: z.input<typeof unitSchema>) {
  return withAuth(async (ctx) => {
    const u = id ? await updateUnit(ctx, id, input) : await createUnit(ctx, input);
    return { ok: true, data: { id: u.id }, message: id ? "Data rumah diperbarui." : `Rumah ${u.houseNumber} ditambahkan.` };
  });
}

export async function addMemberAction(unitId: string, input: z.input<typeof membershipSchema>) {
  return withAuth(async (ctx) => {
    await addMembership(ctx, unitId, input);
    return { ok: true, message: "Penghuni ditambahkan." };
  });
}

export async function endMemberAction(membershipId: string, endDate: string) {
  return withAuth(async (ctx) => {
    await endMembership(ctx, membershipId, endDate);
    return { ok: true, message: "Penghuni dicatat tidak lagi tinggal. Histori tetap tersimpan." };
  });
}
