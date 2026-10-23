-- CreateEnum
CREATE TYPE "IplBillKind" AS ENUM ('REGULAR', 'OPENING_PERIOD', 'OPENING_LUMP');

-- AlterTable
ALTER TABLE "ipl_bills" ADD COLUMN     "initialPaidAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "kind" "IplBillKind" NOT NULL DEFAULT 'REGULAR',
ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "ipl_bill_corrections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amountBefore" INTEGER NOT NULL,
    "amountAfter" INTEGER NOT NULL,
    "initialPaidBefore" INTEGER NOT NULL,
    "initialPaidAfter" INTEGER NOT NULL,
    "statusBefore" "IplBillStatus" NOT NULL,
    "statusAfter" "IplBillStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ipl_bill_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ipl_bill_corrections_billId_createdAt_idx" ON "ipl_bill_corrections"("billId", "createdAt");

-- CreateIndex
CREATE INDEX "ipl_bill_corrections_organizationId_createdAt_idx" ON "ipl_bill_corrections"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ipl_bills_organizationId_kind_idx" ON "ipl_bills"("organizationId", "kind");

-- AddForeignKey
ALTER TABLE "ipl_bill_corrections" ADD CONSTRAINT "ipl_bill_corrections_billId_fkey" FOREIGN KEY ("billId") REFERENCES "ipl_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Tunggakan awal tanpa rincian periode memakai periode 0/0; selain itu periode bulanan valid.
ALTER TABLE "ipl_bills" DROP CONSTRAINT "ipl_bills_period_check";
ALTER TABLE "ipl_bills" ADD CONSTRAINT "ipl_bills_period_check" CHECK (
  ("kind" = 'OPENING_LUMP' AND "periodYear" = 0 AND "periodMonth" = 0)
  OR ("kind" <> 'OPENING_LUMP' AND "periodMonth" BETWEEN 1 AND 12 AND "periodYear" BETWEEN 2000 AND 2100)
);
-- Bagian terbayar sebelum aplikasi hanya untuk tunggakan awal, dan tidak melebihi total terbayar.
ALTER TABLE "ipl_bills" ADD CONSTRAINT "ipl_bills_initial_paid_check" CHECK (
  "initialPaidAmount" >= 0 AND "initialPaidAmount" <= "paidAmount" AND ("kind" <> 'REGULAR' OR "initialPaidAmount" = 0)
);
ALTER TABLE "ipl_bill_corrections" ADD CONSTRAINT "ipl_bill_corrections_reason_check" CHECK (length(trim("reason")) >= 5);

-- Riwayat koreksi bersifat append-only (sama seperti audit log).
CREATE OR REPLACE FUNCTION ipl_bill_corrections_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ipl_bill_corrections bersifat append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ipl_bill_corrections_no_update BEFORE UPDATE OR DELETE ON "ipl_bill_corrections"
  FOR EACH ROW EXECUTE FUNCTION ipl_bill_corrections_immutable();
