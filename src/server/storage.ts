import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma, type Tx } from "./db";
import { AppError } from "./errors";

/**
 * Penyimpanan berkas privat. Dua driver:
 * - "disk" (bawaan): folder STORAGE_DIR di server, di luar folder public.
 * - "supabase": bucket PRIVAT Supabase Storage (wajib untuk Vercel karena disk-nya tidak permanen).
 * Berkas hanya dapat diunduh melalui route aplikasi yang memeriksa izin entitas pemiliknya;
 * bucket tidak pernah diakses langsung oleh browser.
 */
const ALLOWED: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": {
    ext: "png",
    magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  "application/pdf": { ext: "pdf", magic: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
};

export const ALLOWED_UPLOAD_ACCEPT = ".jpg,.jpeg,.png,.pdf";

function storageDir() {
  return path.resolve(process.env.STORAGE_DIR || "./storage");
}

/** Batas upload. Maksimal 4 MB karena platform serverless (Vercel) membatasi body request 4,5 MB. */
export function maxUploadBytes() {
  const mb = Number(process.env.MAX_UPLOAD_MB ?? 4);
  return Math.min(Number.isFinite(mb) && mb > 0 ? mb : 4, 4) * 1024 * 1024;
}

interface Driver { put(key: string, data: Buffer, mime: string): Promise<void>; get(key: string): Promise<Buffer | null> }

const diskDriver: Driver = {
  async put(key, data) {
    const full = path.join(storageDir(), key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data, { mode: 0o600 });
  },
  async get(key) {
    const full = path.join(storageDir(), key);
    if (!full.startsWith(storageDir() + path.sep)) return null;
    return readFile(full).catch(() => null);
  },
};

/** Supabase Storage lewat REST API dengan service role key (hanya di server, tidak pernah ke browser). */
function supabaseDriver(): Driver {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const keyEnv = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "berkas-privat";
  if (!url || !keyEnv) throw new Error("SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diset untuk STORAGE_DRIVER=supabase");
  const headers = { Authorization: `Bearer ${keyEnv}`, apikey: keyEnv };
  const objectUrl = (key: string) => `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  return {
    async put(key, data, mime) {
      const r = await fetch(objectUrl(key), {
        method: "POST", headers: { ...headers, "Content-Type": mime, "x-upsert": "false" }, body: new Uint8Array(data),
      });
      if (!r.ok) throw new Error(`Upload ke Supabase Storage gagal (${r.status})`);
    },
    async get(key) {
      const r = await fetch(objectUrl(key), { headers, cache: "no-store" });
      if (r.status === 400 || r.status === 404) return null;
      if (!r.ok) throw new Error(`Gagal membaca berkas dari Supabase Storage (${r.status})`);
      return Buffer.from(await r.arrayBuffer());
    },
  };
}

function driver(): Driver {
  return process.env.STORAGE_DRIVER === "supabase" ? supabaseDriver() : diskDriver;
}

/** Deteksi tipe dari isi berkas (magic bytes), bukan dari nama/klaim browser. */
export function detectMime(buf: Buffer): string | null {
  for (const [mime, spec] of Object.entries(ALLOWED)) if (spec.magic(buf)) return mime;
  return null;
}

export interface UploadInput {
  name: string;
  data: Buffer;
}

export async function fileFromForm(value: FormDataEntryValue | null): Promise<UploadInput | null> {
  if (!value || typeof value === "string" || value.size === 0) return null;
  return { name: value.name || "berkas", data: Buffer.from(await value.arrayBuffer()) };
}

export function validateUpload(file: UploadInput) {
  if (file.data.length > maxUploadBytes()) {
    throw new AppError(`Ukuran berkas maksimal ${maxUploadBytes() / 1024 / 1024} MB.`);
  }
  const mime = detectMime(file.data);
  if (!mime) throw new AppError("Format berkas harus JPG, PNG, atau PDF.");
  return mime;
}

export async function storeFile(
  tx: Tx,
  organizationId: string,
  file: UploadInput,
  purpose: string,
  uploadedById: string,
) {
  const mime = validateUpload(file);
  const key = `${organizationId}/${purpose}/${randomUUID()}.${ALLOWED[mime].ext}`;
  await driver().put(key, file.data, mime);
  return tx.storedFile.create({
    data: {
      organizationId,
      storageKey: key,
      originalName: file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 120),
      mimeType: mime,
      size: file.data.length,
      sha256: createHash("sha256").update(file.data).digest("hex"),
      purpose,
      uploadedById,
    },
  });
}

export async function readStoredFile(fileId: string, organizationId: string) {
  const file = await prisma.storedFile.findFirst({ where: { id: fileId, organizationId } });
  if (!file) return null;
  const data = await driver().get(file.storageKey);
  return data ? { file, data } : null;
}
