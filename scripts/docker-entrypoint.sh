#!/bin/sh
# Entrypoint Docker lokal: migration → seed master data → (opsional) data demo & Super Admin → start.
set -e

echo "[start] menunggu database…"
node scripts/wait-for-db.mjs

echo "[start] migration"
npx prisma migrate deploy

echo "[start] seed master data"
npm run --silent db:seed

if [ -n "$DEMO_PASSWORD" ]; then
  echo "[start] data demo (akun admin.demo / warga.demo / security.demo)"
  npm run --silent seed:demo
fi

if [ -n "$SA_USERNAME" ] && [ -n "$SA_PASSWORD" ]; then
  echo "[start] Super Admin $SA_USERNAME"
  SA_NAME="${SA_NAME:-Super Admin}" SA_EMAIL="${SA_EMAIL-}" npm run --silent setup:superadmin </dev/null
fi

echo "[start] aplikasi siap di http://localhost:${APP_PORT:-3000}"
exec npx next start -H 0.0.0.0 -p 3000
