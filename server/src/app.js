import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { corsMiddleware } from './config/cors.js';
import { requestId } from './middleware/request-id.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import routes from './routes/index.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // correct client IPs behind Railway/Render proxies (rate limiting)

  app.use(requestId);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(corsMiddleware);
  // Settings may carry a small logo data URL; everything else is far smaller.
  app.use(express.json({ limit: '400kb' }));
  app.use(cookieParser());

  app.get('/', (req, res) => res.json({ success: true, data: { name: 'SEO Virji AI Chatbot API', health: '/api/health' } }));
  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
