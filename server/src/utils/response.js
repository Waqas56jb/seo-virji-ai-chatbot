export const ok = (res, data = {}, message = 'Request completed successfully', status = 200) =>
  res.status(status).json({ success: true, data, message });

export const created = (res, data, message = 'Created') => ok(res, data, message, 201);

/** Wraps async route handlers so rejections reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
