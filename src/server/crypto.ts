import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Enkripsi kolom sensitif (NIK, nomor identitas) dengan AES-256-GCM.
 * Kunci dari DATA_ENCRYPTION_KEY (wajib di production).
 */
function key(): Buffer {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") throw new Error("DATA_ENCRYPTION_KEY wajib diset di production");
    return createHash("sha256").update("dev-only-key:" + (process.env.SESSION_SECRET ?? "")).digest();
  }
  return createHash("sha256").update(raw).digest();
}

export function encryptField(plain: string | null | undefined): string | null {
  if (!plain) return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function decryptField(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("v1:")) return value;
  try {
    const [, iv, tag, data] = value.split(":");
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
