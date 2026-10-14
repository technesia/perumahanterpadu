import { ForbiddenError } from "../errors";
import type { PermissionKey, RoleKey } from "../rbac/permissions";

export interface AuthContext {
  sessionId: string;
  userId: string;
  organizationId: string;
  name: string;
  username: string;
  email: string | null;
  roles: RoleKey[];
  primaryRole: RoleKey;
  permissions: ReadonlySet<string>;
  residentId: string | null;
  /** Kontrol darurat organisasi (diatur Super Admin). */
  accessControls: { accountsLocked: boolean; readOnlyMode: boolean };
  ip?: string | null;
}

export const isSuperAdmin = (ctx: Pick<AuthContext, "roles">) => ctx.roles.includes("SUPER_ADMIN");

export const READ_ONLY_MESSAGE = "Aplikasi sedang dalam mode lihat saja. Perubahan data dinonaktifkan sementara oleh Super Admin.";

/** Mode lihat saja: semua perubahan ditolak kecuali oleh Super Admin. */
export function assertCanWrite(ctx: Pick<AuthContext, "roles" | "accessControls">) {
  if (ctx.accessControls.readOnlyMode && !isSuperAdmin(ctx)) throw new ForbiddenError(READ_ONLY_MESSAGE);
}

const ROLE_PRIORITY: RoleKey[] = ["SUPER_ADMIN", "ADMIN", "SECURITY", "MEMBER"];

export function pickPrimaryRole(roles: RoleKey[]): RoleKey {
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? "MEMBER";
}

export function can(ctx: Pick<AuthContext, "permissions">, perm: PermissionKey): boolean {
  return ctx.permissions.has(perm);
}

export function canAny(ctx: Pick<AuthContext, "permissions">, perms: PermissionKey[]): boolean {
  return perms.some((p) => ctx.permissions.has(p));
}

export function assertCan(ctx: Pick<AuthContext, "permissions">, perm: PermissionKey) {
  if (!ctx.permissions.has(perm)) throw new ForbiddenError();
}

export function assertCanAny(ctx: Pick<AuthContext, "permissions">, perms: PermissionKey[]) {
  if (!canAny(ctx, perms)) throw new ForbiddenError();
}
