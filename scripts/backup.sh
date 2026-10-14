#!/usr/bin/env bash
# Backup database PostgreSQL + berkas privat (storage).
#
#   DATABASE_URL=... STORAGE_DIR=./storage BACKUP_DIR=./backups ./scripts/backup.sh
#
# Menghasilkan: <BACKUP_DIR>/tprm-<timestamp>.dump, tprm-<timestamp>-storage.tar.gz, tprm-<timestamp>.sha256
# Opsional BACKUP_RETENTION_DAYS (default 30): backup buatan skrip ini yang lebih lama dihapus.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL wajib diset}"
STORAGE_DIR="${STORAGE_DIR:-./storage}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
TS="$(date +%Y%m%d-%H%M%S)"
PREFIX="$BACKUP_DIR/tprm-$TS"
DB_URL="${DATABASE_URL%%\?*}"   # buang parameter ?schema=… milik Prisma

mkdir -p "$BACKUP_DIR"
umask 077

echo "[backup] database → $PREFIX.dump"
pg_dump --format=custom --no-owner --no-privileges --file="$PREFIX.dump" "$DB_URL"

if [ -d "$STORAGE_DIR" ]; then
  echo "[backup] berkas privat → $PREFIX-storage.tar.gz"
  tar -czf "$PREFIX-storage.tar.gz" -C "$STORAGE_DIR" .
else
  echo "[backup] STORAGE_DIR tidak ada, dilewati"
fi

( cd "$BACKUP_DIR" && sha256sum "tprm-$TS".* > "tprm-$TS.sha256" )
echo "[backup] checksum → $PREFIX.sha256"

if [ "$RETENTION" -gt 0 ]; then
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'tprm-*' -mtime +"$RETENTION" -print -delete | sed 's/^/[backup] hapus lama: /'
fi
echo "[backup] selesai: $PREFIX"
