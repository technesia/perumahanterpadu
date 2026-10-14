"use server";
import { withAuth } from "@/server/action";
import { createResident, setResidentArchived, updateResident, type CreateResidentInput } from "@/server/services/residents";

export async function createResidentAction(input: CreateResidentInput) {
  return withAuth(async (ctx) => {
    const r = await createResident(ctx, input);
    return { ok: true, data: { id: r.id }, message: `Warga ${r.fullName} berhasil ditambahkan.` };
  });
}

export async function updateResidentAction(id: string, input: CreateResidentInput) {
  return withAuth(async (ctx) => {
    await updateResident(ctx, id, input);
    return { ok: true, data: { id }, message: "Data warga berhasil diperbarui." };
  });
}

export async function archiveResidentAction(id: string, archived: boolean, reason: string) {
  return withAuth(async (ctx) => {
    await setResidentArchived(ctx, id, archived, reason);
    return { ok: true, message: archived ? "Warga diarsipkan. Histori tetap tersimpan." : "Warga dipulihkan." };
  });
}
