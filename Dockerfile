# Image untuk MENCOBA aplikasi secara lokal (lihat docker-compose.yml).
# Untuk server production ikuti docs/DEPLOYMENT.md.
# Image penuh (bukan -slim) karena sudah berisi OpenSSL 3 yang dibutuhkan Prisma — tanpa apt-get.
FROM node:22-bookworm

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Image ini khusus uji lokal lewat http://localhost: tanpa HSTS & tanpa cookie Secure (dibaca saat build & runtime).
ENV LOCAL_HTTP=true

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build && chmod +x scripts/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["scripts/docker-entrypoint.sh"]
