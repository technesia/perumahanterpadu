import { z } from "zod";

export const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .regex(/^(\+62|62|0)8\d{7,12}$/, "Format nomor HP tidak valid (contoh: 081234567890).")
  .or(z.literal(""))
  .transform((v) => v || null);

export const optionalText = (max = 500) =>
  z.string().trim().max(max, `Maksimal ${max} karakter.`).optional().transform((v) => v || null);

export const requiredText = (label: string, max = 200) =>
  z.string({ required_error: `${label} wajib diisi.` }).trim().min(1, `${label} wajib diisi.`).max(max, `Maksimal ${max} karakter.`);

export const isoDate = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} tidak valid.`);

export const optionalIsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.")
  .or(z.literal(""))
  .optional()
  .transform((v) => v || null);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Format email tidak valid.")
  .max(120)
  .or(z.literal(""))
  .optional()
  .transform((v) => v || null);

export const idSchema = z.string().min(1).max(40);

export const rupiahSchema = (label: string) =>
  z.coerce.number({ invalid_type_error: `${label} harus berupa angka.` })
    .int(`${label} harus bilangan bulat Rupiah.`)
    .positive(`${label} harus lebih dari 0.`)
    .max(2_000_000_000, `${label} terlalu besar.`);

export function pageParams(page: number, pageSize = 20) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
