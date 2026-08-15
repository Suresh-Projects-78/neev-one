Production backend scaffold (Express + Prisma + TypeScript)

This backend implements:
- Multi-tenant isolation via `accountId`
- Multi-org (company) via `orgId`
- Multi-branch via `branchId`
- DB-stored RBAC (roles + permissions)
- Inter-branch inventory transfers

----------------------------------
Critical isolation rule
----------------------------------
All protected requests must include:
- `Authorization: Bearer <jwt>`
- `x-org-id: <orgId>`
- `x-branch-id: <branchId>`

Middleware enforces:
- User belongs to org
- User belongs to branch
- All queries always filter by `accountId + orgId` and the correct branch context

Quick start

1) Copy environment:

```bash
cd server
copy .env.example .env
```

2) Install dependencies:

```bash
npm install
```

3) Generate + migrate:

```bash
npm run prisma:generate
npm run prisma:push
```

4) Start dev server:

```bash
npm run dev
```

APIs (core)

- POST `/api/auth/login`
- Branches (company/branch setup)
	- GET `/api/orgs/:orgId/branches`
	- POST `/api/orgs/:orgId/branches`
	- PATCH `/api/orgs/:orgId/branches/:branchId`
	- DELETE `/api/orgs/:orgId/branches/:branchId`
- Roles (DB-stored permissions)
	- GET `/api/orgs/:orgId/roles`
	- POST `/api/orgs/:orgId/roles`
	- PATCH `/api/orgs/:orgId/roles/:roleId`
- Users
	- POST `/api/users`
	- POST `/api/orgs/:orgId/users/:userId/branches`
	- POST `/api/orgs/:orgId/users/:userId/roles`
- Inter-branch transfer
	- GET `/api/orgs/:orgId/transfers`
	- POST `/api/orgs/:orgId/transfers`
	- POST `/api/orgs/:orgId/transfers/:transferId/send`
	- POST `/api/orgs/:orgId/transfers/:transferId/receive`

Notes

- All permission checks are server-side in `src/middleware/rbac.ts`.
- GSTIN validation: `src/utils/gstin.ts` (format + checksum + state code match).

Master data sharing (head office)

- Branches can enable `shareHeadOfficeSettings` and set `parentBranchId` (head office).
- Recommended pattern:
	- Transactions are always written with the active `branchId`.
	- Master data (items/ledgers/settings) can be resolved from: current branch OR parent branch OR org-shared (`branchId = null`).
- Helper: `src/utils/branchScope.ts`.

Secure query example

- See `src/examples/secureQuery.ts` for a reference implementation that enforces:
	- membership authorization, and
	- `accountId + orgId + branchId` filtering on every query.
