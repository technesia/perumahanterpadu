import { beforeAll, describe, expect, it } from "vitest";
import { ensureSeed, makeUser, prisma, TEST_PASSWORD, uniq } from "./helpers";
import { authenticate, loadSession } from "@/server/auth/service";
import { ROLE_PERMISSIONS, assignableRoles } from "@/server/rbac/permissions";
import { passwordPolicyError } from "@/server/auth/password";
import { sanitizeMetadata } from "@/server/audit";
import { nextNumber } from "@/server/counters";

beforeAll(async () => {
  await ensureSeed();
});

describe("Seed & database", () => {
  it("seed dapat dijalankan ulang tanpa duplikasi (#51)", async () => {
    await ensureSeed();
    await ensureSeed();
    expect(await prisma.organization.count()).toBe(1);
    expect(await prisma.role.count()).toBe(4);
    const cats = await prisma.financeCategory.groupBy({ by: ["code"], _count: true });
    expect(cats.every((c) => c._count === 1)).toBe(true);
  });

  it("seed tidak membuat akun default", async () => {
    const org = await prisma.organization.findFirstOrThrow();
    const sa = await prisma.userRole.count({ where: { organizationId: org.id, role: { key: "SUPER_ADMIN" } } });
    expect(sa).toBe(0);
  });

  it("role-permission di DB sesuai matriks", async () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      const rows = await prisma.rolePermission.findMany({ where: { role: { key: role } }, include: { permission: true } });
      expect(rows.map((r) => r.permission.key).sort()).toEqual([...perms].sort());
    }
  });

  it("audit log append-only di level database (#41)", async () => {
    const org = await prisma.organization.findFirstOrThrow();
    const log = await prisma.auditLog.create({ data: { organizationId: org.id, action: "T", module: "t", summary: "t" } });
    await expect(prisma.auditLog.update({ where: { id: log.id }, data: { summary: "ubah" } })).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow();
  });

  it("foreign key berfungsi (#52)", async () => {
    await expect(prisma.residentialUnit.create({
      data: { organizationId: "tidak-ada", houseNumber: "X1", address: "x" },
    })).rejects.toThrow();
  });

  it("nomor dokumen berurutan dan unik", async () => {
    const org = await prisma.organization.findFirstOrThrow();
    const key = uniq("T");
    const nums = await Promise.all(Array.from({ length: 10 }, () => nextNumber(prisma, org.id, key)));
    expect(new Set(nums).size).toBe(10);
  });
});

describe("Autentikasi (#1, #2)", () => {
  it("login berhasil dan sesi dapat dimuat", async () => {
    const { user } = await makeUser("ADMIN");
    const res = await authenticate({ identifier: user.username, password: TEST_PASSWORD });
    const ctx = await loadSession(res.token);
    expect(ctx?.userId).toBe(user.id);
    expect(ctx?.primaryRole).toBe("ADMIN");
    expect(ctx?.permissions.has("residents.view")).toBe(true);
  });

  it("password salah ditolak dengan pesan generik", async () => {
    const { user } = await makeUser("MEMBER");
    await expect(authenticate({ identifier: user.username, password: "salah123456" })).rejects.toThrow(/salah/);
  });

  it("akun nonaktif tidak dapat login", async () => {
    const { user } = await makeUser("MEMBER", { isActive: false });
    await expect(authenticate({ identifier: user.username, password: TEST_PASSWORD })).rejects.toThrow(/tidak aktif/);
  });

  it("sesi akun yang dinonaktifkan langsung tidak berlaku", async () => {
    const { user } = await makeUser("MEMBER");
    const res = await authenticate({ identifier: user.username, password: TEST_PASSWORD });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect(await loadSession(res.token)).toBeNull();
  });

  it("akun dikunci setelah 5 kali gagal berturut-turut", async () => {
    const { user } = await makeUser("MEMBER");
    for (let i = 0; i < 5; i++) {
      await authenticate({ identifier: user.username, password: "salah" + i + "xxxxxx" }).catch(() => {});
    }
    await expect(authenticate({ identifier: user.username, password: TEST_PASSWORD })).rejects.toThrow(/dikunci/);
  });

  it("token sembarang tidak menghasilkan sesi", async () => {
    expect(await loadSession("token-palsu")).toBeNull();
  });

  it("login mencatat audit log tanpa password", async () => {
    const { user } = await makeUser("SECURITY");
    await authenticate({ identifier: user.username, password: TEST_PASSWORD });
    const log = await prisma.auditLog.findFirst({ where: { userId: user.id, action: "LOGIN" } });
    expect(log).not.toBeNull();
    expect(JSON.stringify(log)).not.toContain(TEST_PASSWORD);
  });
});

describe("RBAC", () => {
  it("Admin tidak dapat memberikan role Super Admin atau Admin (#3)", () => {
    const admin = new Set(ROLE_PERMISSIONS.ADMIN);
    expect(assignableRoles(admin)).toEqual(["MEMBER", "SECURITY"]);
    expect(assignableRoles(new Set(ROLE_PERMISSIONS.SUPER_ADMIN))).toContain("SUPER_ADMIN");
  });

  it("Security tidak memiliki permission keuangan (#5)", () => {
    const sec = ROLE_PERMISSIONS.SECURITY;
    expect(sec.some((p) => p.startsWith("finance.") || p.startsWith("ipl."))).toBe(false);
  });

  it("Member tidak memiliki akses data warga, audit, atau verifikasi", () => {
    const m = ROLE_PERMISSIONS.MEMBER as string[];
    for (const p of ["residents.view", "audit_logs.view", "ipl.payment_verify", "ipl.view", "roles.assign"]) {
      expect(m).not.toContain(p);
    }
  });

  it("sesi user dari organisasi lain ditolak (#53)", async () => {
    const other = await prisma.organization.create({ data: { slug: uniq("org"), name: "Organisasi Lain" } });
    const { user } = await makeUser("ADMIN");
    const { token } = await authenticate({ identifier: user.username, password: TEST_PASSWORD });
    expect(await loadSession(token)).not.toBeNull();
    // Pindahkan user ke organisasi lain: sesi harus ditolak oleh organization context server.
    await prisma.user.update({ where: { id: user.id }, data: { organizationId: other.id } });
    expect(await loadSession(token)).toBeNull();
  });
});

describe("Utilitas keamanan", () => {
  it("kebijakan password", () => {
    expect(passwordPolicyError("pendek1")).not.toBeNull();
    expect(passwordPolicyError("hanyahurufsaja")).not.toBeNull();
    expect(passwordPolicyError("Kombinasi12345")).toBeNull();
  });

  it("metadata audit menyamarkan kunci sensitif", () => {
    const out = sanitizeMetadata({ password: "x", nested: { token: "y", nama: "z" }, nik: "123" }) as Record<string, unknown>;
    expect(out.password).toBe("[disamarkan]");
    expect((out.nested as Record<string, unknown>).token).toBe("[disamarkan]");
    expect((out.nested as Record<string, unknown>).nama).toBe("z");
    expect(out.nik).toBe("[disamarkan]");
  });
});
