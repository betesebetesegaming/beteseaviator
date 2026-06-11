import express, { type RequestHandler } from 'express';
import cors from 'cors';
import { onRequest, type HttpsOptions } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

const DEFAULT_OPTS: HttpsOptions = { memory: '512MiB', timeoutSeconds: 60 };

type HttpMethod = 'GET' | 'POST' | 'ALL';

interface CreateHttpFunctionOptions extends HttpsOptions {
  /** Use raw body parser (required for ModemPay webhook HMAC verification). */
  rawBody?: boolean;
  method?: HttpMethod;
}

/**
 * Wrap a single Express handler as its own HTTPS Cloud Function. Each export
 * gets a dedicated URL:
 *   https://<region>-<project>.cloudfunctions.net/<exportName>
 */
export function createHttpFunction(
  handler: RequestHandler,
  options: CreateHttpFunctionOptions = {},
) {
  const { rawBody, method = 'POST', ...httpsOpts } = options;
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: true }));

  if (rawBody) {
    app.use(express.raw({ type: '*/*', limit: '2mb' }));
  } else {
    app.use(express.json({ limit: '6mb' }));
  }

  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  const wrapped: RequestHandler = (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

  if (method === 'GET') {
    app.get('*', wrapped);
  } else if (method === 'POST') {
    app.post('*', wrapped);
  } else {
    app.all('*', wrapped);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  return onRequest({ ...DEFAULT_OPTS, ...httpsOpts }, app);
}

/**
 * Like createHttpFunction but mounts the handler on an Express path pattern
 * (e.g. `/:id`) so path params work on the function root.
 */
export function createHttpFunctionAtPath(
  path: string,
  handler: RequestHandler,
  options: CreateHttpFunctionOptions = {},
) {
  const { rawBody, method = 'GET', ...httpsOpts } = options;
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: true }));

  if (rawBody) {
    app.use(express.raw({ type: '*/*', limit: '2mb' }));
  } else {
    app.use(express.json({ limit: '6mb' }));
  }

  const wrapped: RequestHandler = (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

  if (method === 'GET') {
    app.get(path, wrapped);
  } else if (method === 'POST') {
    app.post(path, wrapped);
  } else {
    app.all(path, wrapped);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  return onRequest({ ...DEFAULT_OPTS, ...httpsOpts }, app);
}
