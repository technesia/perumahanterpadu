# Taman Pesona Rajeg Mulya — Aplikasi Pengelolaan Perumahan

Aplikasi web operasional untuk **Perumahan Taman Pesona Rajeg Mulya**, RT 004 RW 04, Desa Rajeg Mulya, Kab Tangerang.

Stack: Next.js 15 (App Router) + TypeScript · Tailwind CSS · PostgreSQL 16 + Prisma · Zod · Vitest.

## Status pengembangan

| Phase | Cakupan | Status |
|---|---|---|
| 1 — Foundation | Skema database lengkap, migration, seed, autentikasi, RBAC, organization context, setup Super Admin, design system | ✅ Selesai |
| 2 — Core Management | Dashboard per role, warga, rumah, akun, IPL, pembayaran & bukti transfer, verifikasi, tunggakan | ✅ Selesai |
| 3 — Finance & Administration | Keuangan masuk/keluar, saldo kas, rekap, pengajuan surat, Activity Log realtime, pengaturan, matriks role | ✅ Selesai |
| 4 — Community | Pengumuman, kegiatan, fasilitas, booking kalender, notifikasi, UMKM, Posyandu | ✅ Selesai |
| 5 — Security | Buku tamu, laporan kejadian, CCTV, kontak darurat | ✅ Selesai |
| 6 — QA | Review keamanan, uji RBAC & isolasi, uji performa, backup/restore teruji, dokumentasi | ✅ Selesai |

Dokumen penting:

- **[docs/STATUS.md](docs/STATUS.md)** — fitur selesai, integrasi yang belum aktif, dan checklist acceptance test #1–#54.
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — deployment production, reverse proxy, backup & restore, pembaruan.

## Coba cepat dengan Docker (lokal)

Cara termudah mencoba aplikasi di komputer sendiri — hanya perlu [Docker Desktop](https://www.docker.com/products/docker-desktop/):

```bash
git clone https://github.com/technesia/perumahanterpadu.git
cd perumahanterpadu
docker compose up --build
```

Tunggu sampai log menampilkan `aplikasi siap di http://localhost:3000`, lalu buka **http://localhost:3000**.
Saat start, container otomatis menjalankan migration, seed master data, dan data demo.

| Akun demo | Password | Role |
|---|---|---|
| `superadmin.demo` | `DemoWarga12345` | Super Admin (termasuk menu **Kontrol Akses**) |
| `admin.demo` | `DemoWarga12345` | Admin |
| `warga.demo` | `DemoWarga12345` | Member (punya tunggakan IPL untuk dicoba) |
| `security.demo` | `DemoWarga12345` | Security |

Opsi:

- Port lain: `APP_PORT=8080 docker compose up --build`
- Super Admin sendiri: `SA_USERNAME=pengurus SA_PASSWORD=PasswordKuat123 docker compose up --build`
- Tanpa data demo: `DEMO_PASSWORD= docker compose up --build`
- Berhenti: `docker compose down` (data tetap tersimpan) · hapus semua data: `docker compose down -v`

Setup Docker ini **khusus untuk mencoba di komputer lokal**: kunci rahasianya publik dan aplikasi berjalan lewat
HTTP (`LOCAL_HTTP=true` mematikan HSTS dan cookie `Secure`). Untuk server production ikuti
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

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

## Data demo (opsional, bukan production)

```bash
DEMO_PASSWORD="PasswordDemoAnda123" npm run seed:demo
```

Membuat rumah Blok D, warga berlabel `[DEMO]`, tagihan 8 bulan terakhir, dan akun `superadmin.demo`, `admin.demo`,
`warga.demo`, `security.demo` dengan password dari `DEMO_PASSWORD`. Ditolak bila `NODE_ENV=production`.

## Aturan IPL

- Tagihan diterbitkan per **rumah**, per **jenis iuran**, per **periode bulanan**; unique constraint mencegah tagihan ganda
  (penerbitan ulang aman — yang sudah ada dilewati).
- **Jendela pelacakan** default 60 bulan berakhir di bulan berjalan (Okt 2026 → Nov 2021 s.d. Okt 2026), diatur
  `organizations.arrearsWindowMonths`.
- **Tunggakan** = tagihan Belum Bayar/Parsial yang tanggal jatuh temponya **sudah lewat**. Belum ditagihkan, belum jatuh
  tempo, dan yang sedang Menunggu Verifikasi tidak dihitung tunggakan.
- Satu pembayaran dapat mencakup beberapa periode (`ipl_payment_allocations`). Periode yang sedang menunggu verifikasi
  atau sudah lunas tidak dapat diajukan lagi (dikunci `SELECT … FOR UPDATE`).
- Transfer bank **wajib** bukti (JPG/PNG/PDF, divalidasi dari isi berkas). Pengajuan selalu **Menunggu Verifikasi**.
- Persetujuan Admin (dalam satu transaksi DB): periode → Lunas/Parsial, catat pemasukan kas `IPL_PAYMENT` tepat satu
  kali (unique `iplPaymentId`), notifikasi warga, audit log. Penolakan wajib beralasan dan tidak mengubah tagihan.
- Pembayaran parsial dinonaktifkan secara default (`organizations.allowPartialPayment`).
- **QRIS**: struktur adapter + webhook idempoten sudah ada (`src/server/payments/qris.ts`,
  `/api/payments/qris/webhook`), tetapi **belum ada provider yang terpasang** — opsi QRIS tampil nonaktif.

## Kontrol Akses (Super Admin)

Menu **Sistem → Kontrol Akses** (hanya Super Admin) berisi dua tombol darurat:

- **Nonaktifkan semua akun** — semua akun selain Super Admin langsung dikeluarkan (sesi dicabut) dan tidak dapat
  masuk. Status aktif/nonaktif masing-masing akun tidak diubah, sehingga mematikan tombol memulihkan akses seperti
  semula.
- **Mode lihat saja** — pengguna selain Super Admin tetap dapat masuk dan melihat data, tetapi semua perubahan
  ditolak di server (setiap server action dianggap mengubah data kecuali ditandai `readOnly`). Banner ditampilkan
  di semua halaman.

Setiap perubahan meminta konfirmasi dan tercatat di Activity Log.

## Aturan keuangan

- **Saldo akhir = saldo awal + pemasukan tercatat − pengeluaran tercatat**, dihitung sejak tanggal berlaku saldo
  awal terbaru. Saldo awal hanya diatur Super Admin; riwayatnya disimpan dan tercatat di audit log.
- Pemasukan IPL dibuat **otomatis** saat pembayaran diverifikasi (sumber `IPL_PAYMENT`, satu kali per pembayaran).
  Kategori IPL tidak dapat dipakai untuk pemasukan manual, sehingga tidak ada pencatatan ganda.
- Transaksi manual dikoreksi dengan **alasan wajib**; nilai sebelum & sesudah disimpan di
  `finance_transaction_histories` dan audit log. Pembatalan menandai transaksi *Dibatalkan* (tidak dihapus) dan
  mengeluarkannya dari saldo.
- Pengeluaran hanya mengurangi saldo kas — tidak pernah mengubah status IPL warga.

## Aturan booking gedung

- Slot mengikuti jam operasional dan durasi slot fasilitas; satu hari hanya ditandai **Tidak Tersedia** bila semua
  slotnya terisi.
- Dua booking **konflik** bila fasilitasnya sama dan rentang waktunya tumpang tindih (`[mulai, selesai)` — booking
  bersebelahan diperbolehkan).
- Pengecekan konflik di backend dalam transaksi dengan **advisory lock per fasilitas**; database juga memasang
  **exclusion constraint** sehingga dua booking *Disetujui* tidak mungkin bertabrakan.
- Slot *Menunggu Review* ditahan bila `holdPendingBookings` aktif (default). Bila dinonaktifkan, beberapa pengajuan
  boleh masuk dan saat satu disetujui, pengajuan lain yang bertabrakan **ditolak otomatis**.
- Kalender untuk warga hanya menampilkan status slot — nama pemesan hanya terlihat pengurus; nomor HP dan alamat
  warga lain tidak pernah dikirim.
- Notifikasi (belum/sudah dibaca) untuk booking baru, disetujui, ditolak, dan dibatalkan; klik membuka detail.

## Keamanan lingkungan

- **Buku tamu**: tamu masuk/keluar dengan nomor kunjungan, pencarian nama/rumah/plat/tanggal/status. Nomor identitas
  bersifat opsional, disimpan terenkripsi, tidak pernah dikirim di daftar, dan hanya tampil tersamar di detail.
  Check-out dilindungi dari pencatatan ganda.
- **Laporan kejadian**: Security membuat laporan dengan lampiran privat; Admin/Super Admin menindaklanjuti (status &
  catatan pengurus) dan pelapor menerima notifikasi.
- **CCTV**: direktori kamera. Tautan akses disimpan di server, **tidak pernah dirender di halaman**, dan dibuka
  melalui `/api/cctv/:id/open` (cek izin + audit log setiap akses). URL berisi kredensial ditolak. Live streaming
  belum terintegrasi.
- **Kontak darurat**: Ambulans/Polisi/PLN dari variabel lingkungan `EMERGENCY_*` (bukan database). Nomor default
  adalah layanan nasional (119/110/123) dan ditandai **belum diverifikasi** sampai `EMERGENCY_VERIFIED="true"`.
  Nomor dengan format tidak valid tidak ditampilkan sebagai tombol telepon.

## Activity Log realtime

Semua log ditulis oleh backend ke tabel `audit_logs` (append-only, dijaga trigger DB). Halaman Activity Log menerima
log baru melalui **Server-Sent Events** (`/api/audit-logs/stream`, server memeriksa log baru tiap 3 detik). Bila SSE
gagal, klien otomatis beralih ke **polling 10 detik** (`/api/audit-logs?since=`). Percobaan login gagal juga dicatat.

## Testing

```bash
npm test
```

CI (GitHub Actions, `.github/workflows/ci.yml`) menjalankan pada setiap push ke `main` dan setiap pull request:
typecheck, lint, migration dari database kosong + seed dua kali, seluruh automated test terhadap PostgreSQL 16, dan
production build.

Test memakai host & kredensial dari `TEST_DATABASE_URL` (database pada URL tersebut tidak harus ada; setup terhubung lewat database bawaan `postgres`). Setiap run membuat database sementara
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
