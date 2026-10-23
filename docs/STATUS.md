# Status Fitur & Acceptance Test

Status per 14 Oktober 2026. "Selesai" berarti: terhubung ke database, divalidasi & diotorisasi di backend, dan diuji
(automated test dan/atau uji browser end-to-end). Total **91 automated tests** (`npm test`) + uji browser 153 halaman
(3 role × 3 lebar layar).

## Fitur selesai

| Modul | Cakupan |
|---|---|
| Fondasi | Skema lengkap dengan `organizationId`, migration, seed idempoten, organization context dari server |
| Autentikasi | Login email/username, logout, bcrypt, sesi ber-hash, rate limit DB, penguncian akun, akun nonaktif, ganti password, reset oleh Admin, setup Super Admin via CLI |
| RBAC | 4 role, 48 permission di DB, matriks dapat dilihat, aturan pemberian role, proteksi Super Admin terakhir |
| Dashboard | Super Admin/Admin, Member, Security — semua angka dari DB, statistik dapat diklik |
| Data warga & rumah | CRUD, cari/filter/sort/pagination, status warga & hunian terpisah, tanggal meninggal (≤10 th, koreksi khusus SA), arsip, histori, NIK terenkripsi, histori penghuni rumah |
| IPL | Master iuran, penerbitan tagihan idempoten, jendela 60 bulan (dapat diatur), status lengkap, pembayaran multi-periode dengan alokasi, bukti transfer privat, verifikasi/penolakan, pembayaran parsial (opsional), IPL Belum Bayar & tunggakan per periode, peringatan tunggakan warga |
| Keuangan | Pemasukan/pengeluaran manual dengan nota, pemasukan IPL otomatis sekali, koreksi beralasan dengan histori, pembatalan, saldo awal, rekap bulanan/tahunan/kategori |
| Administrasi | Pengajuan surat dengan dokumen, alur status, catatan internal, histori, jenis dapat dikonfigurasi |
| Komunitas | Pengumuman (audiens, prioritas, lampiran), kegiatan, fasilitas, booking kalender anti-bentrok, notifikasi, UMKM (persetujuan pemilik), Posyandu |
| Keamanan | Buku tamu masuk/keluar, laporan kejadian & tindak lanjut, direktori CCTV dengan akses berizin, kontak darurat |
| IPL | Tunggakan awal: input manual (per periode / total nominal), impor Excel dengan pratinjau & berkas validasi, koreksi beraudit, ringkasan piutang; impor Data Warga |
| Sistem | Activity Log append-only dengan realtime SSE + fallback polling, pengaturan kebijakan, Kontrol Akses Super Admin (nonaktifkan semua akun & mode lihat saja), health check |
| Operasional | Backup/restore teruji, panduan deployment, uji performa |

## Belum aktif / memerlukan pihak eksternal

| Item | Status | Yang diperlukan |
|---|---|---|
| **QRIS** | Struktur adapter (`src/server/payments/qris.ts`), webhook idempoten (`/api/payments/qris/webhook`), pencocokan nominal & transaction ID sudah ada dan diuji dengan provider tiruan. **Belum ada provider terpasang**; opsi QRIS tampil nonaktif. | Akun provider (mis. Midtrans/Xendit), implementasi adapter untuk API provider tersebut, `QRIS_PROVIDER`, `QRIS_SERVER_KEY`, `QRIS_WEBHOOK_SECRET`, URL webhook publik HTTPS |
| **Reset password mandiri via email** | Tidak diimplementasikan (belum ada layanan email). Reset dilakukan Admin; Super Admin via CLI. | Layanan email (SMTP/transactional) |
| **Live streaming CCTV** | Direktori + tautan aman saja. | Perangkat NVR/aplikasi kamera dengan tautan web yang aman |
| **Nomor darurat production** | Nomor nasional 119/110/123 dengan peringatan "belum diverifikasi". | Verifikasi pengurus, lalu `EMERGENCY_VERIFIED="true"` |
| **Logo** | Memakai file pemesan (margin putih dipangkas). Ikon kecil favicon memakai logo yang sama. | Opsional: logo versi ikon/transparan (PNG/SVG) |
| **Object storage** | Berkas privat di disk server (`STORAGE_DIR`) — sudah di luar folder web dan diakses lewat cek izin. | Opsional: S3/GCS bila server lebih dari satu |
| **Multi-tenant** | Hanya fondasi (kolom `organizationId`, isolasi query, sesi lintas organisasi ditolak). Tidak ada UI tenant — sesuai requirement. | — |

## Catatan keamanan

- Header keamanan: CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS (production).
- Rate limit per IP hanya aktif bila `TRUST_PROXY=true` di belakang reverse proxy tepercaya; tanpa itu rate limit tetap
  berlaku per akun/identitas + penguncian akun.
- `npm audit --omit=dev` (setelah pembaruan Next.js 15.5.27 yang menutup kerentanan **critical** RCE): tersisa
  `postcss` yang dibundel Next.js (hanya memproses CSS milik aplikasi saat build; perbaikan memerlukan Next.js 16) dan
  `deepmerge-ts` di Prisma CLI (hanya saat migration). Keduanya tidak memproses input pengguna saat runtime;
  disarankan diperbarui saat upgrade mayor berikutnya.

## Acceptance test #1–#54

Kolom bukti: **T** = automated test (`tests/`), **B** = uji browser end-to-end, **M** = verifikasi manual/skrip.

| # | Kriteria | Status | Bukti |
|---|---|---|---|
| 1 | Login & logout | ✅ | T foundation, B semua fase |
| 2 | Akun nonaktif tidak dapat login | ✅ | T foundation (termasuk sesi aktif langsung batal) |
| 3 | Admin tidak dapat memberi role Super Admin | ✅ | T residents-users, rbac-isolation |
| 4 | Member tidak melihat data warga lain | ✅ | T residents-users, ipl (IDOR), rbac-isolation, B (HTTP 307 akses ditolak) |
| 5 | Security tidak akses keuangan | ✅ | T foundation, finance-admin, rbac-isolation (sapu bersih 30 fungsi) |
| 6 | Manipulasi URL/request tidak melewati permission | ✅ | T rbac-isolation, ipl (residentId palsu diabaikan), B |
| 7 | Tambah/edit/cari/filter/arsip warga | ✅ | T residents-users, B |
| 8 | Status warga & hunian terpisah | ✅ | T residents-users |
| 9 | Tanggal meninggal hingga 10 tahun | ✅ | T residents-users (batas, masa depan, koreksi SA) |
| 10 | Histori tetap setelah arsip | ✅ | T residents-users |
| 11 | Tunggakan hingga 60 bulan | ✅ | T lib-ipl, ipl; M perf-check (18.000 tagihan) |
| 12 | Periode bulan & tahun tepat | ✅ | T lib-ipl (termasuk lintas tahun) |
| 13 | Warga lunas tidak menerima toast tunggakan | ✅ | T ipl; komponen peringatan tidak dirender bila tunggakan 0 |
| 14 | Bayar satu bulan tidak melunasi bulan lain | ✅ | T ipl |
| 15 | Alokasi multi-bulan ke periode yang benar | ✅ | T ipl, B |
| 16 | Autofill data warga dari DB | ✅ | B (warga & pencarian Admin) |
| 17 | Wajib bukti transfer | ✅ | T ipl |
| 18 | Menunggu verifikasi bukan pemasukan final | ✅ | T ipl, finance-admin |
| 19 | Disetujui memperbarui IPL & dashboard | ✅ | T ipl, B |
| 20 | Ditolak tidak melunasi | ✅ | T ipl |
| 21 | Transaksi & tagihan duplikat dicegah | ✅ | T ipl (termasuk pengajuan bersamaan), unique constraint DB |
| 22 | Widget IPL Belum Bayar lengkap sesuai permission | ✅ | T ipl, B |
| 23 | IPL tervalidasi tercatat pemasukan sekali | ✅ | T ipl, finance-admin, unique `iplPaymentId` |
| 24 | Pengeluaran mengurangi saldo | ✅ | T finance-admin |
| 25 | Pengeluaran tidak mengubah status IPL | ✅ | T finance-admin |
| 26 | Koreksi tercatat di audit log | ✅ | T finance-admin, B |
| 27 | Rekap sesuai database | ✅ | T finance-admin |
| 28 | Member mengirim pengajuan | ✅ | T finance-admin, B |
| 29 | Admin memproses status | ✅ | T finance-admin, B |
| 30 | Member hanya melihat pengajuan sendiri | ✅ | T finance-admin, rbac-isolation |
| 31 | Kalender & pemilihan slot | ✅ | B |
| 32 | Booking baru = Menunggu Review | ✅ | T booking-community |
| 33 | Admin menerima notifikasi booking | ✅ | T booking-community, B (klik notifikasi → detail) |
| 34 | Kalender menampilkan slot direview | ✅ | T booking-community, B |
| 35 | Booking bertabrakan ditolak backend | ✅ | T booking-community (termasuk bersamaan & constraint DB) |
| 36 | Jam berbeda tetap boleh | ✅ | T booking-community |
| 37 | Status booking memperbarui kalender | ✅ | T booking-community, B |
| 38 | Data pemesan lain tidak bocor | ✅ | T booking-community |
| 39 | Aktivitas penting tercatat dari backend | ✅ | T (audit di setiap modul) |
| 40 | Activity Log hanya role berwenang (Super Admin semua; Admin hanya Member/Security/sistem) | ✅ | T finance-admin, rbac-isolation, activity-log-visibility, B |
| 41 | Admin tidak dapat ubah/hapus log | ✅ | T foundation (trigger DB), tidak ada endpoint ubah/hapus |
| 42 | Realtime / fallback | ✅ | T finance-admin (query since), B (SSE: log baru muncul < 3 detik) |
| 43 | Security catat tamu masuk/keluar | ✅ | T security, B |
| 44 | Security membuat laporan kejadian | ✅ | T security, B |
| 45 | CCTV hanya role berwenang | ✅ | T security, B (URL tidak ada di HTML) |
| 46 | Kontak Ambulans, Polisi, PLN tersedia | ✅ | T security, B (`tel:` link) |
| 47 | Nomor darurat production terverifikasi | ⚠️ Menunggu pengurus | Mekanisme verifikasi tersedia (`EMERGENCY_VERIFIED`); verifikasi nomor wilayah Rajeg harus dilakukan pengurus |
| 48 | Desktop, tablet, mobile | ✅ | B (360/390/768/1024/1440 px, tanpa overflow) |
| 49 | Tidak ada tombol utama yang tidak berfungsi | ✅ | M (semua 32 tautan menu memiliki halaman), B 153 halaman |
| 50 | Migration dari DB kosong | ✅ | T (setiap run membuat DB baru & menjalankan semua migration) |
| 51 | Seed ulang tanpa duplikasi | ✅ | T foundation |
| 52 | Foreign key & constraint berfungsi | ✅ | T foundation, booking-community |
| 53 | Tidak ada kebocoran lintas organisasi | ✅ | T foundation, rbac-isolation |
| 54 | Backup & restore terdokumentasi | ✅ | M (uji round-trip), `docs/DEPLOYMENT.md` §7 |
