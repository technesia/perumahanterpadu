// Seed production: hanya master data. Aman dijalankan ulang (idempoten).
// Tidak membuat akun default, data warga, transaksi, maupun nomor darurat.
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS, ROLE_KEYS, ROLE_LABELS, ROLE_PERMISSIONS } from "../src/server/rbac/permissions";
import { ADMIN_REQUEST_TYPES, DEFAULT_ORGANIZATION, FINANCE_CATEGORIES } from "../src/server/master-data";

export async function seed(prisma: PrismaClient, slug = process.env.ORGANIZATION_SLUG || DEFAULT_ORGANIZATION.slug) {
  const org = await prisma.organization.upsert({
    where: { slug },
    update: {},
    create: { ...DEFAULT_ORGANIZATION, slug },
  });

  for (const [key, [module, description]] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: { module, description },
      create: { key, module, description },
    });
  }

  const permissions = await prisma.permission.findMany();
  const permId = new Map(permissions.map((p) => [p.key, p.id]));

  for (const key of ROLE_KEYS) {
    const role = await prisma.role.upsert({
      where: { key },
      update: { name: ROLE_LABELS[key] },
      create: { key, name: ROLE_LABELS[key] },
    });
    const wanted = ROLE_PERMISSIONS[key].map((p) => permId.get(p)!);
    // Sinkronkan: hapus yang tidak lagi ada di matriks, tambahkan yang baru.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { notIn: wanted } } });
    await prisma.rolePermission.createMany({
      data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }

  for (const c of FINANCE_CATEGORIES) {
    await prisma.financeCategory.upsert({
      where: { organizationId_code: { organizationId: org.id, code: c.code } },
      update: {},
      create: { organizationId: org.id, ...c },
    });
  }

  for (const t of ADMIN_REQUEST_TYPES) {
    await prisma.administrativeRequestType.upsert({
      where: { organizationId_code: { organizationId: org.id, code: t.code } },
      update: {},
      create: { organizationId: org.id, ...t },
    });
  }

  return org;
}

if (require.main === module) {
  // Muat .env hanya saat dijalankan langsung (bukan saat diimpor oleh test); env yang ada tidak ditimpa.
  try {
    process.loadEnvFile();
  } catch {
    // Tidak ada .env (Docker/CI): gunakan environment yang ada.
  }
  const prisma = new PrismaClient();
  seed(prisma)
    .then((org) => console.log(`Seed selesai untuk organisasi: ${org.name}`))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
