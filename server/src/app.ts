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

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRouter);
  app.use('/api', branchesRouter);
  app.use('/api', warehousesRouter);
  app.use('/api', rolesRouter);
  app.use('/api', usersRouter);
  app.use('/api', transfersRouter);
  app.use('/api', inventoryAdjustmentsRouter);
  app.use('/api', invoicesRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
