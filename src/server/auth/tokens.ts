import { createHash, randomBytes } from "node:crypto";

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Token sesi disimpan di DB dalam bentuk hash, bukan plaintext. */
export function hashToken(token: string): string {
  const secret = process.env.SESSION_SECRET ?? "";
  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}
