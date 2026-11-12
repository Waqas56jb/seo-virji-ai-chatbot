import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, ExternalLink, History } from 'lucide-react';
import Modal from '../shared/Modal.jsx';
import { EmptyState, ErrorState, FilterTabs, Skeleton, StatusBadge } from '../shared/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { getCrawlJob, listCrawlJobs } from '../../services/knowledgeService.js';
import { formatDateTime, formatRelative } from '../../utils/date.js';
import { MODE_LABELS, PAGE_STATUS, jobStatusMeta, pageStatusMeta, shortUrl } from './crawlMeta.js';
import styles from './knowledge.module.css';

function ListSkeleton() {
  return (
    <ul className={styles.logList}>
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className={styles.logRow}>
          <Skeleton width={80} height={22} radius={11} />
          <Skeleton width="50%" height={13} />
        </li>
      ))}
    </ul>
  );
}

function JobList({ onOpen }) {
  const jobs = useAsync(() => listCrawlJobs(20), []);
  if (jobs.loading && !jobs.data) return <ListSkeleton />;
  if (jobs.error && !jobs.data) return <ErrorState compact title="Couldn't load sync history" error={jobs.error} onRetry={jobs.reload} />;
  if (!jobs.data?.length) return <EmptyState compact icon={History} title="No website syncs yet" description="Run “Sync Website Now” to read your website." />;
  return (
    <ul className={styles.logList}>
      {jobs.data.map((j) => {
        const meta = jobStatusMeta(j.status);
        return (
          <li key={j.id}>
            <button type="button" className={`${styles.logRow} ${styles.logRowButton}`} onClick={() => onOpen(j)}>
              <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
              <span className={styles.logMain}>
                <strong className="truncate">{j.mode === 'single' ? shortUrl(j.url || j.websiteUrl) : MODE_LABELS[j.mode] || 'Website sync'}</strong>
                <small>
                  {j.pagesFound ?? 0} found · {j.pagesProcessed ?? 0} processed · {j.pagesSkipped ?? 0} skipped · {j.pagesFailed ?? 0} failed
                </small>
              </span>
              <span className={styles.logWhen}>{formatRelative(j.createdAt)}</span>
              <ChevronRight size={16} className={styles.logChevron} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function JobDetail({ job: summary }) {
  const detail = useAsync(() => getCrawlJob(summary.id), [summary.id]);
  const [filter, setFilter] = useState('all');
  const job = detail.data || summary;
  const pages = detail.data?.pages;

  const counts = useMemo(() => {
    const out = { all: pages?.length || 0 };
    (pages || []).forEach((p) => {
      out[p.status] = (out[p.status] || 0) + 1;
    });
    return out;
  }, [pages]);

  const tabs = [{ value: 'all', label: 'All' }, ...Object.entries(PAGE_STATUS).filter(([k]) => counts[k]).map(([value, m]) => ({ value, label: m.label }))];
  const visible = (pages || []).filter((p) => filter === 'all' || p.status === filter);
  const meta = jobStatusMeta(job.status);

  return (
    <div className={styles.logDetail}>
      <div className={styles.logSummary}>
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
        <span>{MODE_LABELS[job.mode] || 'Website sync'}</span>
        <span className="muted">{job.completedAt ? `Finished ${formatDateTime(job.completedAt)}` : job.startedAt ? `Started ${formatDateTime(job.startedAt)}` : `Created ${formatDateTime(job.createdAt)}`}</span>
      </div>
      <p className={styles.logCounts}>
        {job.pagesFound ?? 0} discovered · {job.pagesProcessed ?? 0} processed · {job.pagesNew ?? 0} new · {job.pagesUpdated ?? 0} updated · {job.pagesUnchanged ?? 0} unchanged ·{' '}
        {job.pagesSkipped ?? 0} skipped · {job.pagesFailed ?? 0} failed · {job.pagesRemoved ?? 0} removed · {job.embeddingsGenerated ?? 0} embeddings
        {job.truncated && ' · stopped at the page limit'}
      </p>
      {job.error && <p className={styles.syncError}>{job.error}</p>}

      {detail.loading && !pages ? (
        <ListSkeleton />
      ) : detail.error && !pages ? (
        <ErrorState compact title="Couldn't load the crawl log" error={detail.error} onRetry={detail.reload} />
      ) : !pages?.length ? (
        <EmptyState compact icon={History} title="No pages recorded" description="This sync did not record any pages." />
      ) : (
        <>
          <FilterTabs options={tabs} value={filter} onChange={setFilter} counts={counts} label="Filter pages by status" wrap />
          <ul className={styles.logPages}>
            {visible.map((p) => {
              const pm = pageStatusMeta(p.status);
              return (
                <li key={p.id} className={styles.logPage}>
                  <div className={styles.logPageTop}>
                    <StatusBadge tone={pm.tone}>{pm.label}</StatusBadge>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className={`${styles.logUrl} truncate`} title={p.url}>
                      {shortUrl(p.url)} <ExternalLink size={11} />
                    </a>
                  </div>
                  {p.title && <p className={`${styles.logTitle} truncate`}>{p.title}</p>}
                  {(p.error || p.httpStatus >= 400) && (
                    <p className={styles.logReason}>
                      {p.httpStatus ? `HTTP ${p.httpStatus}` : ''}
                      {p.httpStatus && p.error ? ' — ' : ''}
                      {p.error}
                    </p>
                  )}
                  <p className={styles.logMeta}>
                    Depth {p.depth ?? 0}
                    {p.discoveredVia && ` · via ${p.discoveredVia}`}
                    {p.attempts > 1 && ` · ${p.attempts} attempts`}
                    {p.canonicalUrl && p.canonicalUrl !== p.url && ` · canonical ${shortUrl(p.canonicalUrl)}`}
                    {p.crawledAt && ` · ${formatDateTime(p.crawledAt)}`}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Website sync history; selecting a job shows every URL it discovered, read, skipped or failed (with reasons). */
export default function CrawlLogsModal({ open, onClose }) {
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!open) setSelected(null);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={selected ? 'Crawl log' : 'Website sync history'}
      description={selected ? 'Every page this sync found, with its result.' : 'The last 20 syncs. Select one to see its crawl log.'}
      footer={
        selected ? (
          <button type="button" className="btn btn-secondary" onClick={() => setSelected(null)}>
            <ArrowLeft size={15} /> All syncs
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        )
      }
    >
      {open && (selected ? <JobDetail job={selected} /> : <JobList onOpen={setSelected} />)}
    </Modal>
  );
}
