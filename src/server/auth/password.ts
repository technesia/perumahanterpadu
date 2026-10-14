import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Kebijakan password: minimal 10 karakter, mengandung huruf dan angka. */
export function passwordPolicyError(plain: string): string | null {
  if (plain.length < 10) return "Password minimal 10 karakter.";
  if (plain.length > 128) return "Password maksimal 128 karakter.";
  if (!/[A-Za-z]/.test(plain) || !/\d/.test(plain)) {
    return "Password harus mengandung huruf dan angka.";
  }
  return null;
}
