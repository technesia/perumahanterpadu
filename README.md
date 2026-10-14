# Taman Pesona Rajeg Mulya — Aplikasi Pengelolaan Perumahan

Aplikasi web operasional untuk **Perumahan Taman Pesona Rajeg Mulya**, RT 004 RW 04, Desa Rajeg Mulya, Kab Tangerang.

Stack: Next.js 15 (App Router) + TypeScript · Tailwind CSS · PostgreSQL 16 + Prisma · Zod · Vitest.

## Status pengembangan

| Phase | Cakupan | Status |
|---|---|---|
| 1 — Foundation | Skema database lengkap, migration, seed, autentikasi, RBAC, organization context, setup Super Admin, design system | ✅ Selesai |
| 2 — Core Management | Dashboard, warga, rumah, akun, IPL, pembayaran, verifikasi, tunggakan | ⏳ Berikutnya |
| 3 — Finance & Administration | Keuangan masuk/keluar, saldo kas, pengajuan surat, Activity Log | ⏳ |
| 4 — Community | Pengumuman, kegiatan, fasilitas, booking, notifikasi, UMKM, Posyandu | ⏳ |
| 5 — Security | Buku tamu, laporan kejadian, CCTV, kontak darurat | ⏳ |
| 6 — QA | Pengujian menyeluruh, dokumentasi deployment, backup/restore | ⏳ |

## Instalasi (development)

Prasyarat: Node.js 20+ dan PostgreSQL 14+ (dengan ekstensi `btree_gist`, tersedia di paket standar PostgreSQL).

```bash
npm install
cp .env.example .env          # isi DATABASE_URL, TEST_DATABASE_URL, SESSION_SECRET
npm run db:migrate            # menerapkan seluruh migration
npm run db:seed               # master data (aman dijalankan ulang)
npm run setup:superadmin      # membuat Super Admin pertama (interaktif)
npm run dev                   # http://localhost:3000
```

`SESSION_SECRET` dibuat dengan `openssl rand -hex 32`.

## Setup Super Admin pertama

Tidak ada akun default dan tidak ada registrasi Super Admin publik. Super Admin dibuat dari shell server:

```bash
npm run setup:superadmin
# atau non-interaktif (mis. di pipeline deployment):
SA_NAME="Nama" SA_USERNAME="username" SA_EMAIL="email@domain" SA_PASSWORD="..." npm run setup:superadmin
```

Password minimal 10 karakter berisi huruf dan angka. Perintah yang sama dapat dipakai untuk memulihkan akses
Super Admin (mereset password / mengaktifkan kembali akun). Setiap eksekusi tercatat di audit log.

## Migration & seeding

- `npm run db:migrate` — `prisma migrate deploy`, aman untuk production.
- `npm run db:migrate:dev` — membuat migration baru saat development.
- `npm run db:seed` — organisasi, 4 role, permission & matriks role, kategori keuangan, jenis pengajuan surat.
  Idempoten: menjalankan ulang tidak membuat duplikat dan menyinkronkan matriks permission.
- Seed **tidak** membuat akun, data warga, transaksi, maupun nomor darurat.

Constraint penting yang ditambahkan manual pada migration awal:
`facility_bookings_no_overlap` (exclusion constraint anti booking bentrok), CHECK nominal tidak negatif,
unique keanggotaan rumah aktif, dan trigger yang membuat `audit_logs` append-only.

## Testing

```bash
npm test
```

Test memakai `TEST_DATABASE_URL` sebagai koneksi dasar. Setiap run membuat database sementara
`tprm_test_run_<timestamp>`, menerapkan migration dari kosong, menjalankan test, lalu menghapus database
sementara tersebut. Database development tidak disentuh. User database memerlukan hak `CREATEDB`.

## Arsitektur

```
prisma/                 schema, migration, seed
scripts/                setup command (Super Admin)
src/app/                presentation layer (halaman & server actions tipis)
src/components/         design system & layout
src/lib/                utilitas murni (tanggal WIB, format Rupiah, label)
src/server/
  auth/                 sesi, password, rate limit, konteks autentikasi
  rbac/                 daftar permission & matriks role
  services/             business logic (memeriksa permission + organization context)
  organization.ts       organization context dari konfigurasi server
  audit.ts              audit log append-only
  storage.ts            penyimpanan berkas privat
tests/                  automated tests (Vitest)
```

### Multi-tenant (fondasi)

Semua record bisnis memiliki `organizationId`. Organization context ditentukan oleh `ORGANIZATION_SLUG` di
server dan tidak pernah dibaca dari request. Sesi pengguna dari organisasi lain ditolak. Tidak ada UI
pemilihan atau pengelolaan organisasi.

### Keamanan

- Password di-hash bcrypt (cost 12); token sesi acak 256-bit, disimpan sebagai hash di DB, cookie `httpOnly`, `SameSite=Lax`, `Secure` di production.
- Rate limiting login berbasis DB (10 gagal / 15 menit per IP & per identitas) + penguncian akun setelah 5 gagal berturut-turut.
- Permission dibaca dari DB dan diperiksa di setiap service/endpoint, bukan sekadar menyembunyikan menu.
- Route handler mutasi memeriksa header `Origin` (CSRF); Server Actions Next.js memiliki proteksi origin bawaan.
- Upload divalidasi dari isi berkas (magic bytes JPG/PNG/PDF) dan ukuran, disimpan di luar folder publik.

## Keputusan desain

- **Tagihan IPL per rumah** (bukan per individu), agar keluarga dengan beberapa anggota tidak ditagih ganda.
  Penanggung jawab tagihan dicatat pada tiap tagihan.
- **Uang** disimpan sebagai `Int` Rupiah utuh — tanpa floating-point.
- **Zona waktu** operasional WIB (Asia/Jakarta).
- **Logo**: file asli pemesan; hanya margin putih yang dipangkas (`public/brand/logo.jpg`), file asli tetap di
  `public/brand/logo-original.jpg`.
