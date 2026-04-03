import express from 'express';
import cors from 'cors';
import { apiKeyAuth } from './middleware/apiKeyAuth';
import { residentsRouter } from './routes/residents';
import { healthRouter } from './routes/health';

export function createExpressApp(): express.Application {
  const app = express();

  // Restrict CORS to localhost only
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Electron, curl, etc.) or localhost
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  }));

  app.use(express.json({ limit: '1mb' }));

  // Rate limiting: simple in-memory tracker
  const requestCounts = new Map<string, { count: number; resetAt: number }>();
  app.use((req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = requestCounts.get(ip);

    if (!entry || now > entry.resetAt) {
      requestCounts.set(ip, { count: 1, resetAt: now + 60_000 }); // 1 minute window
    } else {
      entry.count++;
      if (entry.count > 100) { // Max 100 requests per minute per IP
        res.status(429).json({ error: 'Too many requests' });
        return;
      }
    }
    next();
  });

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[api] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
  });

  app.use(apiKeyAuth);

  app.use('/api', healthRouter);
  app.use('/api', residentsRouter);

  return app;
}
