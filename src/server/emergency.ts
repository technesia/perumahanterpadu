/**
 * Kontak darurat dari konfigurasi aplikasi (bukan data dinamis).
 * Nomor default adalah nomor layanan nasional dan WAJIB diverifikasi sebelum production;
 * setelah diverifikasi set EMERGENCY_VERIFIED="true".
 */
export interface EmergencyContact { key: string; name: string; number: string | null; description: string; icon: "ambulance" | "police" | "pln" }

const valid = (n: string | undefined) => (n && /^[0-9+ -]{3,20}$/.test(n) ? n.trim() : null);

export function emergencyContacts(): { verified: boolean; contacts: EmergencyContact[] } {
  return {
    verified: process.env.EMERGENCY_VERIFIED === "true",
    contacts: [
      { key: "ambulance", name: "Ambulans", number: valid(process.env.EMERGENCY_AMBULANCE), description: "Layanan gawat darurat medis", icon: "ambulance" },
      { key: "police", name: "Polisi", number: valid(process.env.EMERGENCY_POLICE), description: "Kepolisian — kejahatan & keamanan", icon: "police" },
      { key: "pln", name: "PLN", number: valid(process.env.EMERGENCY_PLN), description: "Gangguan listrik PLN", icon: "pln" },
    ],
  };
}
