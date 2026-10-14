// Membuat / mempromosikan Super Admin melalui command line server.
// Hanya orang dengan akses shell server yang dapat menjalankannya — tidak ada
// registrasi Super Admin publik.
//
//   npm run setup:superadmin
// atau non-interaktif:
//   SA_NAME="..." SA_USERNAME="..." SA_EMAIL="..." SA_PASSWORD="..." npm run setup:superadmin
import "./load-env";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { PrismaClient } from "@prisma/client";
import { hashPassword, passwordPolicyError } from "../src/server/auth/password";
import { organizationSlug } from "../src/server/organization";

const prisma = new PrismaClient();

async function ask(rl: ReturnType<typeof createInterface>, label: string, hidden = false) {
  if (!hidden) return (await rl.question(label)).trim();
  // Sembunyikan input password di terminal.
  const out = stdout as unknown as { write: (s: string) => boolean };
  const original = out.write.bind(out);
  stdout.write(label);
  out.write = () => true;
  const answer = await rl.question("");
  out.write = original;
  stdout.write("\n");
  return answer;
}

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: organizationSlug() } });
  if (!org) throw new Error("Organisasi belum ada. Jalankan `npm run db:seed` lebih dulu.");
  const role = await prisma.role.findUnique({ where: { key: "SUPER_ADMIN" } });
  if (!role) throw new Error("Role belum di-seed. Jalankan `npm run db:seed` lebih dulu.");

  const rl = createInterface({ input: stdin, output: stdout });
  const name = process.env.SA_NAME || (await ask(rl, "Nama lengkap: "));
  const username = (process.env.SA_USERNAME || (await ask(rl, "Username: "))).toLowerCase();
  const email = (process.env.SA_EMAIL ?? (await ask(rl, "Email (opsional): "))).toLowerCase() || null;
  const password = process.env.SA_PASSWORD || (await ask(rl, "Password: ", true));
  rl.close();

  if (!name || !/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new Error("Nama wajib diisi; username 3-32 karakter (huruf kecil, angka, . _ -).");
  }
  const policy = passwordPolicyError(password);
  if (policy) throw new Error(policy);

  const passwordHash = await hashPassword(password);
  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { organizationId_username: { organizationId: org.id, username } },
    });
    const u = existing
      ? await tx.user.update({ where: { id: existing.id }, data: { name, email, passwordHash, isActive: true } })
      : await tx.user.create({ data: { organizationId: org.id, name, username, email, passwordHash } });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: u.id, roleId: role.id } },
      update: {},
      create: { organizationId: org.id, userId: u.id, roleId: role.id },
    });
    await tx.auditLog.create({
      data: {
        organizationId: org.id,
        userName: "CLI setup",
        userRole: "SYSTEM",
        action: existing ? "SUPER_ADMIN_PROMOTED" : "SUPER_ADMIN_CREATED",
        module: "users",
        entityType: "User",
        entityId: u.id,
        summary: `Super Admin ${username} ${existing ? "diperbarui" : "dibuat"} melalui setup command`,
      },
    });
    return u;
  });
  console.log(`Super Admin siap: ${user.username}`);
}

main()
  .catch((e) => {
    console.error(`Gagal: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
