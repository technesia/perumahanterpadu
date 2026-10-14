-- Ekstensi untuk exclusion constraint booking (UUID/teks + rentang waktu)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "public"."ResidentStatus" AS ENUM ('ACTIVE', 'NEWCOMER', 'MOVED', 'DECEASED');

-- CreateEnum
CREATE TYPE "public"."OccupancyStatus" AS ENUM ('PERMANENT', 'TEMPORARY', 'VACANT');

-- CreateEnum
CREATE TYPE "public"."MembershipRelation" AS ENUM ('HEAD', 'FAMILY', 'TENANT');

-- CreateEnum
CREATE TYPE "public"."IplBillStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'QRIS');

-- CreateEnum
CREATE TYPE "public"."IplPaymentStatus" AS ENUM ('PENDING_VERIFICATION', 'AWAITING_PROVIDER', 'APPROVED', 'REJECTED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."FinanceType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "public"."FinanceSource" AS ENUM ('MANUAL', 'IPL_PAYMENT');

-- CreateEnum
CREATE TYPE "public"."FinanceStatus" AS ENUM ('POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "public"."AdminRequestStatus" AS ENUM ('SUBMITTED', 'PROCESSING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."AnnouncementAudience" AS ENUM ('ALL', 'RESIDENTS', 'SECURITY', 'INTERNAL');

-- CreateEnum
CREATE TYPE "public"."PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."ActivityStatus" AS ENUM ('PLANNED', 'ONGOING', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."BookingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."IncidentStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."CameraStatus" AS ENUM ('ONLINE', 'OFFLINE', 'MAINTENANCE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "public"."organizations" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rt" TEXT,
    "rw" TEXT,
    "village" TEXT,
    "regency" TEXT,
    "arrearsWindowMonths" INTEGER NOT NULL DEFAULT 60,
    "deathRecordMaxYears" INTEGER NOT NULL DEFAULT 10,
    "holdPendingBookings" BOOLEAN NOT NULL DEFAULT true,
    "allowPartialPayment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "public"."user_roles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."login_attempts" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "userRole" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."counters" (
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("organizationId","key","year")
);

-- CreateTable
CREATE TABLE "public"."stored_files" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."residents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nik" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "status" "public"."ResidentStatus" NOT NULL DEFAULT 'ACTIVE',
    "occupancyStatus" "public"."OccupancyStatus" NOT NULL DEFAULT 'PERMANENT',
    "moveInDate" DATE,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deathDate" DATE,
    "deathRecordedAt" TIMESTAMP(3),
    "deathRecordedById" TEXT,
    "internalNotes" TEXT,
    "userId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "residents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."resident_histories" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resident_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."residential_units" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "houseNumber" TEXT NOT NULL,
    "block" TEXT,
    "address" TEXT NOT NULL,
    "occupancyStatus" "public"."OccupancyStatus" NOT NULL DEFAULT 'PERMANENT',
    "ownerResidentId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "residential_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."resident_unit_memberships" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "relation" "public"."MembershipRelation" NOT NULL DEFAULT 'HEAD',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resident_unit_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ipl_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL DEFAULT 10,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ipl_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ipl_bills" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "residentId" TEXT,
    "iplTypeId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."IplBillStatus" NOT NULL DEFAULT 'UNPAID',
    "dueDate" DATE NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ipl_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ipl_payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "method" "public"."PaymentMethod" NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "status" "public"."IplPaymentStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "notes" TEXT,
    "rejectionReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "providerName" TEXT,
    "providerTransactionId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ipl_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ipl_payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "ipl_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ipl_payment_proofs" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ipl_payment_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ipl_payment_histories" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "fromStatus" "public"."IplPaymentStatus",
    "toStatus" "public"."IplPaymentStatus" NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ipl_payment_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."finance_categories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "public"."FinanceType" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."finance_transactions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "public"."FinanceType" NOT NULL,
    "source" "public"."FinanceSource" NOT NULL DEFAULT 'MANUAL',
    "categoryId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "public"."PaymentMethod",
    "reference" TEXT,
    "counterparty" TEXT,
    "notes" TEXT,
    "status" "public"."FinanceStatus" NOT NULL DEFAULT 'POSTED',
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "iplPaymentId" TEXT,
    "attachmentFileId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."finance_transaction_histories" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_transaction_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."opening_balances" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "note" TEXT,
    "setById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opening_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."administrative_request_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administrative_request_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."administrative_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "unitId" TEXT,
    "requesterUserId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "contactPhone" TEXT,
    "status" "public"."AdminRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "applicantNotes" TEXT,
    "internalNotes" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrative_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."administrative_request_documents" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administrative_request_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."administrative_request_histories" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromStatus" "public"."AdminRequestStatus",
    "toStatus" "public"."AdminRequestStatus" NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administrative_request_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."announcements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "audience" "public"."AnnouncementAudience" NOT NULL DEFAULT 'ALL',
    "status" "public"."PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "isPriority" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "attachmentFileId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."activities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "location" TEXT NOT NULL,
    "personInCharge" TEXT,
    "status" "public"."ActivityStatus" NOT NULL DEFAULT 'PLANNED',
    "attachmentFileId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."facilities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "capacity" INTEGER,
    "rules" TEXT,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "openTime" TEXT NOT NULL DEFAULT '08:00',
    "closeTime" TEXT NOT NULL DEFAULT '22:00',
    "slotMinutes" INTEGER NOT NULL DEFAULT 60,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "photoFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."facility_bookings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT NOT NULL,
    "participants" INTEGER,
    "notes" TEXT,
    "status" "public"."BookingStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facility_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."facility_booking_histories" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fromStatus" "public"."BookingStatus",
    "toStatus" "public"."BookingStatus" NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facility_booking_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."visitor_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL,
    "idNumber" TEXT,
    "phone" TEXT,
    "purpose" TEXT NOT NULL,
    "unitId" TEXT,
    "hostName" TEXT,
    "vehiclePlate" TEXT,
    "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkOutAt" TIMESTAMP(3),
    "checkInById" TEXT NOT NULL,
    "checkOutById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitor_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."security_incidents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "status" "public"."IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "managementNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."security_incident_attachments" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_incident_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cctv_cameras" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."CameraStatus" NOT NULL DEFAULT 'UNKNOWN',
    "accessUrl" TEXT,
    "internalNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cctv_cameras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."resident_businesses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerResidentId" TEXT,
    "ownerName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "contact" TEXT,
    "address" TEXT,
    "showAddress" BOOLEAN NOT NULL DEFAULT false,
    "ownerConsent" BOOLEAN NOT NULL DEFAULT false,
    "openingHours" TEXT,
    "logoFileId" TEXT,
    "status" "public"."PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resident_businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."posyandu_activities" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "location" TEXT NOT NULL,
    "officer" TEXT,
    "description" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posyandu_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "public"."organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_organizationId_username_key" ON "public"."users"("organizationId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "users_organizationId_email_key" ON "public"."users"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "public"."roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "public"."permissions"("key");

-- CreateIndex
CREATE INDEX "user_roles_organizationId_roleId_idx" ON "public"."user_roles"("organizationId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON "public"."user_roles"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_tokenHash_key" ON "public"."user_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "user_sessions_userId_idx" ON "public"."user_sessions"("userId");

-- CreateIndex
CREATE INDEX "login_attempts_key_createdAt_idx" ON "public"."login_attempts"("key", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "public"."audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_module_idx" ON "public"."audit_logs"("organizationId", "module");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "public"."audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_storageKey_key" ON "public"."stored_files"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "residents_userId_key" ON "public"."residents"("userId");

-- CreateIndex
CREATE INDEX "residents_organizationId_status_idx" ON "public"."residents"("organizationId", "status");

-- CreateIndex
CREATE INDEX "residents_organizationId_occupancyStatus_idx" ON "public"."residents"("organizationId", "occupancyStatus");

-- CreateIndex
CREATE INDEX "residents_organizationId_fullName_idx" ON "public"."residents"("organizationId", "fullName");

-- CreateIndex
CREATE INDEX "residents_organizationId_phone_idx" ON "public"."residents"("organizationId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "residents_organizationId_code_key" ON "public"."residents"("organizationId", "code");

-- CreateIndex
CREATE INDEX "resident_histories_residentId_createdAt_idx" ON "public"."resident_histories"("residentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "residential_units_organizationId_houseNumber_key" ON "public"."residential_units"("organizationId", "houseNumber");

-- CreateIndex
CREATE INDEX "resident_unit_memberships_organizationId_unitId_endDate_idx" ON "public"."resident_unit_memberships"("organizationId", "unitId", "endDate");

-- CreateIndex
CREATE INDEX "resident_unit_memberships_residentId_endDate_idx" ON "public"."resident_unit_memberships"("residentId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "ipl_types_organizationId_name_key" ON "public"."ipl_types"("organizationId", "name");

-- CreateIndex
CREATE INDEX "ipl_bills_organizationId_status_dueDate_idx" ON "public"."ipl_bills"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "ipl_bills_organizationId_periodYear_periodMonth_idx" ON "public"."ipl_bills"("organizationId", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "ipl_bills_organizationId_unitId_iplTypeId_periodYear_period_key" ON "public"."ipl_bills"("organizationId", "unitId", "iplTypeId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "ipl_payments_organizationId_status_idx" ON "public"."ipl_payments"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ipl_payments_residentId_idx" ON "public"."ipl_payments"("residentId");

-- CreateIndex
CREATE UNIQUE INDEX "ipl_payments_organizationId_number_key" ON "public"."ipl_payments"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ipl_payments_providerName_providerTransactionId_key" ON "public"."ipl_payments"("providerName", "providerTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "ipl_payments_organizationId_idempotencyKey_key" ON "public"."ipl_payments"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ipl_payment_allocations_billId_idx" ON "public"."ipl_payment_allocations"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "ipl_payment_allocations_paymentId_billId_key" ON "public"."ipl_payment_allocations"("paymentId", "billId");

-- CreateIndex
CREATE INDEX "ipl_payment_histories_paymentId_idx" ON "public"."ipl_payment_histories"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_organizationId_code_key" ON "public"."finance_categories"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_iplPaymentId_key" ON "public"."finance_transactions"("iplPaymentId");

-- CreateIndex
CREATE INDEX "finance_transactions_organizationId_type_date_idx" ON "public"."finance_transactions"("organizationId", "type", "date");

-- CreateIndex
CREATE INDEX "finance_transactions_organizationId_status_idx" ON "public"."finance_transactions"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "finance_transactions_organizationId_number_key" ON "public"."finance_transactions"("organizationId", "number");

-- CreateIndex
CREATE INDEX "finance_transaction_histories_transactionId_idx" ON "public"."finance_transaction_histories"("transactionId");

-- CreateIndex
CREATE INDEX "opening_balances_organizationId_createdAt_idx" ON "public"."opening_balances"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_request_types_organizationId_code_key" ON "public"."administrative_request_types"("organizationId", "code");

-- CreateIndex
CREATE INDEX "administrative_requests_organizationId_status_idx" ON "public"."administrative_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "administrative_requests_residentId_idx" ON "public"."administrative_requests"("residentId");

-- CreateIndex
CREATE UNIQUE INDEX "administrative_requests_organizationId_number_key" ON "public"."administrative_requests"("organizationId", "number");

-- CreateIndex
CREATE INDEX "administrative_request_histories_requestId_idx" ON "public"."administrative_request_histories"("requestId");

-- CreateIndex
CREATE INDEX "announcements_organizationId_status_publishedAt_idx" ON "public"."announcements"("organizationId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "activities_organizationId_startAt_idx" ON "public"."activities"("organizationId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "facilities_organizationId_name_key" ON "public"."facilities"("organizationId", "name");

-- CreateIndex
CREATE INDEX "facility_bookings_organizationId_facilityId_startAt_idx" ON "public"."facility_bookings"("organizationId", "facilityId", "startAt");

-- CreateIndex
CREATE INDEX "facility_bookings_organizationId_status_idx" ON "public"."facility_bookings"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "facility_bookings_organizationId_number_key" ON "public"."facility_bookings"("organizationId", "number");

-- CreateIndex
CREATE INDEX "facility_booking_histories_bookingId_idx" ON "public"."facility_booking_histories"("bookingId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "public"."notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "visitor_logs_organizationId_checkInAt_idx" ON "public"."visitor_logs"("organizationId", "checkInAt");

-- CreateIndex
CREATE INDEX "visitor_logs_organizationId_checkOutAt_idx" ON "public"."visitor_logs"("organizationId", "checkOutAt");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_logs_organizationId_number_key" ON "public"."visitor_logs"("organizationId", "number");

-- CreateIndex
CREATE INDEX "security_incidents_organizationId_occurredAt_idx" ON "public"."security_incidents"("organizationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "security_incidents_organizationId_number_key" ON "public"."security_incidents"("organizationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "cctv_cameras_organizationId_name_key" ON "public"."cctv_cameras"("organizationId", "name");

-- CreateIndex
CREATE INDEX "resident_businesses_organizationId_status_idx" ON "public"."resident_businesses"("organizationId", "status");

-- CreateIndex
CREATE INDEX "posyandu_activities_organizationId_startAt_idx" ON "public"."posyandu_activities"("organizationId", "startAt");

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "public"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."counters" ADD CONSTRAINT "counters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stored_files" ADD CONSTRAINT "stored_files_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."residents" ADD CONSTRAINT "residents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."residents" ADD CONSTRAINT "residents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."resident_histories" ADD CONSTRAINT "resident_histories_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "public"."residents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."residential_units" ADD CONSTRAINT "residential_units_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."residential_units" ADD CONSTRAINT "residential_units_ownerResidentId_fkey" FOREIGN KEY ("ownerResidentId") REFERENCES "public"."residents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."resident_unit_memberships" ADD CONSTRAINT "resident_unit_memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."resident_unit_memberships" ADD CONSTRAINT "resident_unit_memberships_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "public"."residents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."resident_unit_memberships" ADD CONSTRAINT "resident_unit_memberships_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."residential_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ipl_types" ADD CONSTRAINT "ipl_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ipl_bills" ADD CONSTRAINT "ipl_bills_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ipl_bills" ADD CONSTRAINT "ipl_bills_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."residential_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ipl_bills" ADD CONSTRAINT "ipl_bills_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "public"."residents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ipl_bills" ADD CONSTRAINT "ipl_bills_iplTypeId_fkey" FOREIGN KEY ("iplTypeId") REFERENCES "public"."ipl_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ipl_payments" ADD CONSTRAINT "ipl_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ipl_payments" ADD CONSTRAINT "ipl_payments_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."residential_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ipl_payments" ADD CONSTRAINT "ipl_payments_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "public"."residents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ipl_payment_allocations" ADD CONSTRAINT "ipl_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."ipl_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ipl_payment_allocations" ADD CONSTRAINT "ipl_payment_allocations_billId_fkey" FOREIGN KEY ("billId") REFERENCES "public"."ipl_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ipl_payment_proofs" ADD CONSTRAINT "ipl_payment_proofs_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."ipl_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ipl_payment_proofs" ADD CONSTRAINT "ipl_payment_proofs_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "public"."stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ipl_payment_histories" ADD CONSTRAINT "ipl_payment_histories_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."ipl_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."finance_categories" ADD CONSTRAINT "finance_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."finance_transactions" ADD CONSTRAINT "finance_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."finance_transactions" ADD CONSTRAINT "finance_transactions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."finance_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."finance_transactions" ADD CONSTRAINT "finance_transactions_iplPaymentId_fkey" FOREIGN KEY ("iplPaymentId") REFERENCES "public"."ipl_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."finance_transaction_histories" ADD CONSTRAINT "finance_transaction_histories_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."finance_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."opening_balances" ADD CONSTRAINT "opening_balances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."administrative_request_types" ADD CONSTRAINT "administrative_request_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."administrative_requests" ADD CONSTRAINT "administrative_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."administrative_requests" ADD CONSTRAINT "administrative_requests_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "public"."administrative_request_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."administrative_requests" ADD CONSTRAINT "administrative_requests_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "public"."residents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."administrative_requests" ADD CONSTRAINT "administrative_requests_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."residential_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."administrative_request_documents" ADD CONSTRAINT "administrative_request_documents_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."administrative_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."administrative_request_documents" ADD CONSTRAINT "administrative_request_documents_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "public"."stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."administrative_request_histories" ADD CONSTRAINT "administrative_request_histories_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."administrative_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."announcements" ADD CONSTRAINT "announcements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."activities" ADD CONSTRAINT "activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."facilities" ADD CONSTRAINT "facilities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."facility_bookings" ADD CONSTRAINT "facility_bookings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."facility_bookings" ADD CONSTRAINT "facility_bookings_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "public"."facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."facility_bookings" ADD CONSTRAINT "facility_bookings_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "public"."residents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."facility_booking_histories" ADD CONSTRAINT "facility_booking_histories_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."facility_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."visitor_logs" ADD CONSTRAINT "visitor_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."visitor_logs" ADD CONSTRAINT "visitor_logs_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."residential_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."security_incidents" ADD CONSTRAINT "security_incidents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."security_incident_attachments" ADD CONSTRAINT "security_incident_attachments_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "public"."security_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."security_incident_attachments" ADD CONSTRAINT "security_incident_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "public"."stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cctv_cameras" ADD CONSTRAINT "cctv_cameras_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."resident_businesses" ADD CONSTRAINT "resident_businesses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."resident_businesses" ADD CONSTRAINT "resident_businesses_ownerResidentId_fkey" FOREIGN KEY ("ownerResidentId") REFERENCES "public"."residents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."posyandu_activities" ADD CONSTRAINT "posyandu_activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────── Constraint tambahan di luar kemampuan Prisma ─────────

-- Booking aktif (Menunggu Review / Disetujui) pada fasilitas yang sama tidak boleh tumpang tindih.
ALTER TABLE "facility_bookings"
  ADD CONSTRAINT "facility_bookings_no_overlap"
  EXCLUDE USING gist ("facilityId" WITH =, tsrange("startAt", "endAt", '[)') WITH &&)
  WHERE ("status" IN ('PENDING', 'APPROVED'));

ALTER TABLE "facility_bookings" ADD CONSTRAINT "facility_bookings_time_order" CHECK ("endAt" > "startAt");

-- Nominal uang tidak boleh negatif; paidAmount tidak melebihi tagihan.
ALTER TABLE "ipl_bills" ADD CONSTRAINT "ipl_bills_amount_check" CHECK ("amount" >= 0 AND "paidAmount" >= 0 AND "paidAmount" <= "amount");
ALTER TABLE "ipl_bills" ADD CONSTRAINT "ipl_bills_period_check" CHECK ("periodMonth" BETWEEN 1 AND 12 AND "periodYear" BETWEEN 2000 AND 2100);
ALTER TABLE "ipl_types" ADD CONSTRAINT "ipl_types_amount_check" CHECK ("amount" > 0 AND "dueDay" BETWEEN 1 AND 28);
ALTER TABLE "ipl_payments" ADD CONSTRAINT "ipl_payments_amount_check" CHECK ("totalAmount" > 0);
ALTER TABLE "ipl_payment_allocations" ADD CONSTRAINT "ipl_payment_allocations_amount_check" CHECK ("amount" > 0);
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_amount_check" CHECK ("amount" > 0);

-- Satu warga hanya punya satu keanggotaan aktif per rumah.
CREATE UNIQUE INDEX "resident_unit_memberships_active_unique"
  ON "resident_unit_memberships" ("residentId", "unitId") WHERE "endDate" IS NULL;

-- Audit log append-only: tolak UPDATE/DELETE di level database.
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs bersifat append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
