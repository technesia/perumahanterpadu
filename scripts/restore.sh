#!/usr/bin/env bash
# Restore backup ke database KOSONG dan folder storage KOSONG.
# Skrip ini sengaja menolak menimpa data yang ada: buat database baru, restore, verifikasi,
# lalu arahkan DATABASE_URL aplikasi ke database tersebut.
#
#   ./scripts/restore.sh <BACKUP_DIR>/tprm-<timestamp> <TARGET_DATABASE_URL> [TARGET_STORAGE_DIR]
set -euo pipefail

PREFIX="${1:?Argumen 1: prefix backup, mis. backups/tprm-20261014-120000}"
TARGET="${2:?Argumen 2: URL database tujuan (harus kosong)}"
TARGET_STORAGE="${3:-}"
TARGET="${TARGET%%\?*}"

[ -f "$PREFIX.dump" ] || { echo "Berkas $PREFIX.dump tidak ditemukan"; exit 1; }

echo "[restore] verifikasi checksum"
( cd "$(dirname "$PREFIX")" && sha256sum -c "$(basename "$PREFIX").sha256" )

TABLES="$(psql "$TARGET" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
if [ "$TABLES" != "0" ]; then
  echo "[restore] DITOLAK: database tujuan tidak kosong ($TABLES tabel). Gunakan database baru."
  exit 1
fi

echo "[restore] database"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET" "$PREFIX.dump"

if [ -n "$TARGET_STORAGE" ] && [ -f "$PREFIX-storage.tar.gz" ]; then
  mkdir -p "$TARGET_STORAGE"
  if [ -n "$(ls -A "$TARGET_STORAGE")" ]; then
    echo "[restore] DITOLAK: folder storage tujuan tidak kosong."
    exit 1
  fi
  echo "[restore] berkas privat → $TARGET_STORAGE"
  tar -xzf "$PREFIX-storage.tar.gz" -C "$TARGET_STORAGE"
fi

echo "[restore] ringkasan jumlah data:"
psql "$TARGET" -c "SELECT (SELECT count(*) FROM organizations) organisasi, (SELECT count(*) FROM users) akun,
  (SELECT count(*) FROM residents) warga, (SELECT count(*) FROM ipl_bills) tagihan, (SELECT count(*) FROM ipl_payments) pembayaran,
  (SELECT count(*) FROM finance_transactions) transaksi, (SELECT count(*) FROM audit_logs) audit_log"
echo "[restore] selesai. Jalankan 'npm run db:migrate' untuk memastikan migration terbaru, lalu arahkan DATABASE_URL ke database ini."
