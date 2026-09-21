-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "designation" TEXT,
    "department" TEXT,
    "dateOfJoining" TEXT,
    "dateOfLeaving" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EmployeePayrollProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollStatus" TEXT NOT NULL DEFAULT 'IN_PAYROLL',
    "payGroupId" TEXT,
    "costCenterId" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankIfsc" TEXT,
    "bankName" TEXT,
    "pan" TEXT,
    "uan" TEXT,
    "pfNumber" TEXT,
    "esiNumber" TEXT,
    "taxRegime" TEXT NOT NULL DEFAULT 'NEW',
    "professionalTaxState" TEXT,
    "pfApplicable" BOOLEAN NOT NULL DEFAULT false,
    "esiApplicable" BOOLEAN NOT NULL DEFAULT false,
    "ptApplicable" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PayGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "paymentDay" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "paymentDate" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "fiscalYearId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SalaryComponent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "calculationMethod" TEXT NOT NULL DEFAULT 'FIXED',
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "percentage" DECIMAL NOT NULL DEFAULT 0,
    "formula" TEXT,
    "calculationBase" TEXT,
    "rounding" TEXT NOT NULL DEFAULT 'NEAREST',
    "statutoryScheme" TEXT,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "prorate" BOOLEAN NOT NULL DEFAULT true,
    "includeInPfWage" BOOLEAN NOT NULL DEFAULT false,
    "includeInEsiWage" BOOLEAN NOT NULL DEFAULT false,
    "includeInGratuityWage" BOOLEAN NOT NULL DEFAULT false,
    "includeInGross" BOOLEAN NOT NULL DEFAULT true,
    "includeInNetPay" BOOLEAN NOT NULL DEFAULT true,
    "isVariable" BOOLEAN NOT NULL DEFAULT false,
    "isFlexibleBenefit" BOOLEAN NOT NULL DEFAULT false,
    "expenseLedgerId" TEXT,
    "liabilityLedgerId" TEXT,
    "costCentreBehaviour" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SalaryStructure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "payGroupId" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SalaryStructureComponent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "calculationMethod" TEXT,
    "amount" DECIMAL,
    "percentage" DECIMAL,
    "formula" TEXT,
    "calculationBase" TEXT,
    "isBalancing" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalaryStructureComponent_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "SalaryStructure" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalaryAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT,
    "employeeId" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "payGroupId" TEXT,
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,
    "annualCtc" DECIMAL NOT NULL DEFAULT 0,
    "monthlyCtc" DECIMAL NOT NULL DEFAULT 0,
    "costCenterId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "revisionId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SalaryRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "currentAssignmentId" TEXT,
    "currentStructureId" TEXT,
    "currentAnnualCtc" DECIMAL NOT NULL DEFAULT 0,
    "proposedStructureId" TEXT NOT NULL,
    "proposedAnnualCtc" DECIMAL NOT NULL DEFAULT 0,
    "incrementPercent" DECIMAL NOT NULL DEFAULT 0,
    "effectiveFrom" TEXT NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "impactJson" TEXT NOT NULL DEFAULT '{}',
    "reviewedByUserId" TEXT,
    "reviewedAt" DATETIME,
    "approvedByUserId" TEXT,
    "approvedAt" DATETIME,
    "appliedAssignmentId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT,
    "employeeId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "reason" TEXT,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "consumedByRunId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" DATETIME,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT,
    "number" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "payGroupId" TEXT,
    "department" TEXT,
    "payrollDate" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "employeeCount" INTEGER NOT NULL DEFAULT 0,
    "grossTotal" DECIMAL NOT NULL DEFAULT 0,
    "deductionTotal" DECIMAL NOT NULL DEFAULT 0,
    "employerContributionTotal" DECIMAL NOT NULL DEFAULT 0,
    "netTotal" DECIMAL NOT NULL DEFAULT 0,
    "employerCostTotal" DECIMAL NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "engineVersion" TEXT,
    "calculatedAt" DATETIME,
    "submittedByUserId" TEXT,
    "submittedAt" DATETIME,
    "reviewedByUserId" TEXT,
    "reviewedAt" DATETIME,
    "approvedByUserId" TEXT,
    "approvedAt" DATETIME,
    "rejectedByUserId" TEXT,
    "rejectedAt" DATETIME,
    "rejectionReason" TEXT,
    "lockedAt" DATETIME,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PayrollRunEmployee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "inclusion" TEXT NOT NULL DEFAULT 'INCLUDED',
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "assignmentId" TEXT,
    "issuesJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollRunEmployee_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollInput" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workingDays" DECIMAL NOT NULL DEFAULT 0,
    "payableDays" DECIMAL NOT NULL DEFAULT 0,
    "lwpDays" DECIMAL NOT NULL DEFAULT 0,
    "overtimeAmount" DECIMAL NOT NULL DEFAULT 0,
    "variablePay" DECIMAL NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SalarySlip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT,
    "number" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "payrollDate" TEXT NOT NULL,
    "grossEarnings" DECIMAL NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL NOT NULL DEFAULT 0,
    "employerContributions" DECIMAL NOT NULL DEFAULT 0,
    "netPay" DECIMAL NOT NULL DEFAULT 0,
    "employerCost" DECIMAL NOT NULL DEFAULT 0,
    "previousNetPay" DECIMAL,
    "variancePercent" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "employeeSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "assignmentSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "structureSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "inputSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "adjustmentSnapshotJson" TEXT NOT NULL DEFAULT '[]',
    "statutorySnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "engineVersion" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalarySlip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalarySlipLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "slipId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "componentCode" TEXT NOT NULL,
    "componentName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "fullAmount" DECIMAL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "expenseLedgerId" TEXT,
    "liabilityLedgerId" TEXT,
    "costCenterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalarySlipLine_slipId_fkey" FOREIGN KEY ("slipId") REFERENCES "SalarySlip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollCalculationTrace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "slipId" TEXT NOT NULL,
    "componentId" TEXT,
    "componentCode" TEXT NOT NULL,
    "baseLabel" TEXT,
    "baseAmount" DECIMAL,
    "ruleText" TEXT,
    "formula" TEXT,
    "computedAmount" DECIMAL NOT NULL DEFAULT 0,
    "prorationFactor" DECIMAL,
    "roundingApplied" DECIMAL,
    "statutoryRuleId" TEXT,
    "statutoryRuleVersion" TEXT,
    "detailJson" TEXT NOT NULL DEFAULT '{}',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollCalculationTrace_slipId_fkey" FOREIGN KEY ("slipId") REFERENCES "SalarySlip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollLoan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT,
    "number" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'LOAN',
    "principal" DECIMAL NOT NULL DEFAULT 0,
    "interestRate" DECIMAL NOT NULL DEFAULT 0,
    "startDate" TEXT NOT NULL,
    "recoveryStartPeriodId" TEXT,
    "installmentCount" INTEGER NOT NULL DEFAULT 0,
    "installmentAmount" DECIMAL NOT NULL DEFAULT 0,
    "outstandingBalance" DECIMAL NOT NULL DEFAULT 0,
    "recoveryComponentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" DATETIME,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PayrollLoanInstallment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "periodId" TEXT,
    "sequence" INTEGER NOT NULL,
    "dueAmount" DECIMAL NOT NULL DEFAULT 0,
    "principalAmount" DECIMAL NOT NULL DEFAULT 0,
    "interestAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "slipId" TEXT,
    "recoveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollLoanInstallment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "PayrollLoan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StatutoryScheme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "registrationNumber" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StatutoryRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "jurisdiction" TEXT,
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,
    "version" TEXT NOT NULL,
    "employeeRate" DECIMAL NOT NULL DEFAULT 0,
    "employerRate" DECIMAL NOT NULL DEFAULT 0,
    "wageCeiling" DECIMAL,
    "eligibilityThreshold" DECIMAL,
    "rounding" TEXT NOT NULL DEFAULT 'NEAREST',
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StatutoryRule_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "StatutoryScheme" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmployeeStatutoryConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "schemeCode" TEXT NOT NULL,
    "isApplicable" BOOLEAN NOT NULL DEFAULT true,
    "overrideEmployeeRate" DECIMAL,
    "overrideEmployerRate" DECIMAL,
    "jurisdiction" TEXT,
    "effectiveFrom" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PayrollPayment" (
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
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PayrollPaymentLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "slipId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "reference" TEXT,
    "paidAt" DATETIME,
    "bankAccountNumber" TEXT,
    "bankIfsc" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollPaymentLine_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PayrollPayment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollPosting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "postingDate" TEXT NOT NULL,
    "journalEntryId" TEXT,
    "totalDebit" DECIMAL NOT NULL DEFAULT 0,
    "totalCredit" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reversedByEntryId" TEXT,
    "reversedAt" DATETIME,
    "postedByUserId" TEXT,
    "postedAt" DATETIME,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PayrollPostingLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "ledgerAccountId" TEXT NOT NULL,
    "ledgerName" TEXT NOT NULL,
    "debit" DECIMAL NOT NULL DEFAULT 0,
    "credit" DECIMAL NOT NULL DEFAULT 0,
    "costCenterId" TEXT,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollPostingLine_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "PayrollPosting" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Employee_accountId_orgId_status_idx" ON "Employee"("accountId", "orgId", "status");

-- CreateIndex
CREATE INDEX "Employee_accountId_orgId_branchId_idx" ON "Employee"("accountId", "orgId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_orgId_code_key" ON "Employee"("orgId", "code");

-- CreateIndex
CREATE INDEX "EmployeePayrollProfile_accountId_orgId_payrollStatus_idx" ON "EmployeePayrollProfile"("accountId", "orgId", "payrollStatus");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePayrollProfile_orgId_employeeId_key" ON "EmployeePayrollProfile"("orgId", "employeeId");

-- CreateIndex
CREATE INDEX "PayGroup_accountId_orgId_isActive_idx" ON "PayGroup"("accountId", "orgId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PayGroup_orgId_name_key" ON "PayGroup"("orgId", "name");

-- CreateIndex
CREATE INDEX "PayrollPeriod_accountId_orgId_startDate_idx" ON "PayrollPeriod"("accountId", "orgId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_orgId_name_key" ON "PayrollPeriod"("orgId", "name");

-- CreateIndex
CREATE INDEX "SalaryComponent_accountId_orgId_type_isActive_idx" ON "SalaryComponent"("accountId", "orgId", "type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryComponent_orgId_code_key" ON "SalaryComponent"("orgId", "code");

-- CreateIndex
CREATE INDEX "SalaryStructure_accountId_orgId_status_idx" ON "SalaryStructure"("accountId", "orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryStructure_orgId_name_effectiveFrom_key" ON "SalaryStructure"("orgId", "name", "effectiveFrom");

-- CreateIndex
CREATE INDEX "SalaryStructureComponent_accountId_orgId_idx" ON "SalaryStructureComponent"("accountId", "orgId");

-- CreateIndex
CREATE INDEX "SalaryStructureComponent_structureId_idx" ON "SalaryStructureComponent"("structureId");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryStructureComponent_structureId_componentId_key" ON "SalaryStructureComponent"("structureId", "componentId");

-- CreateIndex
CREATE INDEX "SalaryAssignment_accountId_orgId_employeeId_effectiveFrom_idx" ON "SalaryAssignment"("accountId", "orgId", "employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "SalaryAssignment_accountId_orgId_status_idx" ON "SalaryAssignment"("accountId", "orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryAssignment_orgId_employeeId_effectiveFrom_key" ON "SalaryAssignment"("orgId", "employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "SalaryRevision_accountId_orgId_employeeId_idx" ON "SalaryRevision"("accountId", "orgId", "employeeId");

-- CreateIndex
CREATE INDEX "SalaryRevision_accountId_orgId_status_idx" ON "SalaryRevision"("accountId", "orgId", "status");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_accountId_orgId_periodId_status_idx" ON "PayrollAdjustment"("accountId", "orgId", "periodId", "status");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_accountId_orgId_employeeId_periodId_idx" ON "PayrollAdjustment"("accountId", "orgId", "employeeId", "periodId");

-- CreateIndex
CREATE INDEX "PayrollRun_accountId_orgId_status_idx" ON "PayrollRun"("accountId", "orgId", "status");

-- CreateIndex
CREATE INDEX "PayrollRun_accountId_orgId_periodId_idx" ON "PayrollRun"("accountId", "orgId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_orgId_number_key" ON "PayrollRun"("orgId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_orgId_periodId_payGroupId_branchId_key" ON "PayrollRun"("orgId", "periodId", "payGroupId", "branchId");

-- CreateIndex
CREATE INDEX "PayrollRunEmployee_accountId_orgId_runId_state_idx" ON "PayrollRunEmployee"("accountId", "orgId", "runId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRunEmployee_runId_employeeId_key" ON "PayrollRunEmployee"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "PayrollInput_accountId_orgId_runId_idx" ON "PayrollInput"("accountId", "orgId", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollInput_runId_employeeId_key" ON "PayrollInput"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "SalarySlip_accountId_orgId_employeeId_periodId_idx" ON "SalarySlip"("accountId", "orgId", "employeeId", "periodId");

-- CreateIndex
CREATE INDEX "SalarySlip_accountId_orgId_status_idx" ON "SalarySlip"("accountId", "orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SalarySlip_orgId_number_key" ON "SalarySlip"("orgId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "SalarySlip_runId_employeeId_key" ON "SalarySlip"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "SalarySlipLine_accountId_orgId_slipId_idx" ON "SalarySlipLine"("accountId", "orgId", "slipId");

-- CreateIndex
CREATE INDEX "SalarySlipLine_slipId_idx" ON "SalarySlipLine"("slipId");

-- CreateIndex
CREATE INDEX "PayrollCalculationTrace_accountId_orgId_slipId_idx" ON "PayrollCalculationTrace"("accountId", "orgId", "slipId");

-- CreateIndex
CREATE INDEX "PayrollCalculationTrace_slipId_idx" ON "PayrollCalculationTrace"("slipId");

-- CreateIndex
CREATE INDEX "PayrollLoan_accountId_orgId_employeeId_status_idx" ON "PayrollLoan"("accountId", "orgId", "employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLoan_orgId_number_key" ON "PayrollLoan"("orgId", "number");

-- CreateIndex
CREATE INDEX "PayrollLoanInstallment_accountId_orgId_loanId_status_idx" ON "PayrollLoanInstallment"("accountId", "orgId", "loanId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLoanInstallment_loanId_sequence_key" ON "PayrollLoanInstallment"("loanId", "sequence");

-- CreateIndex
CREATE INDEX "StatutoryScheme_accountId_orgId_isEnabled_idx" ON "StatutoryScheme"("accountId", "orgId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "StatutoryScheme_orgId_code_key" ON "StatutoryScheme"("orgId", "code");

-- CreateIndex
CREATE INDEX "StatutoryRule_accountId_orgId_schemeId_status_idx" ON "StatutoryRule"("accountId", "orgId", "schemeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StatutoryRule_schemeId_jurisdiction_effectiveFrom_version_key" ON "StatutoryRule"("schemeId", "jurisdiction", "effectiveFrom", "version");

-- CreateIndex
CREATE INDEX "EmployeeStatutoryConfig_accountId_orgId_schemeCode_idx" ON "EmployeeStatutoryConfig"("accountId", "orgId", "schemeCode");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeStatutoryConfig_orgId_employeeId_schemeCode_key" ON "EmployeeStatutoryConfig"("orgId", "employeeId", "schemeCode");

-- CreateIndex
CREATE INDEX "PayrollPayment_accountId_orgId_runId_status_idx" ON "PayrollPayment"("accountId", "orgId", "runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPayment_orgId_number_key" ON "PayrollPayment"("orgId", "number");

-- CreateIndex
CREATE INDEX "PayrollPaymentLine_accountId_orgId_paymentId_status_idx" ON "PayrollPaymentLine"("accountId", "orgId", "paymentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPaymentLine_paymentId_slipId_key" ON "PayrollPaymentLine"("paymentId", "slipId");

-- CreateIndex
CREATE INDEX "PayrollPosting_accountId_orgId_status_idx" ON "PayrollPosting"("accountId", "orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPosting_orgId_runId_key" ON "PayrollPosting"("orgId", "runId");

-- CreateIndex
CREATE INDEX "PayrollPostingLine_accountId_orgId_postingId_idx" ON "PayrollPostingLine"("accountId", "orgId", "postingId");

-- CreateIndex
CREATE INDEX "PayrollPostingLine_postingId_idx" ON "PayrollPostingLine"("postingId");
