import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ensureSeed, orgId, PNG_1PX, prisma } from "./helpers";
import { maxUploadBytes, readStoredFile, storeFile } from "@/server/storage";

beforeAll(ensureSeed);

const ENV = { STORAGE_DRIVER: "supabase", SUPABASE_URL: "https://proj.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "eyJservice.key", SUPABASE_STORAGE_BUCKET: "berkas-privat" };

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of [...Object.keys(ENV), "SUPABASE_SECRET_KEY", "VERCEL"]) delete process.env[k];
  delete process.env.MAX_UPLOAD_MB;
});

describe("Penyimpanan Supabase Storage", () => {
  it("mengunggah ke bucket privat dengan service key dan membaca kembali lewat server", async () => {
    Object.assign(process.env, ENV);
    const store = new Map<string, Buffer>();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer eyJservice.key");
      expect(url.startsWith("https://proj.supabase.co/storage/v1/object/berkas-privat/")).toBe(true);
      if (init?.method === "POST") { store.set(url, Buffer.from(init.body as Uint8Array)); return new Response("{}", { status: 200 }); }
      const b = store.get(url);
      return b ? new Response(new Uint8Array(b), { status: 200 }) : new Response("not found", { status: 400 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const org = await orgId();
    const f = await prisma.$transaction((tx) => storeFile(tx, org, { name: "bukti.png", data: PNG_1PX }, "ipl-proof", "u1"));
    expect(f.mimeType).toBe("image/png");
    const read = await readStoredFile(f.id, org);
    expect(read?.data.equals(PNG_1PX)).toBe(true);
    // Organisasi lain tidak dapat membaca
    expect(await readStoredFile(f.id, "org-lain")).toBeNull();
  });

  it("gagal unggah → transaksi dibatalkan, tidak ada record berkas", async () => {
    Object.assign(process.env, ENV);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("err", { status: 500 })));
    const org = await orgId();
    const before = await prisma.storedFile.count();
    await expect(prisma.$transaction((tx) => storeFile(tx, org, { name: "b.png", data: PNG_1PX }, "ipl-proof", "u1"))).rejects.toThrow(/gagal/);
    expect(await prisma.storedFile.count()).toBe(before);
  });

  it("di Vercel otomatis memakai Supabase dengan secret key dari integrasi (header apikey)", async () => {
    Object.assign(process.env, { VERCEL: "1", SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_abc" });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const h = init?.headers as Record<string, string>;
      expect(h.apikey).toBe("sb_secret_abc");
      expect(h.Authorization).toBeUndefined();
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const org = await orgId();
    await prisma.$transaction((tx) => storeFile(tx, org, { name: "b.png", data: PNG_1PX }, "ipl-proof", "u1"));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("batas upload maksimal 4 MB (batas request Vercel)", () => {
    process.env.MAX_UPLOAD_MB = "10";
    expect(maxUploadBytes()).toBe(4 * 1024 * 1024);
    process.env.MAX_UPLOAD_MB = "2";
    expect(maxUploadBytes()).toBe(2 * 1024 * 1024);
  });
});
