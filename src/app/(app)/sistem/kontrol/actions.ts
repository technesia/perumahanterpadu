"use server";
import { withAuth } from "@/server/action";
import { setAccessControls } from "@/server/services/access-control";

export async function setAccessControlAction(key: "accountsLocked" | "readOnlyMode", value: boolean) {
  return withAuth(async (ctx) => {
    await setAccessControls(ctx, { [key]: value });
    const msg = key === "accountsLocked"
      ? (value ? "Semua akun selain Super Admin dinonaktifkan dan dikeluarkan." : "Akses semua akun dipulihkan.")
      : (value ? "Mode lihat saja aktif." : "Mode lihat saja dinonaktifkan.");
    return { ok: true, message: msg };
  });
}
