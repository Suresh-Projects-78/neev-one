-- CreateIndex
CREATE UNIQUE INDEX "Payment_orgId_sourceSystem_sourceKey_key" ON "Payment"("orgId", "sourceSystem", "sourceKey");

