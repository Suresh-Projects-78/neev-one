-- CreateTable
CREATE TABLE "PosDayClose" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT,
    "date" TEXT NOT NULL,
    "invoices" INTEGER NOT NULL DEFAULT 0,
    "cash" DECIMAL NOT NULL DEFAULT 0,
    "upi" DECIMAL NOT NULL DEFAULT 0,
    "card" DECIMAL NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL DEFAULT 0,
    "countedCash" DECIMAL NOT NULL DEFAULT 0,
    "overShort" DECIMAL NOT NULL DEFAULT 0,
    "denomJson" TEXT NOT NULL DEFAULT '{}',
    "closedByUserId" TEXT,
    "closedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PosDayClose_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PosDayClose_accountId_orgId_date_idx" ON "PosDayClose"("accountId", "orgId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PosDayClose_accountId_orgId_branchId_date_key" ON "PosDayClose"("accountId", "orgId", "branchId", "date");
