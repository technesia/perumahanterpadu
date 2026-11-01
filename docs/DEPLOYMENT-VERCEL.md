# Deploy ke Vercel + Supabase

Target: **https://perumahanterpadu.vercel.app** dari repo GitHub `technesia/perumahanterpadu` (branch `main`).
Database dan penyimpanan berkas memakai **Supabase**. Semua rahasia diisi langsung di dashboard Supabase/Vercel —
jangan pernah dikirim lewat chat, email, atau di-commit ke Git.

## 1. Supabase

1. Buat akun di <https://supabase.com> → **New project**.
   - Name: `perumahanterpadu` · Region: **Southeast Asia (Singapore)**.
   - **Database Password**: buat password kuat dan simpan di password manager. Hindari karakter `@ : / ? # %`
     (atau URL-encode bila dipakai).
2. **Penyimpanan berkas**: menu **Storage → New bucket**.
   - Name: `berkas-privat` · **Public bucket: OFF** (wajib privat).
   - Tidak perlu membuat policy: aplikasi mengakses bucket dari server memakai service role key dan memeriksa
     izin setiap unduhan sendiri.
3. Catat nilai berikut (tombol **Connect** di atas dashboard project, dan **Project Settings → API**):

| Nilai | Dari mana | Contoh bentuk |
|---|---|---|
| `DATABASE_URL` | Connect → **Transaction pooler** (port **6543**), tambahkan `?pgbouncer=true&connection_limit=5` | `postgresql://postgres.abcd:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5` |
| `DIRECT_URL` | Connect → **Session pooler** (port **5432**) | `postgresql://postgres.abcd:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres` |
| `SUPABASE_URL` | Project Settings → API → Project URL | `https://abcd.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` (secret) | `eyJ...` — **rahasia** |

## 2. Buat kunci rahasia aplikasi

Di laptop (PowerShell atau terminal), jalankan **dua kali** — satu untuk `SESSION_SECRET`, satu untuk
`DATA_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`DATA_ENCRYPTION_KEY` mengenkripsi NIK. **Simpan baik-baik dan jangan pernah diganti** setelah ada data —
bila hilang, NIK yang tersimpan tidak dapat dibaca lagi.

## 3. Vercel

1. <https://vercel.com> → **Add New… → Project** → **Import** repo `technesia/perumahanterpadu`.
   (Bila repo tidak terlihat: **Adjust GitHub App Permissions** dan beri akses ke repo tersebut.)
2. **Project Name**: `perumahanterpadu` (menghasilkan `perumahanterpadu.vercel.app`).
   Framework: Next.js (terdeteksi otomatis). Build Command & Output: biarkan bawaan — Vercel otomatis memakai
   script `vercel-build` yang menjalankan migration + seed lalu build.
3. **Environment Variables** (centang **Production**; untuk Preview cukup bila memang dipakai):

| Key | Value |
|---|---|
| `DATABASE_URL` | Transaction pooler (langkah 1.3) |
| `DIRECT_URL` | Session pooler (langkah 1.3) |
| `ORGANIZATION_SLUG` | `taman-pesona-rajeg-mulya` |
| `SESSION_SECRET` | hasil langkah 2 |
| `DATA_ENCRYPTION_KEY` | hasil langkah 2 (berbeda dari SESSION_SECRET) |
| `SESSION_TTL_HOURS` | `12` |
| `TRUST_PROXY` | `true` (Vercel mengirim IP asli pengunjung di `x-real-ip`) |
| `STORAGE_DRIVER` | `supabase` |
| `SUPABASE_URL` | langkah 1.3 |
| `SUPABASE_SERVICE_ROLE_KEY` | langkah 1.3 |
| `SUPABASE_STORAGE_BUCKET` | `berkas-privat` |
| `MAX_UPLOAD_MB` | `4` |
| `EMERGENCY_AMBULANCE` / `EMERGENCY_POLICE` / `EMERGENCY_PLN` | nomor yang sudah diverifikasi |
| `EMERGENCY_VERIFIED` | `true` setelah nomor diverifikasi |

   **Jangan** set `LOCAL_HTTP` dan `DEMO_PASSWORD` di Vercel.
4. Klik **Deploy**. Build menjalankan `prisma migrate deploy` dan seed dasar (role, permission, kategori keuangan,
   jenis surat). Database production **tidak** berisi data demo maupun akun apa pun.
5. Cek: <https://perumahanterpadu.vercel.app/api/health> harus menampilkan status OK, lalu buka halaman login.

## 4. Akun Super Admin pertama

Super Admin dibuat dari laptop (tidak ada pendaftaran Super Admin lewat web). Di folder project:

```powershell
cd C:\Users\Admin\perumahanterpadu
git pull
$env:DATABASE_URL="<DIRECT_URL dari Supabase>"
$env:ORGANIZATION_SLUG="taman-pesona-rajeg-mulya"
npm run setup:superadmin
```

Isi nama, username, email, dan password (minimal 10 karakter, kombinasi huruf & angka). Setelah selesai, tutup
jendela PowerShell tersebut agar nilai rahasia tidak tertinggal, lalu login di
<https://perumahanterpadu.vercel.app>. Dari sana Super Admin membuat akun Admin/Security/warga, mengisi Master IPL,
Data Rumah, Data Warga (bisa impor Excel), dan Tunggakan Awal.

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
