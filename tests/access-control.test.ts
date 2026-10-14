import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { contextFor, ensureSeed, makeUser, prisma, TEST_PASSWORD } from "./helpers";
import { getAccessControls, setAccessControls } from "@/server/services/access-control";
import { ACCOUNTS_LOCKED_MESSAGE, authenticate, loadSession } from "@/server/auth/service";
import { assertCanWrite, READ_ONLY_MESSAGE } from "@/server/auth/context";
import { ForbiddenError } from "@/server/errors";

beforeAll(ensureSeed);

const orgId = async () => (await prisma.organization.findUniqueOrThrow({ where: { slug: "taman-pesona-rajeg-mulya" } })).id;

// Test lain berbagi database yang sama: selalu kembalikan kontrol ke kondisi normal.
afterEach(async () => {
  await prisma.organization.update({ where: { id: await orgId() }, data: { accountsLocked: false, readOnlyMode: false } });
});

describe("Kontrol akses Super Admin", () => {
  it("hanya Super Admin yang dapat mengubah kontrol; perubahan tercatat di audit log", async () => {
    const { ctx: admin } = await makeUser("ADMIN");
    const { ctx: sa } = await makeUser("SUPER_ADMIN");
    await expect(setAccessControls(admin, { readOnlyMode: true })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getAccessControls(admin)).rejects.toBeInstanceOf(ForbiddenError);
    await setAccessControls(sa, { readOnlyMode: true });
    expect((await getAccessControls(sa)).readOnlyMode).toBe(true);
    expect(await prisma.auditLog.count({ where: { userId: sa.userId, action: "READ_ONLY_ENABLED" } })).toBe(1);
  });

  it("nonaktifkan semua akun: selain Super Admin tidak bisa masuk & sesinya langsung berakhir; dibuka kembali seperti semula", async () => {
    const { user: member } = await makeUser("MEMBER");
    const { user: admin } = await makeUser("ADMIN");
    const { user: saUser, ctx: sa } = await makeUser("SUPER_ADMIN");
    const memberSession = await authenticate({ identifier: member.username, password: TEST_PASSWORD });
    const saSession = await authenticate({ identifier: saUser.username, password: TEST_PASSWORD });

    await setAccessControls(sa, { accountsLocked: true });
    expect(await loadSession(memberSession.token)).toBeNull();
    await expect(authenticate({ identifier: member.username, password: TEST_PASSWORD })).rejects.toThrow(ACCOUNTS_LOCKED_MESSAGE);
    await expect(authenticate({ identifier: admin.username, password: TEST_PASSWORD })).rejects.toThrow(ACCOUNTS_LOCKED_MESSAGE);
    // Super Admin tetap bisa bekerja
    expect(await loadSession(saSession.token)).not.toBeNull();
    await expect(authenticate({ identifier: saUser.username, password: TEST_PASSWORD })).resolves.toBeTruthy();
    // Status akun individual tidak diubah
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).isActive).toBe(true);
    expect(await prisma.auditLog.count({ where: { userId: sa.userId, action: "ACCOUNTS_LOCKED" } })).toBe(1);

    await setAccessControls(sa, { accountsLocked: false });
    await expect(authenticate({ identifier: member.username, password: TEST_PASSWORD })).resolves.toBeTruthy();
  });

  it("password salah tetap 'salah' saat terkunci (tidak membocorkan status kunci ke penebak password)", async () => {
    const { user: member } = await makeUser("MEMBER");
    const { ctx: sa } = await makeUser("SUPER_ADMIN");
    await setAccessControls(sa, { accountsLocked: true });
    await expect(authenticate({ identifier: member.username, password: "salahsekali123" })).rejects.toThrow(/salah/);
  });

  it("mode lihat saja: perubahan ditolak untuk semua role kecuali Super Admin", async () => {
    const { ctx: sa } = await makeUser("SUPER_ADMIN");
    const { user: admin } = await makeUser("ADMIN");
    const { user: member } = await makeUser("MEMBER");
    const { user: sec } = await makeUser("SECURITY");
    await setAccessControls(sa, { readOnlyMode: true });
    for (const u of [admin, member, sec]) {
      const ctx = await contextFor(u.id); // sesi baru membaca status kontrol terkini
      expect(ctx.accessControls.readOnlyMode).toBe(true);
      expect(() => assertCanWrite(ctx)).toThrow(READ_ONLY_MESSAGE);
    }
    expect(() => assertCanWrite(sa)).not.toThrow();
    const saFresh = await contextFor(sa.userId);
    expect(() => assertCanWrite(saFresh)).not.toThrow();

    await setAccessControls(sa, { readOnlyMode: false });
    const adminAfter = await contextFor(admin.id);
    expect(() => assertCanWrite(adminAfter)).not.toThrow();
  });
});
