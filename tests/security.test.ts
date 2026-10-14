import { beforeAll, describe, expect, it } from "vitest";
import { ensureSeed, makeHousehold, makeUser, PNG_1PX, prisma, uniq } from "./helpers";
import {
  cameraAccessUrl, checkIn, checkOut, createIncident, getIncident, getVisitor, listCameras, listIncidents, listVisitors,
  reviewIncident, saveCamera,
} from "@/server/services/security";
import { searchResidentsLite } from "@/server/services/residents";
import { emergencyContacts } from "@/server/emergency";
import { authorizeFile } from "@/server/services/files";
import { ForbiddenError } from "@/server/errors";

beforeAll(ensureSeed);
const nowLocal = () => {
  const d = new Date(Date.now() - 3600_000);
  return `${d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })}T${d.toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta", hour12: false }).slice(0, 5)}`;
};

describe("Buku tamu (#43)", () => {
  it("Security mencatat tamu masuk & keluar; tamu di dalam terdaftar; identitas tersamar", async () => {
    const { ctx: sec } = await makeUser("SECURITY");
    const hh = await makeHousehold();
    const name = uniq("Tamu ");
    const v = await checkIn(sec, { visitorName: name, idNumber: "3603123456780001", phone: "", purpose: "Antar paket", unitId: hh.unit.id, vehiclePlate: "b 1234 xyz" });
    expect(v.number).toMatch(/^TMU-/);
    expect(v.idNumber).not.toContain("3603123456780001");
    expect(v.vehiclePlate).toBe("B 1234 XYZ");
    const inside = await listVisitors(sec, { status: "inside", q: name, page: 1 });
    expect(inside.items).toHaveLength(1);
    expect(JSON.stringify(inside)).not.toContain("3603123456780001");
    expect((await getVisitor(sec, v.id)).idNumber).toBe("************0001");
    await checkOut(sec, v.id);
    await expect(checkOut(sec, v.id)).rejects.toThrow(/sudah tercatat keluar/);
    expect((await listVisitors(sec, { status: "inside", q: name, page: 1 })).items).toHaveLength(0);
    expect((await listVisitors(sec, { q: hh.unit.houseNumber, page: 1 })).items).toHaveLength(1);
  });

  it("wajib rumah atau penghuni tujuan; Member tidak dapat mengakses buku tamu", async () => {
    const { ctx: sec } = await makeUser("SECURITY");
    const { ctx: mem } = await makeUser("MEMBER");
    await expect(checkIn(sec, { visitorName: "X", purpose: "Y", phone: "" })).rejects.toThrow(/rumah yang dituju atau nama penghuni/);
    await expect(listVisitors(mem, { page: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(checkIn(mem, { visitorName: "X", purpose: "Y", phone: "", hostName: "Z" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("Security hanya melihat info penghuni terbatas (tanpa nomor HP)", async () => {
    const { ctx: sec } = await makeUser("SECURITY");
    const hh = await makeHousehold();
    const r = await searchResidentsLite(sec, hh.unit.houseNumber);
    expect(r[0].fullName).toBe(hh.resident.fullName);
    expect(r[0].phone).toBeNull();
  });
});

describe("Laporan kejadian (#44)", () => {
  it("Security membuat laporan dengan lampiran; Admin menindaklanjuti; pelapor diberi tahu", async () => {
    const { ctx: sec } = await makeUser("SECURITY");
    const { ctx: admin } = await makeUser("ADMIN");
    const inc = await createIncident(sec, { type: "Orang Mencurigakan", occurredAt: nowLocal(), location: "Gerbang Utara", description: "Motor tanpa plat berputar 3 kali." }, [{ name: "foto.png", data: PNG_1PX }]);
    expect(inc.number).toMatch(/^LAP-/);
    expect(await prisma.notification.count({ where: { userId: admin.userId, type: "INCIDENT_NEW" } })).toBeGreaterThan(0);
    await expect(reviewIncident(sec, inc.id, { status: "CLOSED" })).rejects.toBeInstanceOf(ForbiddenError);
    await reviewIncident(admin, inc.id, { status: "IN_PROGRESS", managementNotes: "Koordinasi dengan Babinsa" });
    const seen = await getIncident(sec, inc.id);
    expect(seen.status).toBe("IN_PROGRESS");
    expect(await prisma.notification.count({ where: { userId: sec.userId, type: "INCIDENT_UPDATED" } })).toBe(1);
    const att = seen.attachments[0].file.id;
    expect(await authorizeFile(sec, att)).not.toBeNull();
    const { ctx: mem } = await makeUser("MEMBER");
    expect(await authorizeFile(mem, att)).toBeNull();
    await expect(listIncidents(mem, { page: 1 })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("waktu kejadian di masa depan ditolak", async () => {
    const { ctx: sec } = await makeUser("SECURITY");
    await expect(createIncident(sec, { type: "Lainnya", occurredAt: "2099-01-01T10:00", location: "x", description: "y" }, [])).rejects.toThrow(/masa depan/);
  });
});

describe("CCTV (#45)", () => {
  it("URL akses tidak pernah ada di daftar; akses lewat server tercatat; role tanpa izin ditolak", async () => {
    const { ctx: admin } = await makeUser("ADMIN");
    const { ctx: sec } = await makeUser("SECURITY");
    const { ctx: mem } = await makeUser("MEMBER");
    await expect(saveCamera(admin, null, { name: uniq("Cam"), location: "x", status: "ONLINE", accessUrl: "https://user:pass@nvr.local/cam1" })).rejects.toThrow(/username\/password/);
    await expect(saveCamera(admin, null, { name: uniq("Cam"), location: "x", status: "ONLINE", accessUrl: "javascript:alert(1)" })).rejects.toThrow();
    const cam = await saveCamera(admin, null, { name: uniq("Gerbang "), location: "Pos Satpam", status: "ONLINE", accessUrl: "https://nvr.example.org/view/1", internalNotes: "NVR lantai 2" });
    const list = await listCameras(sec);
    const mine = list.find((c) => c.id === cam.id)!;
    expect(mine.hasLink).toBe(true);
    expect(JSON.stringify(list)).not.toContain("nvr.example.org");
    expect(mine.internalNotes).toBeNull();
    expect(await cameraAccessUrl(sec, cam.id)).toBe("https://nvr.example.org/view/1");
    expect(await prisma.auditLog.count({ where: { entityId: cam.id, action: "CCTV_ACCESSED", userId: sec.userId } })).toBe(1);
    await expect(listCameras(mem)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cameraAccessUrl(mem, cam.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveCamera(sec, null, { name: "x", location: "x", status: "ONLINE" })).rejects.toBeInstanceOf(ForbiddenError);
    // Edit tanpa URL mempertahankan URL lama
    await saveCamera(admin, cam.id, { name: cam.name, location: "Pos Satpam Baru", status: "OFFLINE", accessUrl: "" });
    expect(await cameraAccessUrl(admin, cam.id)).toBe("https://nvr.example.org/view/1");
  });
});

describe("Kontak darurat (#46, #47)", () => {
  it("Ambulans, Polisi, PLN tersedia; status verifikasi dari konfigurasi; nomor tidak valid tidak diaktifkan", () => {
    const prev = { ...process.env };
    process.env.EMERGENCY_AMBULANCE = "119"; process.env.EMERGENCY_POLICE = "110"; process.env.EMERGENCY_PLN = "<script>";
    process.env.EMERGENCY_VERIFIED = "false";
    const e = emergencyContacts();
    expect(e.contacts.map((c) => c.name)).toEqual(["Ambulans", "Polisi", "PLN"]);
    expect(e.verified).toBe(false);
    expect(e.contacts[2].number).toBeNull();
    process.env = prev;
  });
});
