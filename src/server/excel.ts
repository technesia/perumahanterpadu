import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { AppError } from "./errors";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;
export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface ColumnDef { header: string; key: string; width?: number; required?: boolean; note?: string }

export type CellValue = string | number | Date | null;
export interface SheetRow { rowNumber: number; values: Record<string, CellValue> }

const BRAND = "FF4C6D2C";
const norm = (s: string) => s.toLowerCase().replace(/\*/g, "").replace(/\s+/g, " ").trim();

/** Membuat template impor: sheet data (header + contoh) dan sheet petunjuk. */
export async function buildTemplate(opts: {
  sheetName: string; columns: ColumnDef[]; examples: Record<string, CellValue>[]; instructions: string[];
  lists?: Record<string, string[]>;
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Taman Pesona Rajeg Mulya";
  const ws = wb.addWorksheet(opts.sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = opts.columns.map((c) => ({ header: c.required ? `${c.header}*` : c.header, key: c.key, width: c.width ?? 18 }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
  opts.columns.forEach((c, i) => { if (c.note) head.getCell(i + 1).note = c.note; });
  for (const ex of opts.examples) ws.addRow(ex).font = { italic: true, color: { argb: "FF64748B" } };
  // Daftar pilihan (dropdown) untuk kolom tertentu hingga baris batas impor.
  for (const [key, values] of Object.entries(opts.lists ?? {})) {
    const idx = opts.columns.findIndex((c) => c.key === key);
    if (idx < 0) continue;
    const col = ws.getColumn(idx + 1).letter;
    for (let r = 2; r <= MAX_IMPORT_ROWS + 1; r++) {
      ws.getCell(`${col}${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${values.join(",")}"`] };
    }
  }
  const info = wb.addWorksheet("Petunjuk");
  info.getColumn(1).width = 110;
  info.addRow(["Petunjuk pengisian"]).font = { bold: true, size: 13 };
  for (const line of opts.instructions) info.addRow([line]).alignment = { wrapText: true };
  info.addRow([]);
  info.addRow(["Kolom bertanda * wajib diisi. Baris contoh (huruf miring abu-abu) boleh dihapus atau ditimpa."]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function cellToValue(v: ExcelJS.CellValue): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return cellToValue((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ("richText" in v) return cellToValue((v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join(""));
    if ("text" in v) return cellToValue((v as ExcelJS.CellHyperlinkValue).text);
    if ("error" in v) return null;
  }
  return String(v);
}

/** Sidik jari berkas: memastikan berkas yang dikonfirmasi sama dengan yang dipratinjau. */
export const fileHash = (data: Buffer) => createHash("sha256").update(data).digest("hex");

/**
 * Membaca sheet pertama berkas .xlsx dan memetakan kolom berdasarkan judul header
 * (tidak peka huruf besar/kecil, tanda * diabaikan). Baris kosong dilewati.
 */
export async function readSheet(data: Buffer, columns: ColumnDef[], sheetName?: string): Promise<SheetRow[]> {
  if (data.length === 0) throw new AppError("Berkas kosong.");
  if (data.length > MAX_IMPORT_BYTES) throw new AppError(`Ukuran berkas maksimal ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`);
  if (data.subarray(0, 2).toString("latin1") !== "PK") throw new AppError("Format berkas harus Excel .xlsx (gunakan template dari aplikasi).");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as unknown as ArrayBuffer);
  } catch {
    throw new AppError("Berkas Excel tidak dapat dibaca. Pastikan berformat .xlsx dan tidak terproteksi password.");
  }
  const ws = (sheetName && wb.getWorksheet(sheetName)) || wb.worksheets[0];
  if (!ws) throw new AppError("Sheet data tidak ditemukan.");
  const header = ws.getRow(1);
  const map = new Map<number, string>();
  header.eachCell((cell, col) => {
    const h = norm(String(cellToValue(cell.value) ?? ""));
    const def = columns.find((c) => norm(c.header) === h);
    if (def) map.set(col, def.key);
  });
  const missing = columns.filter((c) => c.required && ![...map.values()].includes(c.key));
  if (missing.length) {
    throw new AppError(`Kolom wajib tidak ditemukan: ${missing.map((m) => m.header).join(", ")}. Gunakan template terbaru dari aplikasi.`);
  }
  const rows: SheetRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, CellValue> = {};
    let filled = false;
    for (const [col, k] of map) {
      const v = cellToValue(row.getCell(col).value);
      values[k] = v;
      if (v !== null) filled = true;
    }
    if (filled) rows.push({ rowNumber, values });
  });
  if (rows.length > MAX_IMPORT_ROWS) throw new AppError(`Maksimal ${MAX_IMPORT_ROWS} baris per impor. Pecah berkas menjadi beberapa bagian.`);
  return rows;
}

export type RowStatus = "VALID" | "DUPLICATE" | "UNMATCHED" | "INVALID";
export const ROW_STATUS_LABEL: Record<RowStatus, string> = {
  VALID: "Valid", DUPLICATE: "Duplikat", UNMATCHED: "Tidak cocok", INVALID: "Tidak valid",
};
const STATUS_FILL: Record<RowStatus, string> = { VALID: "FFDCFCE7", DUPLICATE: "FFFEF3C7", UNMATCHED: "FFFFEDD5", INVALID: "FFFEE2E2" };

/** Berkas hasil validasi: data asli + kolom Status dan Keterangan, diberi warna per status. */
export async function buildValidationFile(sheetName: string, columns: ColumnDef[], rows: { row: SheetRow; status: RowStatus; messages: string[] }[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Baris", key: "__row", width: 8 },
    ...columns.map((c) => ({ header: c.required ? `${c.header}*` : c.header, key: c.key, width: c.width ?? 18 })),
    { header: "Status Validasi", key: "__status", width: 16 },
    { header: "Keterangan", key: "__msg", width: 70 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    const added = ws.addRow({ __row: r.row.rowNumber, ...r.row.values, __status: ROW_STATUS_LABEL[r.status], __msg: r.messages.join("; ") });
    added.getCell("__status").fill = { type: "pattern", pattern: "solid", fgColor: { argb: STATUS_FILL[r.status] } };
    added.getCell("__msg").alignment = { wrapText: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ───────────────────────── Konversi nilai sel ─────────────────────────

export const text = (v: CellValue) => (v === null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());

/** Angka Rupiah dari sel: angka, atau teks seperti "Rp 100.000". null bila kosong; NaN bila tidak valid. */
export function rupiahValue(v: CellValue): number | null {
  if (v === null) return null;
  if (typeof v === "number") return Number.isInteger(v) ? v : Number.NaN;
  if (v instanceof Date) return Number.NaN;
  const s = v.replace(/rp\.?/i, "").replace(/\s/g, "");
  if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(s)) return Number.NaN;
  return Number(s.replace(/[.,]/g, ""));
}

const MONTH_NAMES = ["januari", "februari", "maret", "april", "mei", "juni", "juli", "agustus", "september", "oktober", "november", "desember"];
const MONTH_SHORT = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des"];

/** Bulan dari angka 1–12 atau nama bulan Indonesia. null bila kosong; NaN bila tidak valid. */
export function monthValue(v: CellValue): number | null {
  if (v === null) return null;
  if (typeof v === "number") return Number.isInteger(v) && v >= 1 && v <= 12 ? v : Number.NaN;
  const s = text(v).toLowerCase();
  if (/^\d{1,2}$/.test(s)) { const n = Number(s); return n >= 1 && n <= 12 ? n : Number.NaN; }
  const i = MONTH_NAMES.indexOf(s);
  if (i >= 0) return i + 1;
  const j = MONTH_SHORT.indexOf(s.slice(0, 3));
  return j >= 0 && MONTH_NAMES[j].startsWith(s) ? j + 1 : Number.NaN;
}

export function intValue(v: CellValue): number | null {
  if (v === null) return null;
  if (typeof v === "number") return Number.isInteger(v) ? v : Number.NaN;
  const s = text(v);
  return /^\d+$/.test(s) ? Number(s) : Number.NaN;
}

/** Tanggal ISO (YYYY-MM-DD) dari sel tanggal Excel atau teks YYYY-MM-DD / DD/MM/YYYY. */
export function dateValue(v: CellValue): string | null | "INVALID" {
  if (v === null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "INVALID" : v.toISOString().slice(0, 10);
  const s = text(v);
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "INVALID";
}

/** Normalisasi nama/nomor untuk pencocokan (huruf kecil, spasi tunggal). */
export const matchKey = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
