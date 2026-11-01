# Deploy ke Vercel + Supabase

Target: **https://perumahanterpadu.vercel.app** dari repo GitHub `technesia/perumahanterpadu` (branch `main`).
Database dan penyimpanan berkas memakai **Supabase**. Semua rahasia diisi langsung di dashboard Supabase/Vercel —
jangan pernah dikirim lewat email atau di-commit ke Git.

## 1. Supabase (sudah disiapkan)

Project Supabase **`perumahanterpadu`** (organisasi Technesia, region Singapore) sudah dibuat dan diisi:

- Semua tabel dari 5 migration Prisma, plus riwayat `_prisma_migrations` sehingga build Vercel tidak
  menjalankan ulang migration.
- Data dasar: organisasi, 4 role, 51 permission, kategori keuangan, jenis pengajuan surat.
- Satu akun **Super Admin** (`superadmin`). **Ganti password-nya** lewat menu **Profil Saya** setelah login pertama.
- Bucket Storage **`berkas-privat`** (privat, maks. 4 MB, JPG/PNG/PDF).
- Keamanan: semua tabel aplikasi ditutup dari Data API Supabase (hak `anon`/`authenticated` dicabut, RLS aktif
  tanpa policy). Aplikasi hanya mengakses database dari server.

Tidak ada data warga, tagihan, maupun data demo.

## 2. Hubungkan Supabase ke Vercel

**Cara A — integrasi (disarankan, tanpa menyalin password):**
Supabase Dashboard → project `perumahanterpadu` → **Project Settings → Integrations → Vercel** → Install/Connect →
pilih team `taman-pesona-rajeg-mulya` dan project `perumahanterpadu`. Integrasi mengisi otomatis
`POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `SUPABASE_URL`, dan kunci server Supabase. Aplikasi membaca
nama-nama tersebut secara otomatis (tidak perlu `DATABASE_URL`/`DIRECT_URL`).

**Cara B — manual:** Supabase → **Connect**. Untuk password database: **Project Settings → Database → Reset database
password** (project dibuat lewat otomasi, password awalnya tidak diketahui siapa pun).

| Key di Vercel | Nilai |
|---|---|
| `DATABASE_URL` | Transaction pooler (port 6543) + `?pgbouncer=true&connection_limit=5` |
| `DIRECT_URL` | Session pooler (port 5432) |
| `SUPABASE_URL` | Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API Keys → `service_role` / secret key (**rahasia**) |

## 3. Kunci rahasia aplikasi (wajib, isi sendiri di Vercel)

Jalankan **dua kali** di laptop:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Vercel → project `perumahanterpadu` → **Settings → Environment Variables** (centang **Production**):

| Key | Value |
|---|---|
| `SESSION_SECRET` | hasil pertama |
| `DATA_ENCRYPTION_KEY` | hasil kedua — **simpan baik-baik, jangan pernah diganti** (NIK terenkripsi dengan kunci ini) |
| `EMERGENCY_AMBULANCE` / `EMERGENCY_POLICE` / `EMERGENCY_PLN` | nomor yang sudah diverifikasi (opsional) |
| `EMERGENCY_VERIFIED` | `true` setelah nomor diverifikasi |

Yang otomatis/bawaan sehingga **tidak perlu** diisi: `ORGANIZATION_SLUG` (bawaan `taman-pesona-rajeg-mulya`),
`TRUST_PROXY` (otomatis di Vercel), `STORAGE_DRIVER` (otomatis Supabase di Vercel bila kunci Supabase tersedia),
`SUPABASE_STORAGE_BUCKET` (bawaan `berkas-privat`). **Jangan** set `LOCAL_HTTP` maupun `DEMO_PASSWORD`.

## 4. Deploy & login

1. Merge PR ke `main` (atau **Deployments → Redeploy** setelah mengisi environment variables).
   Build production menjalankan `prisma migrate deploy` (tidak ada perubahan) dan seed idempoten.
2. Cek <https://perumahanterpadu.vercel.app/api/health>, lalu login sebagai `superadmin`.
3. Ganti password Super Admin di **Profil Saya**, lalu buat akun Admin/Security/warga, isi Master IPL, Data Rumah,
   Data Warga (bisa impor Excel), dan Tunggakan Awal.

Akun Super Admin tambahan atau reset password dapat dibuat dari laptop dengan `npm run setup:superadmin`
(set `$env:DATABASE_URL` ke Session pooler URL terlebih dahulu).

## 5. Update aplikasi

Setiap merge ke `main` otomatis di-deploy ulang oleh Vercel, termasuk migration & sinkronisasi permission.
Preview deployment (branch lain/PR) **tidak** menjalankan migration ke database production.

## 6. Backup

- Supabase paket gratis menyimpan backup harian terbatas; untuk data warga sungguhan disarankan paket berbayar
  (Point-in-Time Recovery) **atau** backup manual berkala dari laptop:
  ```bash
  pg_dump "<DIRECT_URL>" --format=custom --file=backup-$(date +%F).dump
  ```
- Berkas di bucket `berkas-privat` dapat diunduh dari dashboard Storage.

## Catatan batasan Vercel

- Ukuran upload maksimal **4 MB** per berkas (batas request Vercel 4,5 MB); impor Excel juga maksimal 4 MB.
- Activity Log realtime memakai SSE yang disambung ulang otomatis tiap ±50 detik; bila terputus, beralih ke polling.
- Paket Hobby Vercel ditujukan untuk penggunaan non-komersial; pertimbangkan paket Pro bila dipakai organisasi.
