"use client";
import { useState } from "react";
import { Ambulance, Copy, Phone, ShieldAlert, Zap } from "lucide-react";
import type { EmergencyContact } from "@/server/emergency";

const ICONS = { ambulance: Ambulance, police: ShieldAlert, pln: Zap };

export function EmergencyContacts({ contacts, verified }: { contacts: EmergencyContact[]; verified: boolean }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div>
      {!verified && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Nomor layanan nasional ini belum diverifikasi pengurus untuk wilayah Rajeg. Pastikan kembali sebelum digunakan.
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-3">
        {contacts.map((c) => {
          const Icon = ICONS[c.icon];
          return (
            <li key={c.key} className="rounded-xl border border-red-100 bg-red-50/40 p-4">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-red-100 p-2 text-red-700"><Icon className="h-5 w-5" aria-hidden /></span>
                <div>
                  <p className="font-semibold text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.description}</p>
                </div>
              </div>
              {c.number ? (
                <>
                  <p className="mt-3 text-2xl font-bold tracking-wide text-red-700">{c.number}</p>
                  <div className="mt-3 flex gap-2">
                    <a href={`tel:${c.number.replace(/[^0-9+]/g, "")}`} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700">
                      <Phone className="h-4 w-4" /> Telepon Sekarang
                    </a>
                    <button type="button" aria-label={`Salin nomor ${c.name}`}
                      onClick={() => { navigator.clipboard?.writeText(c.number!); setCopied(c.key); setTimeout(() => setCopied(null), 2000); }}
                      className="flex h-11 items-center gap-1 rounded-lg border border-red-200 bg-white px-3 text-sm text-red-700 hover:bg-red-50">
                      <Copy className="h-4 w-4" /> {copied === c.key ? "Tersalin" : "Salin"}
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Nomor belum dikonfigurasi pengurus.</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
