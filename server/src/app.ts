import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { authRouter } from './routes/auth.js';
import { branchesRouter } from './routes/branches.js';
import { rolesRouter } from './routes/roles.js';
import { usersRouter } from './routes/users.js';
import { transfersRouter } from './routes/transfers.js';
import { warehousesRouter } from './routes/warehouses.js';
import { inventoryAdjustmentsRouter } from './routes/inventoryAdjustments.js';
import { invoicesRouter } from './routes/invoices.js';
import { ledgerRouter } from './routes/ledger.js';
import { permissionsRouter } from './routes/permissions.js';
import { governanceRouter } from './routes/governance.js';
import { featuresRouter } from './routes/features.js';
import { partiesRouter } from './routes/parties.js';
import { emailRouter } from './routes/email.js';
import { securityRouter } from './routes/security.js';
import { itemsRouter } from './routes/items.js';
import { purchaseDocsRouter } from './routes/purchaseDocs.js';
import { quoteDocsRouter } from './routes/quoteDocs.js';
import { einvoiceRouter } from './routes/einvoice.js';
import { revaluationRouter } from './routes/revaluation.js';
import { currenciesRouter } from './routes/currencies.js';
import { importsRouter } from './routes/imports.js';
import { batchSerialRouter } from './routes/batchSerial.js';
import { paymentsRouter } from './routes/payments.js';
import { gstinRouter } from './routes/gstin.js';
import { notFound, errorHandler } from './middleware/errors.js';

export function buildApp() {
  const app = express();

  app.use(helmet());

  // CORS
  // We do NOT use cookies; auth is via Authorization header.
  // Using credentials:true with origin:'*' breaks browser preflight, so keep credentials:false.
  const allowList = String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const defaultDevAllow = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);

  app.use(
    cors({
      origin(origin, cb) {
        // Allow server-to-server tools with no Origin.
        if (!origin) return cb(null, true);
        if (allowList.length > 0) return cb(null, allowList.includes(origin));
        return cb(null, defaultDevAllow.has(origin));
      },
      credentials: false,
      allowedHeaders: ['Content-Type', 'Authorization', 'x-org-id', 'x-branch-id', 'x-warehouse-id'],
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('tiny'));

  // Test-only anomaly capture. The suite's residual flake shows up as
  // unexplained 401/403/404s that morgan records without context; this logs
  // every non-2xx JSON response with the request's tenancy headers so a
  // failing run can be diagnosed from the log instead of guessed at.
  // Gated to vitest: zero cost in dev and production.
  if (process.env.VITEST) {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    app.use((req, res, next) => {
      const orig = res.json.bind(res);
      (res as any).json = (body: unknown) => {
        if (res.statusCode >= 400) {
          try {
            const logDir = path.join(process.cwd(), 'logs');
            fs.mkdirSync(logDir, { recursive: true });
            fs.appendFileSync(
              path.join(logDir, 'test-anomalies.log'),
              JSON.stringify({
                ts: new Date().toISOString(),
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
                body,
                hasAuth: Boolean(req.headers.authorization),
                org: req.headers['x-org-id'] || null,
                branch: req.headers['x-branch-id'] || null,
              }) + '\n',
              'utf8'
            );
          } catch {
            /* capture is best-effort */
          }
        }
        return orig(body as any);
      };
      next();
    });
  }

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRouter);
  app.use('/api', branchesRouter);
  app.use('/api', warehousesRouter);
  app.use('/api', rolesRouter);
  app.use('/api', usersRouter);
  app.use('/api', transfersRouter);
  app.use('/api', inventoryAdjustmentsRouter);
  app.use('/api', invoicesRouter);
  app.use('/api', ledgerRouter);
  app.use('/api', permissionsRouter);
  app.use('/api', governanceRouter);
  app.use('/api', featuresRouter);
  app.use('/api', partiesRouter);
  app.use('/api', gstinRouter);
  app.use('/api', emailRouter);
  app.use('/api', securityRouter);
  app.use('/api', itemsRouter);
  app.use('/api', paymentsRouter);
  app.use('/api', batchSerialRouter);
  app.use('/api', importsRouter);
  app.use('/api', currenciesRouter);
  app.use('/api', revaluationRouter);
  app.use('/api', purchaseDocsRouter);
  app.use('/api', quoteDocsRouter);
  app.use('/api', einvoiceRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
