import { requirePage } from "@/server/auth/session";
import { listBookings } from "@/server/services/facilities";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { BookingList } from "../booking/booking-list";

export const metadata = { title: "Booking Saya" };

export default async function MyBookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePage("facilities.book");
  const page = parsePage((await searchParams).page);
  const { items, total } = await listBookings(ctx, { page, own: true });
  return (
    <>
      <PageHeader title="Booking Saya" crumbs={[{ label: "Booking Gedung", href: "/booking" }, { label: "Booking Saya" }]}
        actions={<LinkButton href="/booking">Booking Baru</LinkButton>} />
      <Card>
        <BookingList rows={items} staff={false} />
        <Pagination page={page} pageSize={20} total={total} baseHref="/booking-saya" />
      </Card>
    </>
  );
}
