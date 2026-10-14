# Panduan Deployment — Taman Pesona Rajeg Mulya

Panduan ini untuk satu server Linux (VPS) dengan Node.js, PostgreSQL, dan reverse proxy HTTPS.
Langkah yang ditandai **(diuji)** telah dijalankan pada lingkungan pengembangan; langkah server/proxy adalah
konfigurasi standar yang perlu disesuaikan dengan server Anda.

## 1. Prasyarat

| Komponen | Versi |
|---|---|
| Node.js | 20 LTS atau 22 LTS |
| PostgreSQL | 14+ (diuji pada 16), dengan ekstensi `btree_gist` (bawaan paket PostgreSQL) |
| Reverse proxy | nginx / Caddy dengan sertifikat HTTPS |
| `pg_dump`, `pg_restore`, `psql` | sama atau lebih baru dari versi server PostgreSQL (untuk backup) |

## 2. Database

```sql
CREATE USER tprm WITH PASSWORD '<password-kuat>';
CREATE DATABASE tprm OWNER tprm;
```

Migration pertama membuat ekstensi `btree_gist`. Bila user aplikasi tidak boleh membuat ekstensi, jalankan sekali
sebagai superuser: `CREATE EXTENSION IF NOT EXISTS btree_gist;` di database `tprm`.

## 3. Konfigurasi `.env`

Salin `.env.example` → `.env`, lalu isi:

| Variabel | Keterangan |
|---|---|
| `DATABASE_URL` | URL PostgreSQL production |
| `ORGANIZATION_SLUG` | Biarkan `taman-pesona-rajeg-mulya` |
| `SESSION_SECRET` | `openssl rand -hex 32` — **wajib**, aplikasi menolak berjalan bila < 32 karakter |
| `DATA_ENCRYPTION_KEY` | `openssl rand -hex 32` — **wajib**; mengenkripsi NIK & nomor identitas tamu. **Simpan cadangannya di tempat aman. Jangan diganti setelah ada data** (data lama tidak dapat dibaca). |
| `SESSION_TTL_HOURS` | Lama sesi login (default 12) |
| `TRUST_PROXY` | `true` hanya bila di belakang reverse proxy yang menimpa `X-Real-IP` (lihat §6) |
| `STORAGE_DIR` | Folder berkas privat, di luar folder web, mis. `/var/lib/tprm/storage` |
| `MAX_UPLOAD_MB` | Batas ukuran unggahan (default 5) |
| `EMERGENCY_*` | Nomor darurat; set `EMERGENCY_VERIFIED="true"` setelah pengurus memverifikasi |
| `QRIS_*` | Kosongkan sampai provider QRIS tersedia (lihat `docs/STATUS.md`) |

`TEST_DATABASE_URL` tidak diperlukan di production.

## 4. Instalasi & build **(diuji)**

```bash
npm ci                    # juga menjalankan prisma generate
npm run db:migrate        # prisma migrate deploy — aman untuk production
npm run db:seed           # master data, idempoten
npm run build
npm run setup:superadmin  # interaktif; membuat Super Admin pertama
```

Jangan menjalankan `npm run seed:demo` di production (skrip menolak bila `NODE_ENV=production`).

## 5. Menjalankan aplikasi

```bash
NODE_ENV=production npm start -- -p 3000
```

Contoh unit systemd `/etc/systemd/system/tprm.service`:

```ini
[Unit]
Description=Taman Pesona Rajeg Mulya
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/tprm
EnvironmentFile=/opt/tprm/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start -- -p 3000
Restart=always
User=tprm

[Install]
WantedBy=multi-user.target
```

Health check: `GET /api/health` → `{"status":"ok"}` bila aplikasi dan database siap **(diuji)**.

## 6. Reverse proxy (HTTPS)

Contoh nginx:

```nginx
server {
  listen 443 ssl http2;
  server_name warga.contoh.id;
  # ssl_certificate ... (mis. dari Let's Encrypt)
  client_max_body_size 30m;           # unggahan bukti/dokumen (maks. beberapa berkas × MAX_UPLOAD_MB)

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;           # ditimpa proxy → aman dipercaya (TRUST_PROXY=true)
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # Activity Log realtime (Server-Sent Events): matikan buffering
  location /api/audit-logs/stream {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_buffering off;
    proxy_read_timeout 1h;
  }
}
```

Bila SSE tidak didukung proxy, halaman Activity Log otomatis beralih ke polling 10 detik.

## 7. Backup & restore **(diuji)**

### Backup

```bash
set -a; . ./.env; set +a
BACKUP_DIR=/var/backups/tprm npm run backup
```

Menghasilkan `tprm-<waktu>.dump` (database, format custom pg_dump), `tprm-<waktu>-storage.tar.gz` (berkas privat), dan
`tprm-<waktu>.sha256`. Backup buatan skrip yang lebih lama dari `BACKUP_RETENTION_DAYS` (default 30) dihapus.

Jadwal harian (cron, pukul 02.15):

```cron
15 2 * * * cd /opt/tprm && set -a && . ./.env && set +a && BACKUP_DIR=/var/backups/tprm bash scripts/backup.sh >> /var/log/tprm-backup.log 2>&1
```

Simpan salinan backup **di luar server** (mis. penyimpanan cloud terenkripsi) beserta `DATA_ENCRYPTION_KEY`.

### Restore

Restore **selalu ke database baru yang kosong** — skrip menolak menimpa database atau folder storage yang berisi data.

```bash
createdb -O tprm tprm_restore
bash scripts/restore.sh /var/backups/tprm/tprm-20261014-021500 postgresql://tprm:...@localhost:5432/tprm_restore /var/lib/tprm/storage-restore
```

Skrip memverifikasi checksum, memulihkan database & berkas, lalu menampilkan ringkasan jumlah data. Setelah diperiksa:
hentikan aplikasi, arahkan `DATABASE_URL` dan `STORAGE_DIR` ke hasil restore, jalankan `npm run db:migrate`, start ulang.

Hasil uji restore: jumlah organisasi/akun/warga/tagihan/pembayaran/transaksi/audit log identik dengan sumber, seluruh
berkas kembali, exclusion constraint booking dan trigger append-only audit log tetap aktif, restore kedua ke database
yang sama ditolak.

## 8. Pembaruan aplikasi

```bash
bash scripts/backup.sh      # selalu backup lebih dulu
git pull
npm ci
npm run db:migrate
npm run db:seed             # sinkronkan permission bila ada perubahan matriks role
npm run build
sudo systemctl restart tprm
```

## 9. Pemulihan akses Super Admin

Bila password Super Admin hilang atau akun terkunci, jalankan di server:

```bash
npm run setup:superadmin    # masukkan username yang sama untuk reset password & mengaktifkan ulang
```

Tindakan ini tercatat di Activity Log.

## 10. Uji performa (opsional)

`scripts/perf-check.ts` membuat 300 rumah × 60 bulan tagihan (18.000) dan 5.000 transaksi pada database khusus
(nama mengandung `perf`), lalu mengukur query utama. Hasil di lingkungan pengembangan: semua operasi < 100 ms
(dashboard 22 ms, IPL Belum Bayar 69 ms, rekap tahunan 10 ms, tagihan warga 60 bulan 14 ms).
