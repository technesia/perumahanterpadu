import Link from "next/link";
import {
  AlertCircle, BadgeDollarSign, BookUser, CalendarCheck, Clock, FileText, Home, HandCoins, Receipt, ShieldAlert,
  TrendingDown, TrendingUp, UserCheck, UserMinus, UserPlus, Users, Wallet, Camera, Megaphone, CalendarDays,
} from "lucide-react";
import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { adminDashboard, memberDashboard, securityDashboard } from "@/server/services/dashboard";
import { emergencyContacts } from "@/server/emergency";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { PaymentStatusBadge } from "@/components/domain/status-badges";
import { ArrearsWarning } from "@/components/domain/arrears-warning";
import { EmergencyContacts } from "@/components/domain/emergency-contacts";
import { formatDateTime, periodLabel, rupiah } from "@/lib/format";
import { ADMIN_REQUEST_STATUS, BOOKING_STATUS, CAMERA_STATUS, INCIDENT_STATUS } from "@/lib/labels";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await requirePage();
  if (can(ctx, "dashboard.admin")) return <AdminDashboard ctx={ctx} />;
  if (ctx.primaryRole === "SECURITY") return <SecurityDashboard ctx={ctx} />;
  return <MemberDashboard ctx={ctx} />;
}

async function AdminDashboard({ ctx }: { ctx: AuthContext }) {
  const d = await adminDashboard(ctx);
  return (
    <>
      <PageHeader title="Ringkasan" description={`Selamat datang, ${ctx.name}. Data periode ${periodLabel(d.period.year, d.period.month)}.`} />

      {/* Prioritas Admin: IPL & keuangan di atas */}
      {d.arrears && (
        <section aria-labelledby="ipl-h" className="mb-6">
          <h2 id="ipl-h" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">IPL</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="IPL Belum Bayar" value={`${d.arrears.unitsInArrears} rumah`} hint={`${d.arrears.periods} periode tertunggak`} icon={BadgeDollarSign} tone="red" href="/ipl/belum-bayar" />
            <StatCard label="Total Tunggakan" value={rupiah(d.arrears.amount)} hint={`Jendela ${periodLabel(d.arrears.window.start.year, d.arrears.window.start.month)} – kini`} icon={Wallet} tone="red" href="/ipl/tunggakan" />
            <StatCard label="Menunggu Verifikasi" value={d.arrears.pendingPayments} hint="Pengajuan pembayaran" icon={Clock} tone="blue" href="/ipl/pembayaran?status=PENDING_VERIFICATION" />
            <StatCard label="Tagihan Periode Berjalan" value={rupiah(d.billedAmount)} hint={`${d.billedCount} tagihan`} icon={Receipt} href={`/ipl/tagihan?year=${d.period.year}&month=${d.period.month}`} />
          </div>
        </section>
      )}

      {d.cash && (
        <section aria-labelledby="kas-h" className="mb-6">
          <h2 id="kas-h" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Kas</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Saldo Kas" value={rupiah(d.cash.balance)} hint={`Saldo awal ${rupiah(d.cash.opening)}`} icon={Wallet} tone="gold" href="/keuangan/rekap" />
            <StatCard label="Pemasukan IPL Terkonfirmasi" value={rupiah(d.cash.incomeIpl)} icon={HandCoins} href="/keuangan/masuk" />
            <StatCard label="Pemasukan Lainnya" value={rupiah(d.cash.incomeOther)} icon={TrendingUp} href="/keuangan/masuk" />
            <StatCard label="Total Pengeluaran" value={rupiah(d.cash.expense)} icon={TrendingDown} tone="red" href="/keuangan/keluar" />
          </div>
        </section>
      )}

      <section aria-labelledby="warga-h" className="mb-6">
        <h2 id="warga-h" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Kependudukan</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Warga" value={d.residents.total} icon={Users} href="/warga" />
          <StatCard label="Warga Aktif" value={d.residents.active} icon={UserCheck} href="/warga?status=ACTIVE" />
          <StatCard label="Pendatang" value={d.residents.newcomer} icon={UserPlus} tone="blue" href="/warga?status=NEWCOMER" />
          <StatCard label="Pindah" value={d.residents.moved} icon={UserMinus} tone="slate" href="/warga?status=MOVED" />
          <StatCard label="Meninggal" value={d.residents.deceased} icon={UserMinus} tone="slate" href="/warga?status=DECEASED" />
          <StatCard label="Total Rumah" value={d.units} icon={Home} tone="gold" href="/rumah" />
        </div>
      </section>

      <section aria-labelledby="ops-h" className="mb-6">
        <h2 id="ops-h" className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Operasional</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Pengajuan Surat" value={d.requests} hint="Diajukan / diproses" icon={FileText} href="/surat" />
          <StatCard label="Booking Menunggu Review" value={d.bookings} icon={CalendarCheck} tone="blue" href="/booking?status=PENDING" />
          <StatCard label="Tamu Hari Ini" value={d.visitorsToday} icon={BookUser} href="/buku-tamu" />
          <StatCard label="Laporan Keamanan Terbuka" value={d.incidentsOpen} icon={ShieldAlert} tone="red" href="/kejadian" />
        </div>
      </section>

      {d.recent.length > 0 && (
        <Card>
          <CardHeader title="Aktivitas Terbaru" action={<Link href="/sistem/log" className="link text-sm">Lihat semua</Link>} />
          <ul className="divide-y divide-slate-100">
            {d.recent.map((l) => (
              <li key={l.id} className="flex flex-col gap-0.5 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <span className="text-slate-700">{l.summary}</span>
                <span className="shrink-0 text-xs text-slate-400">{l.userName ?? "Sistem"} · {formatDateTime(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

async function MemberDashboard({ ctx }: { ctx: AuthContext }) {
  const d = await memberDashboard(ctx);
  const em = emergencyContacts();
  const s = d.bills?.summary;
  const unit = d.bills?.units[0];
  return (
    <>
      <PageHeader title={`Halo, ${ctx.name}`} description="Informasi tagihan, layanan, dan kegiatan perumahan Anda." />
      {!ctx.residentId && (
        <div className="mb-5 flex gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <AlertCircle className="h-5 w-5 shrink-0 text-slate-400" /> Akun Anda belum terhubung dengan data warga. Hubungi pengurus agar tagihan dapat ditampilkan.
        </div>
      )}
      {s && s.arrearsCount > 0 && unit && (
        <div className="mb-5">
          <ArrearsWarning name={ctx.name} houseNumber={d.bills!.units.map((u) => u.houseNumber).join(", ")} months={s.arrearsCount}
            periods={s.arrearsPeriods.map((p) => periodLabel(p.year, p.month))} total={rupiah(s.arrearsAmount)} />
        </div>
      )}
      {s && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total Tunggakan" value={rupiah(s.arrearsAmount)} hint={`${s.arrearsCount} periode`} icon={Wallet} tone={s.arrearsCount ? "red" : "brand"} href="/tagihan-saya" />
          <StatCard label="Menunggu Verifikasi" value={s.pendingCount} hint="Periode dalam pengecekan" icon={Clock} tone="blue" href="/riwayat-pembayaran" />
          <StatCard label="Tagihan Dapat Dibayar" value={s.payable.length} hint="Termasuk belum jatuh tempo" icon={Receipt} href="/tagihan-saya" />
          <StatCard label="Bayar IPL" value="Ajukan" hint="Unggah bukti transfer" icon={HandCoins} tone="gold" href="/ipl/pembayaran/baru" />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Riwayat Pembayaran" action={<Link href="/riwayat-pembayaran" className="link text-sm">Semua</Link>} />
          {d.payments.length === 0 ? <EmptyState title="Belum ada pembayaran" description="Pengajuan pembayaran IPL Anda akan tampil di sini." /> : (
            <ul className="divide-y divide-slate-100">
              {d.payments.map((p) => (
                <li key={p.id}><Link href={`/ipl/pembayaran/${p.id}`} className="flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-slate-50 sm:px-5">
                  <span><span className="font-medium">{p.number}</span><br /><span className="text-xs text-slate-500">{formatDateTime(p.createdAt)}</span></span>
                  <span className="text-right"><span className="font-semibold">{rupiah(p.totalAmount)}</span><br /><PaymentStatusBadge status={p.status} /></span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Pengumuman" action={<Link href="/pengumuman" className="link text-sm">Semua</Link>} />
          {d.announcements.length === 0 ? <EmptyState title="Belum ada pengumuman" /> : (
            <ul className="divide-y divide-slate-100">
              {d.announcements.map((a) => (
                <li key={a.id}><Link href={`/pengumuman/${a.id}`} className="block px-4 py-3 text-sm hover:bg-slate-50 sm:px-5">
                  <span className="flex items-center gap-2 font-medium">{a.isPriority && <Badge tone="red">Penting</Badge>}{a.title}</span>
                  <span className="text-xs text-slate-500">{a.category} · {formatDateTime(a.publishedAt)}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Pengajuan Surat & Booking" />
          <CardBody className="space-y-3 text-sm">
            {d.requests.length === 0 && d.bookings.length === 0 && <p className="text-slate-500">Belum ada pengajuan aktif.</p>}
            {d.requests.map((r) => (
              <Link key={r.id} href={`/pengajuan/${r.id}`} className="flex items-center justify-between gap-2 hover:text-brand-700">
                <span><FileText className="mr-1 inline h-4 w-4 text-slate-400" />{r.type.name} <span className="text-xs text-slate-500">({r.number})</span></span>
                <Badge tone="blue">{ADMIN_REQUEST_STATUS[r.status]}</Badge>
              </Link>
            ))}
            {d.bookings.map((b) => (
              <Link key={b.id} href="/booking-saya" className="flex items-center justify-between gap-2 hover:text-brand-700">
                <span><CalendarCheck className="mr-1 inline h-4 w-4 text-slate-400" />{b.facility.name} · {formatDateTime(b.startAt)}</span>
                <Badge tone={b.status === "APPROVED" ? "green" : b.status === "PENDING" ? "blue" : "gray"}>{BOOKING_STATUS[b.status]}</Badge>
              </Link>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              <LinkButton href="/pengajuan" size="sm" variant="secondary">Ajukan Surat</LinkButton>
              <LinkButton href="/booking" size="sm" variant="secondary">Booking Gedung</LinkButton>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Kegiatan Mendatang" action={<Link href="/kegiatan" className="link text-sm">Semua</Link>} />
          {d.activities.length === 0 ? <EmptyState title="Belum ada kegiatan terjadwal" /> : (
            <ul className="divide-y divide-slate-100">
              {d.activities.map((a) => (
                <li key={a.id} className="px-4 py-3 text-sm sm:px-5">
                  <p className="font-medium"><CalendarDays className="mr-1 inline h-4 w-4 text-slate-400" />{a.name}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(a.startAt)} · {a.location}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Kontak Darurat" />
        <CardBody><EmergencyContacts contacts={em.contacts} verified={em.verified} /></CardBody>
      </Card>
    </>
  );
}

async function SecurityDashboard({ ctx }: { ctx: AuthContext }) {
  const d = await securityDashboard(ctx);
  return (
    <>
      <PageHeader title="Dashboard Keamanan" description={`Petugas: ${ctx.name}`}
        actions={<>
          <LinkButton href="/buku-tamu/masuk">Catat Tamu Masuk</LinkButton>
          <LinkButton href="/buku-tamu?status=inside" variant="secondary">Catat Tamu Keluar</LinkButton>
        </>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tamu di Dalam" value={d.inside.length} icon={BookUser} href="/buku-tamu?status=inside" />
        <StatCard label="Tamu Hari Ini" value={d.todayVisitors.length} icon={Users} tone="blue" href="/buku-tamu" />
        <StatCard label="Laporan Terbuka" value={d.incidents.filter((i) => i.status === "OPEN" || i.status === "IN_PROGRESS").length} icon={ShieldAlert} tone="red" href="/kejadian" />
        <StatCard label="Kamera CCTV" value={d.cameras.length} icon={Camera} tone="slate" href="/cctv" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Tamu yang Masih Berada di Perumahan" />
          {d.inside.length === 0 ? <EmptyState title="Tidak ada tamu di dalam" /> : (
            <ul className="divide-y divide-slate-100">
              {d.inside.map((v) => (
                <li key={v.id}><Link href={`/buku-tamu/${v.id}`} className="block px-4 py-3 text-sm hover:bg-slate-50 sm:px-5">
                  <p className="font-medium">{v.visitorName} <span className="text-slate-500">→ {v.unit?.houseNumber ?? v.hostName ?? "-"}</span></p>
                  <p className="text-xs text-slate-500">Masuk {formatDateTime(v.checkInAt)} · {v.purpose}</p>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Laporan Kejadian Terbaru" action={<Link href="/kejadian/baru" className="link text-sm">Buat Laporan</Link>} />
          {d.incidents.length === 0 ? <EmptyState title="Belum ada laporan" /> : (
            <ul className="divide-y divide-slate-100">
              {d.incidents.map((i) => (
                <li key={i.id}><Link href={`/kejadian/${i.id}`} className="flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-slate-50 sm:px-5">
                  <span><span className="font-medium">{i.type}</span><br /><span className="text-xs text-slate-500">{i.location} · {formatDateTime(i.occurredAt)}</span></span>
                  <Badge tone={i.status === "OPEN" ? "red" : i.status === "IN_PROGRESS" ? "yellow" : "green"}>{INCIDENT_STATUS[i.status]}</Badge>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Daftar CCTV" />
          {d.cameras.length === 0 ? <EmptyState title="Belum ada kamera terdaftar" /> : (
            <ul className="divide-y divide-slate-100">
              {d.cameras.map((c) => (
                <li key={c.id} className="flex items-center justify-between px-4 py-3 text-sm sm:px-5">
                  <span>{c.name} <span className="text-slate-500">· {c.location}</span></span>
                  <Badge tone={c.status === "ONLINE" ? "green" : c.status === "OFFLINE" ? "red" : "gray"}>{CAMERA_STATUS[c.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Pengumuman Keamanan" />
          {d.announcements.length === 0 ? <EmptyState title="Belum ada pengumuman" /> : (
            <ul className="divide-y divide-slate-100">
              {d.announcements.map((a) => (
                <li key={a.id}><Link href={`/pengumuman/${a.id}`} className="block px-4 py-3 text-sm hover:bg-slate-50 sm:px-5">
                  <span className="flex items-center gap-2 font-medium"><Megaphone className="h-4 w-4 text-slate-400" />{a.isPriority && <Badge tone="red">Penting</Badge>}{a.title}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
