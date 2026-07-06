import express from 'express';
import cors from 'cors';
import { apiKeyAuth } from './middleware/apiKeyAuth';
import { residentsRouter } from './routes/residents';
import { healthRouter } from './routes/health';
import { officialsRouter } from './routes/officials';
import { statsRouter } from './routes/stats';
import { presenceRouter } from './routes/presence';
import { appAuthRouter } from './routes/app';
import { appUserAuth } from './middleware/appUser';

// The server listens on 0.0.0.0 so other devices on the LAN can reach it.
// Allow browser requests from localhost and private-network origins; everything
// is still gated by the API key. Non-browser clients (curl, scripts, mobile
// apps) send no Origin header and are unaffected by CORS.
const PRIVATE_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})(:\d+)?$/;

export function createExpressApp(): express.Application {
  const app = express();

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || PRIVATE_ORIGIN.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    allowedHeaders: ['Content-Type', 'X-API-Key', 'X-User-Token'],
  }));

  app.use(express.json({ limit: '1mb' }));

  // Rate limiting: simple in-memory tracker
  const requestCounts = new Map<string, { count: number; resetAt: number }>();
  app.use((req, res, next) => {
    // Behind the Cloudflare tunnel every request arrives from localhost, so
    // key the limiter on the real client IP that Cloudflare forwards.
    const ip = (req.headers['cf-connecting-ip'] as string)
      || req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    // Prune expired entries so the map can't grow unbounded
    if (requestCounts.size > 500) {
      for (const [key, value] of requestCounts) {
        if (now > value.resetAt) requestCounts.delete(key);
      }
    }

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
  app.use(appUserAuth);

  app.use('/api', healthRouter);
  app.use('/api', residentsRouter);
  app.use('/api', officialsRouter);
  app.use('/api', statsRouter);
  app.use('/api', presenceRouter);
  app.use('/api', appAuthRouter);

  return app;
}
