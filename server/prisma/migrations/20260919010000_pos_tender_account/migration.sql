-- CreateTable
CREATE TABLE "PosTenderAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "tender" TEXT NOT NULL,
    "ledgerAccountId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PosTenderAccount_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PosTenderAccount_accountId_orgId_branchId_idx" ON "PosTenderAccount"("accountId", "orgId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "PosTenderAccount_orgId_branchId_tender_key" ON "PosTenderAccount"("orgId", "branchId", "tender");

