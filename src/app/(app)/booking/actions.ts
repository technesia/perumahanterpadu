"use server";
import type { z } from "zod";
import { withAuth } from "@/server/action";
import { fileFromForm } from "@/server/storage";
import {
  approveBooking, cancelBooking, createBooking, dayAvailability, monthAvailability, rejectBooking, saveFacility, type bookingSchema,
} from "@/server/services/facilities";

export async function monthAvailabilityAction(facilityId: string, year: number, month: number) {
  return withAuth(async (ctx) => ({ ok: true, data: await monthAvailability(ctx, facilityId, year, month) }), { readOnly: true });
}

export async function dayAvailabilityAction(facilityId: string, date: string) {
  return withAuth(async (ctx) => ({ ok: true, data: await dayAvailability(ctx, facilityId, date) }), { readOnly: true });
}

export async function createBookingAction(input: z.input<typeof bookingSchema>) {
  return withAuth(async (ctx) => {
    const b = await createBooking(ctx, input);
    return { ok: true, data: { id: b.id }, message: "Pengajuan booking berhasil dikirim. Silakan menunggu review dari Admin." };
  });
}

export async function approveBookingAction(id: string, note: string) {
  return withAuth(async (ctx) => { await approveBooking(ctx, id, note); return { ok: true, message: "Booking disetujui." }; });
}

export async function rejectBookingAction(id: string, reason: string) {
  return withAuth(async (ctx) => { await rejectBooking(ctx, id, reason); return { ok: true, message: "Booking ditolak. Slot kembali tersedia." }; });
}

export async function cancelBookingAction(id: string, reason: string) {
  return withAuth(async (ctx) => { await cancelBooking(ctx, id, reason); return { ok: true, message: "Booking dibatalkan." }; });
}

export async function saveFacilityAction(id: string | null, fd: FormData) {
  return withAuth(async (ctx) => {
    const g = (k: string) => String(fd.get(k) ?? "");
    await saveFacility(ctx, id, {
      name: g("name"), description: g("description"), location: g("location"), capacity: g("capacity") as never, rules: g("rules"),
      fee: (g("fee") || "0") as never, openTime: g("openTime"), closeTime: g("closeTime"), slotMinutes: g("slotMinutes") as never,
      isActive: fd.get("isActive") === "on",
    }, await fileFromForm(fd.get("photo")));
    return { ok: true, message: "Fasilitas disimpan." };
  });
}
