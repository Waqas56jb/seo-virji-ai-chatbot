import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
}

/** Single place that turns errors into safe JSON. Stack traces never reach clients. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';
  let details;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Some fields are invalid.';
    details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
  } else if (err.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request is too large.';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body is not valid JSON.';
  } else if (err.code === '23505') {
    status = 409;
    code = 'CONFLICT';
    message = 'This record already exists.';
  } else if (err.code === '23503' || err.code === '22P02') {
    status = 400;
    code = 'BAD_REFERENCE';
    message = 'A referenced record is invalid.';
  } else if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', '57P01'].includes(err.code)) {
    status = 503;
    code = 'DATABASE_UNAVAILABLE';
    message = 'The service is temporarily unavailable. Please try again shortly.';
  }

  const log = status >= 500 ? logger.error : logger.warn;
  log('request.error', { rid: req.id, status, code, path: req.originalUrl.split('?')[0], error: err.message });

  res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}), requestId: req.id } });
}
