// Master data yang di-seed. Status warga/hunian/pembayaran/pengajuan disimpan
// sebagai enum database; label Bahasa Indonesia ada di src/lib/labels.ts.

export const DEFAULT_ORGANIZATION = {
  slug: "taman-pesona-rajeg-mulya",
  name: "Taman Pesona Rajeg Mulya",
  rt: "004",
  rw: "04",
  village: "Desa Rajeg Mulya",
  regency: "Kab Tangerang",
};

export const FINANCE_CATEGORIES = [
  { type: "INCOME", code: "INC_IPL", name: "IPL", isSystem: true },
  { type: "INCOME", code: "INC_OTHER_DUES", name: "Iuran Lainnya", isSystem: false },
  { type: "INCOME", code: "INC_FACILITY", name: "Pendapatan Fasilitas", isSystem: false },
  { type: "INCOME", code: "INC_OPERATIONAL", name: "Pemasukan Operasional Lainnya", isSystem: false },
  { type: "EXPENSE", code: "EXP_CLEANING", name: "Kebersihan", isSystem: false },
  { type: "EXPENSE", code: "EXP_SECURITY", name: "Keamanan", isSystem: false },
  { type: "EXPENSE", code: "EXP_ELECTRICITY", name: "Listrik Fasilitas Umum", isSystem: false },
  { type: "EXPENSE", code: "EXP_MAINTENANCE", name: "Perawatan Fasilitas", isSystem: false },
  { type: "EXPENSE", code: "EXP_REPAIR", name: "Perbaikan Lingkungan", isSystem: false },
  { type: "EXPENSE", code: "EXP_ACTIVITY", name: "Kegiatan Warga", isSystem: false },
  { type: "EXPENSE", code: "EXP_OTHER", name: "Operasional Lainnya", isSystem: false },
] as const;

export const ADMIN_REQUEST_TYPES = [
  { code: "DOMICILE", name: "Surat Keterangan Tempat Tinggal" },
  { code: "RENTAL", name: "Surat Keterangan Kontrak/Sewa" },
  { code: "MARRIAGE", name: "Surat Administrasi/Pernikahan" },
  { code: "OTHER", name: "Pengajuan Lainnya" },
] as const;

export const ACTIVITY_CATEGORIES = [
  "Kerja Bakti",
  "Rapat Warga",
  "Kegiatan Sosial",
  "Posyandu",
  "Kegiatan Lingkungan",
  "Lainnya",
] as const;

export const ANNOUNCEMENT_CATEGORIES = ["Umum", "Keamanan", "Keuangan", "Kegiatan", "Fasilitas"] as const;

export const INCIDENT_TYPES = [
  "Pencurian",
  "Kehilangan",
  "Gangguan Ketertiban",
  "Kebakaran",
  "Kecelakaan",
  "Orang Mencurigakan",
  "Lainnya",
] as const;
