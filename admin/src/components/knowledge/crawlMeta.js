/** Labels and badge tones for website sync jobs and crawl-log pages. */

export const JOB_STATUS = {
  queued: { label: 'Queued', tone: 'yellow' },
  running: { label: 'Syncing', tone: 'yellow' },
  completed: { label: 'Completed', tone: 'green' },
  failed: { label: 'Failed', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
};

export const jobStatusMeta = (status) => JOB_STATUS[status] || { label: status || 'Unknown', tone: 'gray' };

export const MODE_LABELS = {
  incremental: 'Website sync',
  full: 'Full re-crawl',
  single: 'Single page',
  retry: 'Retry failed pages',
};

export const PHASE_LABELS = {
  discover: 'Discovering pages',
  fetch: 'Reading pages',
  index: 'Building knowledge & embeddings',
  finalize: 'Finalising',
  done: 'Done',
};

export const TRIGGER_LABELS = {
  admin: 'Started by an admin',
  manual: 'Started manually',
  schedule: 'Scheduled',
  scheduled: 'Scheduled',
  cron: 'Scheduled',
};

export const PAGE_STATUS = {
  pending: { label: 'Pending', tone: 'gray' },
  fetched: { label: 'Fetched', tone: 'blue' },
  new: { label: 'New', tone: 'green' },
  updated: { label: 'Updated', tone: 'navy' },
  unchanged: { label: 'Unchanged', tone: 'gray' },
  failed: { label: 'Failed', tone: 'red' },
  skipped: { label: 'Skipped', tone: 'yellow' },
};

export const pageStatusMeta = (status) => PAGE_STATUS[status] || { label: status || 'Unknown', tone: 'gray' };

export const isActiveJob = (job) => Boolean(job && ['queued', 'running'].includes(job.status));

export const shortUrl = (url = '') => url.replace(/^https?:\/\//, '').replace(/\/$/, '') || url;

/** Percentage of discovered pages handled so far (null while still discovering). */
export function jobProgress(job) {
  if (!job || !job.pagesFound || job.phase === 'discover') return null;
  const done = (job.pagesProcessed || 0) + (job.pagesFailed || 0) + (job.pagesSkipped || 0);
  return Math.max(2, Math.min(100, Math.round((done / job.pagesFound) * 100)));
}
