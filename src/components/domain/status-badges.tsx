import { Badge, type Tone } from "@/components/ui/badge";
import { BILL_STATUS, OCCUPANCY_STATUS, PAYMENT_STATUS, RESIDENT_STATUS } from "@/lib/labels";
import { BILL_STATUS_TONE, type BillDisplayStatus } from "@/lib/ipl";

export function BillStatusBadge({ status }: { status: BillDisplayStatus }) {
  return <Badge tone={BILL_STATUS_TONE[status]}>{BILL_STATUS[status]}</Badge>;
}

const PAYMENT_TONE: Record<keyof typeof PAYMENT_STATUS, Tone> = {
  PENDING_VERIFICATION: "blue", AWAITING_PROVIDER: "blue", APPROVED: "green", REJECTED: "red", CANCELLED: "gray", FAILED: "red",
};
export function PaymentStatusBadge({ status }: { status: keyof typeof PAYMENT_STATUS }) {
  return <Badge tone={PAYMENT_TONE[status]}>{PAYMENT_STATUS[status]}</Badge>;
}

const RESIDENT_TONE: Record<keyof typeof RESIDENT_STATUS, Tone> = { ACTIVE: "green", NEWCOMER: "blue", MOVED: "gray", DECEASED: "gray" };
export function ResidentStatusBadge({ status }: { status: keyof typeof RESIDENT_STATUS }) {
  return <Badge tone={RESIDENT_TONE[status]}>{RESIDENT_STATUS[status]}</Badge>;
}

export function OccupancyBadge({ status }: { status: keyof typeof OCCUPANCY_STATUS }) {
  return <Badge tone={status === "PERMANENT" ? "gold" : status === "TEMPORARY" ? "blue" : "gray"}>{OCCUPANCY_STATUS[status]}</Badge>;
}
