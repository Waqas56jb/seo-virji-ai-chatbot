/**
 * Work that should continue after the HTTP response is sent (summaries, crawl steps).
 * On Vercel the function would otherwise be frozen once the response ends, so the promise
 * is registered with `waitUntil`; on a normal Node server it simply keeps running.
 */
import { waitUntil } from '@vercel/functions';
import { logger } from './logger.js';

export const isServerless = Boolean(process.env.VERCEL);

export function runInBackground(label, task) {
  const promise = Promise.resolve()
    .then(task)
    .catch((err) => logger.error('background.failed', { task: label, error: err?.message }));
  if (isServerless) {
    try {
      waitUntil(promise);
    } catch {
      /* not inside a request context — the promise still runs */
    }
  }
  return promise;
}
