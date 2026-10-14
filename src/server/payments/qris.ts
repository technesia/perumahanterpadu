/**
 * Struktur integrasi QRIS. BELUM ADA provider yang aktif.
 * Untuk mengaktifkan: implementasikan QrisProvider (mis. Midtrans/Xendit), daftarkan di
 * `providers`, lalu set QRIS_PROVIDER, QRIS_SERVER_KEY, dan QRIS_WEBHOOK_SECRET.
 */
export interface QrisCharge { providerTransactionId: string; qrString?: string; qrImageUrl?: string; expiresAt?: Date }

export interface QrisWebhookEvent {
  providerTransactionId: string;
  amount: number;
  status: "PAID" | "FAILED" | "EXPIRED" | "PENDING";
  paidAt?: Date;
}

export interface QrisProvider {
  name: string;
  createCharge(input: { orderId: string; amount: number }): Promise<QrisCharge>;
  /** Wajib memverifikasi signature; melempar error bila tidak valid. */
  parseWebhook(rawBody: string, headers: Headers): Promise<QrisWebhookEvent>;
}

const providers: Record<string, () => QrisProvider> = {
  // contoh: midtrans: () => new MidtransQrisProvider(process.env.QRIS_SERVER_KEY!, process.env.QRIS_WEBHOOK_SECRET!),
};

let override: QrisProvider | null = null;

/** Hanya untuk test. */
export function __setQrisProviderForTest(p: QrisProvider | null) {
  override = p;
}

export function getQrisProvider(): QrisProvider | null {
  if (override) return override;
  const name = process.env.QRIS_PROVIDER;
  if (!name) return null;
  const factory = providers[name];
  return factory ? factory() : null;
}
