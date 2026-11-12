import { useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, History, Loader2, RefreshCw, RotateCcw, ScanSearch, XCircle } from 'lucide-react';
import { ConfirmDialog } from '../shared/Modal.jsx';
import { Skeleton, StatusBadge } from '../shared/ui.jsx';
import CrawlLogsModal from './CrawlLogsModal.jsx';
import { formatDateTime, formatRelative } from '../../utils/date.js';
import { MODE_LABELS, PHASE_LABELS, TRIGGER_LABELS, isActiveJob, jobProgress, jobStatusMeta, shortUrl } from './crawlMeta.js';
import styles from './knowledge.module.css';

function Metric({ label, value }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricValue}>{value ?? '–'}</span>
      <span className={styles.metricLabel}>{label}</span>
    </div>
  );
}

/**
 * Website sync: incremental sync, full re-crawl, retry of failed pages and the crawl logs.
 * Live progress comes from GET /api/crawler/status (polled by the page while a job runs).
 * Success is only shown once the server reports the job as completed.
 */
export default function WebsiteSyncCard({ status, loading, error, onRetryLoad, onAction, onCancel, busyAction }) {
  const [confirmFull, setConfirmFull] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  if (loading && !status) {
    return (
      <div className={`card ${styles.sync}`}>
        <div className={styles.syncHead}>
          <Skeleton width={44} height={44} radius={13} />
          <div style={{ flex: 1 }}>
            <Skeleton width="35%" height={15} />
            <Skeleton width="55%" height={12} style={{ marginTop: 8 }} />
          </div>
        </div>
        <div className={styles.metrics}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={56} radius={12} />
          ))}
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className={`card ${styles.sync}`} role="alert">
        <p className={styles.syncError}>
          <AlertTriangle size={15} /> Couldn't load the website sync status: {error.message}
        </p>
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={onRetryLoad}>
          <RotateCcw size={14} /> Try again
        </button>
      </div>
    );
  }

  const latest = status?.latest;
  const running = isActiveJob(latest);
  // While a sync runs, show it live; otherwise show the last whole-site sync.
  const job = running ? latest : status?.lastFullSync || latest;
  const meta = job ? jobStatusMeta(job.status) : null;
  const progress = running ? jobProgress(latest) : null;
  const knowledge = status?.knowledge;
  const failedUrls = status?.failedUrls || [];
  const lastSuccessAt = status?.lastSuccessfulSync?.completedAt || knowledge?.lastSuccessfulSyncAt;
  const schedule = status?.schedule;
  const busy = Boolean(busyAction) || running;

  return (
    <div className={`card ${styles.sync}`}>
      <div className={styles.syncHead}>
        <span className={`${styles.syncIcon} ${running ? styles.syncIconBusy : ''}`}>
          {running ? <Loader2 size={20} className={styles.spin} /> : <RefreshCw size={20} />}
        </span>
        <div className={styles.syncText}>
          <h3 className={styles.syncTitle}>Website Sync</h3>
          {status?.websiteUrl && (
            <a href={status.websiteUrl} target="_blank" rel="noopener noreferrer" className={styles.syncUrl}>
              {shortUrl(status.websiteUrl)} <ExternalLink size={12} />
            </a>
          )}
        </div>
        {running ? (
          <button type="button" className="btn btn-secondary" onClick={() => onCancel(latest.id)}>
            <XCircle size={16} /> Cancel sync
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => onAction('sync')} disabled={busy}>
            <RefreshCw size={16} /> {busyAction === 'sync' ? 'Starting…' : 'Sync Website Now'}
          </button>
        )}
      </div>

      {running && (
        <div className={styles.liveBox} aria-live="polite">
          <div className={styles.liveTop}>
            <strong>
              {latest.mode === 'single' ? `Reading ${shortUrl(latest.url || latest.websiteUrl)}` : MODE_LABELS[latest.mode] || 'Website sync'}
              {' · '}
              {latest.status === 'queued' ? 'Waiting to start' : PHASE_LABELS[latest.phase] || 'Working'}
            </strong>
            <span>
              {latest.pagesFound ? `${(latest.pagesProcessed || 0) + (latest.pagesFailed || 0) + (latest.pagesSkipped || 0)} / ${latest.pagesFound} pages` : 'Finding pages…'}
              {progress != null && ` · ${progress}%`}
            </span>
          </div>
          <div className={styles.progress} role="progressbar" aria-valuenow={progress ?? undefined} aria-valuemin={0} aria-valuemax={100} aria-label="Sync progress">
            <span style={{ width: `${progress ?? 8}%` }} className={progress == null ? styles.progressIndeterminate : ''} />
          </div>
          <p className={styles.liveHint}>Keep this page open — progress updates every few seconds.</p>
        </div>
      )}

      {job ? (
        <>
          <div className={styles.syncStatusRow}>
            <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
            <span className={styles.syncMode}>{MODE_LABELS[job.mode] || 'Website sync'}</span>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {job.completedAt ? `Finished ${formatDateTime(job.completedAt)}` : job.startedAt ? `Started ${formatDateTime(job.startedAt)}` : 'Waiting to start'}
              {job.trigger && TRIGGER_LABELS[job.trigger] ? ` · ${TRIGGER_LABELS[job.trigger]}` : ''}
            </span>
          </div>
          {job.status === 'completed' && !running && (
            <p className={styles.syncOk}>
              <CheckCircle2 size={15} /> Website knowledge is up to date{job.truncated ? ' (the sync stopped at the maximum page limit)' : ''}.
            </p>
          )}
          {job.error && (
            <p className={styles.syncError}>
              <AlertTriangle size={15} /> {job.error}
            </p>
          )}
          <div className={styles.metrics}>
            <Metric label="Discovered URLs" value={job.pagesFound} />
            <Metric label="Processed" value={job.pagesProcessed} />
            <Metric label="Skipped" value={job.pagesSkipped} />
            <Metric label="Failed" value={job.pagesFailed} />
            <Metric label="Chunks" value={job.chunksTotal} />
            <Metric label="Embeddings" value={job.embeddingsGenerated} />
          </div>
          <p className={styles.syncFoot}>
            {job.pagesNew ?? 0} new · {job.pagesUpdated ?? 0} updated · {job.pagesUnchanged ?? 0} unchanged · {job.pagesRemoved ?? 0} removed
          </p>
        </>
      ) : (
        <p className={styles.syncSub} style={{ marginTop: 14 }}>
          Your AI has not read your website yet. Click “Sync Website Now” to start.
        </p>
      )}

      <dl className={styles.syncInfo}>
        <div>
          <dt>
            <CheckCircle2 size={14} /> Last successful sync
          </dt>
          <dd>{lastSuccessAt ? `${formatDateTime(lastSuccessAt)} (${formatRelative(lastSuccessAt)})` : 'Never'}</dd>
        </div>
        <div>
          <dt>
            <CalendarClock size={14} /> Next scheduled sync
          </dt>
          <dd>
            {schedule?.enabled && schedule.nextRunAt ? (
              <>
                {formatDateTime(schedule.nextRunAt)}
                <small>
                  Shown in your local time · schedule runs in {schedule.timezone || 'UTC'}
                  {schedule.expression ? ` (${schedule.expression})` : ''}
                </small>
              </>
            ) : (
              'Automatic sync is off'
            )}
          </dd>
        </div>
      </dl>

      {failedUrls.length > 0 && (
        <details className={styles.failedBox}>
          <summary>
            <AlertTriangle size={14} /> {failedUrls.length} page{failedUrls.length === 1 ? '' : 's'} failed in the last sync
          </summary>
          <ul className={styles.failedList}>
            {failedUrls.map((f) => (
              <li key={f.url}>
                <a href={f.url} target="_blank" rel="noopener noreferrer" className={`${styles.logUrl} truncate`} title={f.url}>
                  {shortUrl(f.url)} <ExternalLink size={11} />
                </a>
                <p className={styles.logReason}>
                  {f.httpStatus ? `HTTP ${f.httpStatus}` : ''}
                  {f.httpStatus && f.error ? ' — ' : ''}
                  {f.error || (!f.httpStatus ? 'Unknown error' : '')}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className={styles.syncActions}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmFull(true)} disabled={busy}>
          <ScanSearch size={15} /> {busyAction === 'full' ? 'Starting…' : 'Full Re-Crawl'}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onAction('retry')}
          disabled={busy || failedUrls.length === 0}
          title={failedUrls.length === 0 ? 'No pages failed in the last sync' : undefined}
        >
          <RotateCcw size={15} /> {busyAction === 'retry' ? 'Starting…' : 'Retry Failed Pages'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLogsOpen(true)}>
          <History size={15} /> View Crawl Logs
        </button>
      </div>

      {knowledge && (
        <p className={styles.syncFoot}>
          {knowledge.chunks} knowledge chunks · {knowledge.embedded} with AI embeddings
          {knowledge.chunks > knowledge.embedded && ' · some content is keyword-searchable only'}
        </p>
      )}

      <ConfirmDialog
        open={confirmFull}
        title="Run a full website re-crawl?"
        description="Every page on your website will be read and re-indexed from scratch. Pages that no longer exist on your website will be removed from the AI's knowledge (they are deactivated and can be re-activated under Knowledge Records). Your own edits to pages and your business information are kept. This can take several minutes."
        confirmLabel="Start full re-crawl"
        tone="primary"
        onConfirm={() => {
          setConfirmFull(false);
          onAction('full');
        }}
        onClose={() => setConfirmFull(false)}
      />
      <CrawlLogsModal open={logsOpen} onClose={() => setLogsOpen(false)} />
    </div>
  );
}
