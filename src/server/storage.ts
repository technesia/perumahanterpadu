import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma, type Tx } from "./db";
import { AppError } from "./errors";

/**
 * Penyimpanan berkas privat di disk server (di luar folder public).
 * Berkas hanya dapat diunduh melalui route yang memeriksa izin entitas pemiliknya.
 * Antarmuka ini dapat diganti dengan object storage (S3/GCS) tanpa mengubah pemanggil.
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

export function maxUploadBytes() {
  const mb = Number(process.env.MAX_UPLOAD_MB ?? 5);
  return (Number.isFinite(mb) && mb > 0 ? mb : 5) * 1024 * 1024;
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
  const full = path.join(storageDir(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, file.data, { mode: 0o600 });
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
  const full = path.join(storageDir(), file.storageKey);
  if (!full.startsWith(storageDir() + path.sep)) return null;
  return { file, data: await readFile(full) };
}
