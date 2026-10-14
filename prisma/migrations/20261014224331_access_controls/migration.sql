-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "accountsLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "readOnlyMode" BOOLEAN NOT NULL DEFAULT false;
