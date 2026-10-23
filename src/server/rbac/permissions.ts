// Sumber kebenaran permission & matriks role. Dipakai oleh seed (disimpan ke DB)
// dan oleh guard backend (yang membaca permission dari DB, bukan dari file ini).

export const ROLE_KEYS = ["SUPER_ADMIN", "ADMIN", "MEMBER", "SECURITY"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  MEMBER: "Member",
  SECURITY: "Security",
};

export const PERMISSIONS = {
  "dashboard.admin": ["dashboard", "Melihat dashboard pengurus"],
  "residents.view": ["residents", "Melihat data warga"],
  "residents.create": ["residents", "Menambah data warga (termasuk impor Excel)"],
  "residents.update": ["residents", "Mengubah data warga"],
  "residents.deactivate": ["residents", "Mengarsipkan / menonaktifkan warga"],
  "residents.view_sensitive": ["residents", "Melihat NIK dan catatan internal warga"],
  "residents.security_lookup": ["residents", "Melihat info penghuni terbatas untuk tugas keamanan"],
  "residents.death_backdate": ["residents", "Koreksi tanggal meninggal melewati batas normal"],
  "units.view": ["units", "Melihat data rumah"],
  "units.manage": ["units", "Mengelola data rumah dan penghuni"],
  "users.manage": ["users", "Mengelola akun pengguna"],
  "roles.assign": ["users", "Memberikan role Member dan Security"],
  "roles.assign_admin": ["users", "Memberikan role Admin"],
  "roles.assign_super_admin": ["users", "Memberikan role Super Admin"],
  "roles.view": ["users", "Melihat matriks role dan permission"],
  "ipl.view": ["ipl", "Melihat seluruh tagihan dan pembayaran IPL"],
  "ipl.manage": ["ipl", "Mengelola master IPL dan menerbitkan tagihan"],
  "ipl.opening_manage": ["ipl", "Mengelola tunggakan awal: input manual, impor Excel, dan koreksi"],
  "ipl.payment_submit": ["ipl", "Mengajukan pembayaran IPL"],
  "ipl.payment_verify": ["ipl", "Memverifikasi / menolak pembayaran IPL"],
  "ipl.payment_record": ["ipl", "Mencatat pembayaran IPL atas nama warga (tunai)"],
  "ipl.self_view": ["ipl", "Melihat tagihan IPL milik sendiri"],
  "finance.view": ["finance", "Melihat keuangan dan rekap"],
  "finance.income.manage": ["finance", "Mengelola pemasukan manual"],
  "finance.expense.manage": ["finance", "Mengelola pengeluaran"],
  "finance.opening_balance": ["finance", "Mengatur saldo awal kas"],
  "administration.view": ["administration", "Melihat seluruh pengajuan surat"],
  "administration.process": ["administration", "Memproses pengajuan surat"],
  "administration.submit": ["administration", "Mengajukan surat"],
  "announcements.view": ["announcements", "Melihat pengumuman"],
  "announcements.manage": ["announcements", "Mengelola pengumuman"],
  "activities.view": ["activities", "Melihat kegiatan"],
  "activities.manage": ["activities", "Mengelola kegiatan"],
  "facilities.view": ["facilities", "Melihat fasilitas dan kalender booking"],
  "facilities.manage": ["facilities", "Mengelola fasilitas dan mereview booking"],
  "facilities.book": ["facilities", "Mengajukan booking fasilitas"],
  "businesses.view": ["businesses", "Melihat direktori UMKM"],
  "businesses.manage": ["businesses", "Mengelola direktori UMKM"],
  "posyandu.view": ["posyandu", "Melihat informasi Posyandu"],
  "posyandu.manage": ["posyandu", "Mengelola jadwal Posyandu"],
  "security.dashboard": ["security", "Melihat dashboard keamanan"],
  "security.visitors.manage": ["security", "Mencatat tamu masuk dan keluar"],
  "security.visitors.view": ["security", "Melihat riwayat kunjungan"],
  "security.incidents.manage": ["security", "Membuat laporan kejadian"],
  "security.incidents.review": ["security", "Meninjau dan menindaklanjuti laporan kejadian"],
  "cctv.view": ["security", "Melihat direktori CCTV"],
  "cctv.manage": ["security", "Mengelola data CCTV"],
  "audit_logs.view": ["system", "Melihat Activity Log (aktivitas Member, Security, dan sistem)"],
  "audit_logs.view_all": ["system", "Melihat seluruh Activity Log, termasuk aktivitas Admin dan Super Admin"],
  "settings.manage": ["system", "Mengelola pengaturan sistem"],
  "system.access_control": ["system", "Mengunci semua akun & mode lihat saja (kontrol darurat)"],
} as const satisfies Record<string, readonly [string, string]>;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

const ADMIN_EXCLUDED: PermissionKey[] = [
  "roles.assign_admin",
  "roles.assign_super_admin",
  "residents.death_backdate",
  "settings.manage",
  "system.access_control",
  "finance.opening_balance",
  "audit_logs.view_all",
];

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS.filter((p) => !ADMIN_EXCLUDED.includes(p)),
  MEMBER: [
    "ipl.self_view",
    "ipl.payment_submit",
    "administration.submit",
    "announcements.view",
    "activities.view",
    "facilities.view",
    "facilities.book",
    "businesses.view",
    "posyandu.view",
  ],
  SECURITY: [
    "security.dashboard",
    "security.visitors.manage",
    "security.visitors.view",
    "security.incidents.manage",
    "cctv.view",
    "residents.security_lookup",
    "announcements.view",
  ],
};

/** Role yang boleh diberikan oleh pemegang permission tertentu. */
export function assignableRoles(perms: ReadonlySet<string>): RoleKey[] {
  const out: RoleKey[] = [];
  if (perms.has("roles.assign_super_admin")) out.push("SUPER_ADMIN");
  if (perms.has("roles.assign_admin")) out.push("ADMIN");
  if (perms.has("roles.assign")) out.push("MEMBER", "SECURITY");
  return out;
}
