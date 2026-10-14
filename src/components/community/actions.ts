"use server";
import { withAuth } from "@/server/action";
import { fileFromForm } from "@/server/storage";
import { saveActivity, saveAnnouncement, saveBusiness, savePosyandu } from "@/server/services/community";

const g = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const id = (fd: FormData) => g(fd, "id") || null;

export async function saveAnnouncementAction(fd: FormData) {
  return withAuth(async (ctx) => {
    const a = await saveAnnouncement(ctx, id(fd), {
      title: g(fd, "title"), body: g(fd, "body"), category: g(fd, "category") as never, audience: g(fd, "audience") as never,
      status: g(fd, "status") as never, isPriority: fd.get("isPriority") === "on",
    }, await fileFromForm(fd.get("attachment")));
    return { ok: true, data: { id: a.id }, message: "Pengumuman disimpan." };
  });
}

export async function saveActivityAction(fd: FormData) {
  return withAuth(async (ctx) => {
    await saveActivity(ctx, id(fd), {
      name: g(fd, "name"), description: g(fd, "description"), category: g(fd, "category") as never, startAt: g(fd, "startAt"), endAt: g(fd, "endAt"),
      location: g(fd, "location"), personInCharge: g(fd, "personInCharge"), status: g(fd, "status") as never,
    }, await fileFromForm(fd.get("attachment")));
    return { ok: true, message: "Kegiatan disimpan." };
  });
}

export async function saveBusinessAction(fd: FormData) {
  return withAuth(async (ctx) => {
    await saveBusiness(ctx, id(fd), {
      name: g(fd, "name"), ownerResidentId: g(fd, "ownerResidentId"), ownerName: g(fd, "ownerName"), category: g(fd, "category"),
      description: g(fd, "description"), contact: g(fd, "contact"), address: g(fd, "address"), showAddress: fd.get("showAddress") === "on",
      ownerConsent: fd.get("ownerConsent") === "on", openingHours: g(fd, "openingHours"), status: g(fd, "status") as never,
    }, await fileFromForm(fd.get("logo")));
    return { ok: true, message: "Data UMKM disimpan." };
  });
}

export async function savePosyanduAction(fd: FormData) {
  return withAuth(async (ctx) => {
    await savePosyandu(ctx, id(fd), {
      name: g(fd, "name"), startAt: g(fd, "startAt"), endAt: g(fd, "endAt"), location: g(fd, "location"),
      officer: g(fd, "officer"), description: g(fd, "description"), notes: g(fd, "notes"),
    });
    return { ok: true, message: "Jadwal Posyandu disimpan." };
  });
}
