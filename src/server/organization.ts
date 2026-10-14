import { cache } from "react";
import { prisma } from "./db";

/**
 * Organization context ditentukan oleh konfigurasi server (ORGANIZATION_SLUG).
 * Tidak pernah diambil dari request, sehingga pengguna tidak dapat mengubahnya.
 */
export function organizationSlug(): string {
  return process.env.ORGANIZATION_SLUG || "taman-pesona-rajeg-mulya";
}

let cachedId: string | null = null;

export async function getOrganizationId(): Promise<string> {
  if (cachedId) return cachedId;
  const org = await prisma.organization.findUnique({
    where: { slug: organizationSlug() },
    select: { id: true },
  });
  if (!org) {
    throw new Error("Organisasi belum di-seed. Jalankan `npm run db:seed`.");
  }
  cachedId = org.id;
  return cachedId;
}

export const getOrganization = cache(async () => {
  const id = await getOrganizationId();
  return prisma.organization.findUniqueOrThrow({ where: { id } });
});

/** Hanya untuk test: reset cache saat database diganti. */
export function __resetOrganizationCache() {
  cachedId = null;
}
