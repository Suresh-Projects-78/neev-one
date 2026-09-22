-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PayrollPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT,
    "number" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "paymentDate" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "ledgerAccountId" TEXT,
    "reference" TEXT,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "paidCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "journalEntryId" TEXT,
    "postingStatus" TEXT NOT NULL DEFAULT 'UNPOSTED',
    "postedAt" DATETIME,
    "postedByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PayrollPayment" ("accountId", "branchId", "createdAt", "createdByUserId", "failedCount", "id", "ledgerAccountId", "method", "number", "orgId", "paidAmount", "paidCount", "paymentDate", "reference", "runId", "status", "totalAmount", "updatedAt") SELECT "accountId", "branchId", "createdAt", "createdByUserId", "failedCount", "id", "ledgerAccountId", "method", "number", "orgId", "paidAmount", "paidCount", "paymentDate", "reference", "runId", "status", "totalAmount", "updatedAt" FROM "PayrollPayment";
DROP TABLE "PayrollPayment";
ALTER TABLE "new_PayrollPayment" RENAME TO "PayrollPayment";
CREATE INDEX "PayrollPayment_accountId_orgId_runId_status_idx" ON "PayrollPayment"("accountId", "orgId", "runId", "status");
CREATE UNIQUE INDEX "PayrollPayment_orgId_number_key" ON "PayrollPayment"("orgId", "number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
