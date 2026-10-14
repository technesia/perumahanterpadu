import { beforeAll, describe, expect, it } from "vitest";
import { ensureSeed, makeHousehold, makeUser, prisma } from "./helpers";
import { createResident, getResident, listResidents, setResidentArchived, updateResident } from "@/server/services/residents";
import { changeUserRole, createUser, setUserActive } from "@/server/services/users";
import { authenticate } from "@/server/auth/service";
import { addYears, todayDate, toIsoDate } from "@/lib/dates";
import { ForbiddenError } from "@/server/errors";

beforeAll(ensureSeed);

const base = { fullName: "Budi Santoso", phone: "081298765432", email: "", status: "ACTIVE" as const, occupancyStatus: "TEMPORARY" as const, moveInDate: "2024-05-01" };

describe("Data warga (#7–#10)", () => {
  it("tambah, cari, filter, edit, arsip", async () => {
    const { ctx } = await makeUser("ADMIN");
    const r = await createResident(ctx, { ...base, fullName: "Siti Unik Aminah", nik: "3603123456789012" });
    expect(r.code).toMatch(/^W-\d{4}-\d{6}$/);
    expect(r.nik).not.toContain("3603123456789012"); // terenkripsi

    const found = await listResidents(ctx, { q: "Unik Aminah", page: 1 });
    expect(found.items.map((i) => i.id)).toContain(r.id);
    const filtered = await listResidents(ctx, { q: "Unik Aminah", status: "MOVED", page: 1 });
    expect(filtered.items).toHaveLength(0);

    await updateResident(ctx, r.id, { ...base, fullName: "Siti Unik Aminah", status: "MOVED", occupancyStatus: "TEMPORARY" });
    const detail = await getResident(ctx, r.id);
    expect(detail.status).toBe("MOVED");
    expect(detail.histories.some((h) => h.action === "UPDATED")).toBe(true);

    await setResidentArchived(ctx, r.id, true, "Pindah ke luar kota");
    expect((await listResidents(ctx, { q: "Unik Aminah", page: 1 })).items).toHaveLength(0);
    expect((await listResidents(ctx, { q: "Unik Aminah", archived: true, page: 1 })).items).toHaveLength(1);
    expect(await prisma.residentHistory.count({ where: { residentId: r.id } })).toBeGreaterThanOrEqual(3);
  });

  it("status warga dan status hunian tersimpan terpisah (#8)", async () => {
    const { ctx } = await makeUser("ADMIN");
    const r = await createResident(ctx, { ...base, status: "ACTIVE", occupancyStatus: "TEMPORARY" });
    expect([r.status, r.occupancyStatus]).toEqual(["ACTIVE", "TEMPORARY"]);
  });

  it("tanggal meninggal: maksimal 10 tahun ke belakang, tidak di masa depan (#9)", async () => {
    const { ctx } = await makeUser("ADMIN");
    const today = todayDate();
    const ok = toIsoDate(addYears(today, -9));
    const tooOld = toIsoDate(addYears(today, -11));
    const future = toIsoDate(new Date(today.getTime() + 86400000));

    const r = await createResident(ctx, { ...base, status: "DECEASED", deathDate: ok });
    expect(r.deathDate).not.toBeNull();
    expect(r.deathRecordedById).toBe(ctx.userId);
    await expect(createResident(ctx, { ...base, status: "DECEASED", deathDate: tooOld })).rejects.toThrow(/10 tahun/);
    await expect(createResident(ctx, { ...base, status: "DECEASED", deathDate: future })).rejects.toThrow(/melebihi hari ini/);
    await expect(createResident(ctx, { ...base, status: "DECEASED" })).rejects.toThrow(/wajib/);

    // Super Admin boleh koreksi khusus dengan alasan
    const { ctx: sa } = await makeUser("SUPER_ADMIN");
    await expect(createResident(sa, { ...base, status: "DECEASED", deathDate: tooOld })).rejects.toThrow(/alasan/);
    const old = await createResident(sa, { ...base, status: "DECEASED", deathDate: tooOld, deathCorrectionNote: "Akta kematian baru diterima" });
    expect(old.status).toBe("DECEASED");
  });

  it("warga meninggal keluar dari statistik aktif, histori & keanggotaan rumah tetap (#10)", async () => {
    const { ctx } = await makeUser("ADMIN");
    const { resident } = await makeHousehold();
    await updateResident(ctx, resident.id, { ...base, fullName: resident.fullName, status: "DECEASED", occupancyStatus: "PERMANENT", deathDate: toIsoDate(todayDate()) });
    const d = await getResident(ctx, resident.id);
    expect(d.status).toBe("DECEASED");
    expect(d.memberships.filter((m) => !m.endDate)).toHaveLength(1);
  });

  it("Member & Security tidak dapat melihat atau menambah data warga (#4)", async () => {
    const { ctx: m } = await makeUser("MEMBER");
    const { ctx: s } = await makeUser("SECURITY");
    await expect(listResidents(m, { page: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createResident(s, base)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("NIK hanya tampil penuh bagi pemegang residents.view_sensitive", async () => {
    const { ctx: admin } = await makeUser("ADMIN");
    const r = await createResident(admin, { ...base, nik: "3603999988887777" });
    expect((await getResident(admin, r.id)).nik).toBe("3603999988887777");
    expect((await getResident(admin, r.id)).nikMasked).toBe("3603********7777");
  });
});

describe("Akun & role (#3, #6)", () => {
  it("Admin dapat membuat akun Member dan menghubungkan ke warga", async () => {
    const { ctx } = await makeUser("ADMIN");
    const r = await createResident(ctx, {
      ...base, account: { username: `warga${Date.now()}`, email: "", password: "WargaBaru12345", role: "MEMBER" },
    });
    const linked = await prisma.resident.findUniqueOrThrow({ where: { id: r.id }, include: { user: { include: { roles: { include: { role: true } } } } } });
    expect(linked.user?.roles[0].role.key).toBe("MEMBER");
    await expect(authenticate({ identifier: linked.user!.username, password: "WargaBaru12345" })).resolves.toBeTruthy();
  });

  it("Admin tidak dapat membuat atau mengangkat Super Admin / Admin", async () => {
    const { ctx } = await makeUser("ADMIN");
    await expect(createUser(ctx, { name: "X", username: `x${Date.now()}`, password: "Rahasia12345", role: "SUPER_ADMIN", phone: "", email: "" })).rejects.toThrow(/tidak berwenang/);
    const { user: target } = await makeUser("MEMBER");
    await expect(changeUserRole(ctx, target.id, "SUPER_ADMIN")).rejects.toThrow(/tidak berwenang/);
    await expect(changeUserRole(ctx, target.id, "ADMIN")).rejects.toThrow(/tidak berwenang/);
    await changeUserRole(ctx, target.id, "SECURITY");
    const roles = await prisma.userRole.findMany({ where: { userId: target.id }, include: { role: true } });
    expect(roles.map((r) => r.role.key)).toEqual(["SECURITY"]);
  });

  it("Admin tidak dapat mengubah role / menonaktifkan akun Super Admin atau dirinya sendiri", async () => {
    const { ctx } = await makeUser("ADMIN");
    const { user: sa } = await makeUser("SUPER_ADMIN");
    await expect(setUserActive(ctx, sa.id, false)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(changeUserRole(ctx, ctx.userId, "MEMBER")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setUserActive(ctx, ctx.userId, false)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("Super Admin aktif terakhir tidak dapat dinonaktifkan/diturunkan; perubahan tercatat audit", async () => {
    // Nonaktifkan semua Super Admin lain agar kondisi "terakhir" teruji.
    await prisma.user.updateMany({ where: { roles: { some: { role: { key: "SUPER_ADMIN" } } } }, data: { isActive: false } });
    const { user: last } = await makeUser("SUPER_ADMIN");
    const { ctx: other } = await makeUser("SUPER_ADMIN");
    await prisma.user.update({ where: { id: other.userId }, data: { isActive: false } });
    // `other` kini nonaktif, tapi konteks masih dipakai untuk memanggil service secara langsung.
    await expect(setUserActive(other, last.id, false)).rejects.toThrow(/terakhir/);
    await expect(changeUserRole(other, last.id, "ADMIN")).rejects.toThrow(/terakhir/);
    await prisma.user.update({ where: { id: other.userId }, data: { isActive: true } });
    await changeUserRole(other, last.id, "ADMIN");
    expect(await prisma.auditLog.count({ where: { entityId: last.id, action: "SUPER_ADMIN_ROLE_CHANGED" } })).toBe(1);
  });

  it("Member tidak dapat mengelola akun", async () => {
    const { ctx } = await makeUser("MEMBER");
    await expect(createUser(ctx, { name: "X", username: `y${Date.now()}`, password: "Rahasia12345", role: "MEMBER", phone: "", email: "" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
