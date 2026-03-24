import express from 'express';
import cors from 'cors';
import { apiKeyAuth } from './middleware/apiKeyAuth';
import { residentsRouter } from './routes/residents';
import { healthRouter } from './routes/health';

export function createExpressApp(): express.Application {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(apiKeyAuth);

  app.use('/api', healthRouter);
  app.use('/api', residentsRouter);

  return app;
}
