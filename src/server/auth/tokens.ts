import { createHash, randomBytes } from "node:crypto";

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Token sesi disimpan di DB dalam bentuk hash, bukan plaintext. */
function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? "";
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    throw new Error("SESSION_SECRET wajib diset (minimal 32 karakter) di production.");
  }
  return secret;
}

export function hashToken(token: string): string {
  const secret = sessionSecret();
  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}
