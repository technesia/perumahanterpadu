// Label Bahasa Indonesia untuk enum database (master status).
export const RESIDENT_STATUS = { ACTIVE: "Aktif", NEWCOMER: "Pendatang", MOVED: "Pindah", DECEASED: "Meninggal" } as const;
export const OCCUPANCY_STATUS = { PERMANENT: "Penghuni Tetap", TEMPORARY: "Sementara/Kontrak", VACANT: "Kosong" } as const;
export const MEMBERSHIP_RELATION = { HEAD: "Kepala Keluarga", FAMILY: "Anggota Keluarga", TENANT: "Penyewa" } as const;
export const BILL_STATUS = {
  NOT_BILLED: "Belum Ditagihkan",
  NOT_DUE: "Belum Jatuh Tempo",
  UNPAID: "Belum Bayar",
  PENDING: "Menunggu Verifikasi",
  PARTIAL: "Pembayaran Parsial",
  PAID: "Lunas",
  VOID: "Dibatalkan",
} as const;
export const PAYMENT_STATUS = {
  PENDING_VERIFICATION: "Menunggu Verifikasi",
  AWAITING_PROVIDER: "Menunggu Konfirmasi Provider",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
  FAILED: "Gagal",
} as const;
export const PAYMENT_METHOD = { CASH: "Tunai", BANK_TRANSFER: "Transfer Bank", QRIS: "QRIS" } as const;
export const ADMIN_REQUEST_STATUS = {
  SUBMITTED: "Diajukan", PROCESSING: "Diproses", APPROVED: "Disetujui", REJECTED: "Ditolak", CANCELLED: "Dibatalkan",
} as const;
export const BOOKING_STATUS = {
  PENDING: "Menunggu Review", APPROVED: "Disetujui", REJECTED: "Ditolak", CANCELLED: "Dibatalkan",
} as const;
export const PUBLISH_STATUS = { DRAFT: "Draft", PUBLISHED: "Terbit", ARCHIVED: "Arsip" } as const;
export const AUDIENCE = { ALL: "Semua", RESIDENTS: "Warga", SECURITY: "Security", INTERNAL: "Internal Pengurus" } as const;
export const ACTIVITY_STATUS = { PLANNED: "Terjadwal", ONGOING: "Berlangsung", DONE: "Selesai", CANCELLED: "Dibatalkan" } as const;
export const INCIDENT_STATUS = { OPEN: "Baru", IN_PROGRESS: "Ditindaklanjuti", RESOLVED: "Selesai", CLOSED: "Ditutup" } as const;
export const CAMERA_STATUS = { ONLINE: "Online", OFFLINE: "Offline", MAINTENANCE: "Perawatan", UNKNOWN: "Tidak Diketahui" } as const;
export const FINANCE_TYPE = { INCOME: "Pemasukan", EXPENSE: "Pengeluaran" } as const;
export const FINANCE_STATUS = { POSTED: "Tercatat", VOID: "Dibatalkan" } as const;
