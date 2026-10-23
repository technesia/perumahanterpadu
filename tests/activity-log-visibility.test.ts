import { beforeAll, describe, expect, it } from "vitest";
import { ensureSeed, makeUser, prisma } from "./helpers";
import { writeAudit } from "@/server/audit";
import { auditLogsSince, listAuditLogs, recentAuditLogs } from "@/server/services/audit-logs";
import { adminDashboard } from "@/server/services/dashboard";
import { changeUserRole } from "@/server/services/users";
import { ForbiddenError } from "@/server/errors";

beforeAll(ensureSeed);

/** Satu log per role pelaku + satu log sistem, dengan penanda unik agar tidak tercampur test lain. */
async function seedLogs(tag: string) {
  const actors = {
    SUPER_ADMIN: (await makeUser("SUPER_ADMIN")).ctx, ADMIN: (await makeUser("ADMIN")).ctx,
    MEMBER: (await makeUser("MEMBER")).ctx, SECURITY: (await makeUser("SECURITY")).ctx,
  };
  for (const [role, ctx] of Object.entries(actors)) {
    await writeAudit(ctx, { action: "TEST_VIS", module: "test", summary: `${tag} ${role}` });
  }
  await writeAudit({ organizationId: actors.ADMIN.organizationId, userId: null, name: "Provider X", primaryRole: "SYSTEM" }, { action: "TEST_VIS", module: "test", summary: `${tag} SYSTEM` });
  return actors;
}
const roles = (items: { summary: string }[], tag: string) => items.filter((i) => i.summary.startsWith(tag)).map((i) => i.summary.split(" ")[1]).sort();

describe("Activity Log berdasarkan role", () => {
  it("Super Admin melihat semua role; Admin hanya Member, Security, dan sistem", async () => {
    const tag = `vis${Date.now()}`;
    const a = await seedLogs(tag);
    const sa = await listAuditLogs(a.SUPER_ADMIN, { q: tag, page: 1 });
    expect(roles(sa.items, tag)).toEqual(["ADMIN", "MEMBER", "SECURITY", "SUPER_ADMIN", "SYSTEM"]);
    const ad = await listAuditLogs(a.ADMIN, { q: tag, page: 1 });
    expect(roles(ad.items, tag)).toEqual(["MEMBER", "SECURITY", "SYSTEM"]);
    expect(ad.total).toBe(3);
    // Admin bahkan tidak melihat aktivitasnya sendiri sebagai Admin
    expect(ad.items.some((i) => i.userId === a.ADMIN.userId)).toBe(false);
  });

  it("Admin tidak dapat memperluas akses lewat filter role, pengguna, atau polling/SSE", async () => {
    const tag = `flt${Date.now()}`;
    const since = new Date(Date.now() - 1000);
    const a = await seedLogs(tag);
    for (const role of ["SUPER_ADMIN", "ADMIN"]) {
      expect((await listAuditLogs(a.ADMIN, { q: tag, role, page: 1 })).total).toBe(0);
    }
    expect((await listAuditLogs(a.ADMIN, { q: tag, userId: a.SUPER_ADMIN.userId, page: 1 })).total).toBe(0);
    expect((await listAuditLogs(a.ADMIN, { q: tag, role: "MEMBER", page: 1 })).total).toBe(1);
    expect((await listAuditLogs(a.SUPER_ADMIN, { q: tag, role: "ADMIN", page: 1 })).total).toBe(1);
    const fresh = await auditLogsSince(a.ADMIN, since, { q: tag, role: "SUPER_ADMIN" });
    expect(fresh).toHaveLength(0);
    expect(roles(await auditLogsSince(a.ADMIN, since, { q: tag }), tag)).toEqual(["MEMBER", "SECURITY", "SYSTEM"]);
    // Pilihan filter pengguna/role untuk Admin tidak memuat Admin/Super Admin
    const opts = await listAuditLogs(a.ADMIN, { page: 1 });
    expect(opts.roles).not.toContain("SUPER_ADMIN");
    expect(opts.users.some((u) => u.id === a.SUPER_ADMIN.userId || u.id === a.ADMIN.userId)).toBe(false);
  });

  it("dashboard Admin hanya menampilkan aktivitas yang boleh dilihat", async () => {
    const tag = `dsh${Date.now()}`;
    const a = await seedLogs(tag);
    const recent = await recentAuditLogs(a.ADMIN, 50);
    expect(recent.every((l) => l.userId === null || ["MEMBER", "SECURITY"].includes(l.userRole ?? ""))).toBe(true);
    const d = await adminDashboard(a.ADMIN);
    expect(d.recent.every((l) => l.userId === null || ["MEMBER", "SECURITY"].includes(l.userRole ?? ""))).toBe(true);
    expect((await adminDashboard(a.SUPER_ADMIN)).recent.length).toBeGreaterThan(0);
  });

  it("Member dan Security ditolak di service dan endpoint", async () => {
    const { ctx: mem } = await makeUser("MEMBER");
    const { ctx: sec } = await makeUser("SECURITY");
    for (const c of [mem, sec]) {
      await expect(listAuditLogs(c, { page: 1 })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(auditLogsSince(c, new Date(0))).rejects.toBeInstanceOf(ForbiddenError);
      expect(await recentAuditLogs(c)).toEqual([]);
    }
  });

  it("perubahan role tercatat dengan role sebelum & sesudah", async () => {
    const { ctx: sa } = await makeUser("SUPER_ADMIN");
    const { user } = await makeUser("MEMBER");
    await changeUserRole(sa, user.id, "SECURITY");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: user.id, action: "ROLE_CHANGED" } });
    expect(log.metadata).toMatchObject({ from: ["MEMBER"], to: "SECURITY" });
    expect(log.userRole).toBe("SUPER_ADMIN");
  });
});
