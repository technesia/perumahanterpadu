// Memuat .env untuk skrip CLI yang dijalankan lewat tsx (seed, setup Super Admin).
// Next.js dan Prisma CLI memuat .env sendiri; skrip tsx tidak selalu (mis. di Windows).
// Variabel yang sudah diset di environment tidak ditimpa.
try {
  process.loadEnvFile();
} catch {
  // Tidak ada .env (mis. Docker/CI): gunakan environment yang sudah ada.
}
