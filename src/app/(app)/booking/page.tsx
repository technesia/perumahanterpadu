import { requirePage } from "@/server/auth/session";
import { can } from "@/server/auth/context";
import { listBookings, listFacilities } from "@/server/services/facilities";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FilterBar, FilterSelect, sp } from "@/components/ui/filter-bar";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { LinkButton } from "@/components/ui/button";
import { BOOKING_STATUS } from "@/lib/labels";
import { BookingCalendar } from "./booking-calendar";
import { BookingList } from "./booking-list";

export const metadata = { title: "Booking Gedung" };
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function BookingPage({ searchParams }: { searchParams: SP }) {
  const ctx = await requirePage(["facilities.view", "facilities.manage"]);
  const staff = can(ctx, "facilities.manage");
  const s = await searchParams;
  const facilities = await listFacilities(ctx);
  const f = { status: sp(s.status) ?? (staff ? "PENDING" : undefined), facilityId: sp(s.facilityId), q: sp(s.q), page: parsePage(s.page) };
  const list = staff ? await listBookings(ctx, f) : null;
  return (
    <>
      <PageHeader title="Booking Gedung" description={staff ? "Kalender ketersediaan dan review pengajuan booking." : "Pilih gedung dan tanggal, lalu ajukan slot waktu."}
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Booking Gedung" }]}
        actions={!staff && can(ctx, "facilities.book") ? <LinkButton href="/booking-saya" variant="secondary">Booking Saya</LinkButton> : staff ? <LinkButton href="/fasilitas" variant="secondary">Kelola Fasilitas</LinkButton> : null} />
      {list && (
        <Card className="mb-5">
          <CardHeader title="Pengajuan Booking" description="Default menampilkan yang menunggu review (terdekat di atas)." />
          <FilterBar action="/booking" q={f.q} placeholder="Nomor, pemohon, atau tujuan" resetHref="/booking?status=">
            <FilterSelect name="status" label="Status" value={f.status} options={Object.entries(BOOKING_STATUS).map(([value, label]) => ({ value, label }))} />
            <FilterSelect name="facilityId" label="Gedung" value={f.facilityId} options={facilities.map((x) => ({ value: x.id, label: x.name }))} />
          </FilterBar>
          <BookingList rows={list.items} staff />
          <Pagination page={f.page} pageSize={20} total={list.total} baseHref="/booking" params={{ status: f.status, facilityId: f.facilityId, q: f.q }} />
        </Card>
      )}
      <Card>
        <CardHeader title="Kalender Ketersediaan" />
        <BookingCalendar staff={staff} canBook={can(ctx, "facilities.book") && !!ctx.residentId}
          facilities={facilities.map((x) => ({ id: x.id, name: x.name, openTime: x.openTime, closeTime: x.closeTime, slotMinutes: x.slotMinutes, capacity: x.capacity, fee: x.fee, rules: x.rules, location: x.location }))} />
      </Card>
    </>
  );
}
