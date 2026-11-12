import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, CheckCircle2 } from 'lucide-react';
import { Skeleton, StatusBadge } from '../shared/ui.jsx';
import { MODE_LABELS, PHASE_LABELS, isActiveJob, jobStatusMeta } from '../knowledge/crawlMeta.js';
import { formatDateTime, formatRelative } from '../../utils/date.js';
import styles from './dashboard.module.css';

/** Knowledge base totals and the website crawl status for the Overview page. */
export default function KnowledgeCrawlCard({ knowledge, crawl, loading }) {
  const latest = crawl?.latest;
  const meta = latest ? jobStatusMeta(latest.status) : null;
  const running = isActiveJob(latest);
  const lastSync = crawl?.lastSuccessfulSyncAt || knowledge?.lastSuccessfulSyncAt;

  const stats = knowledge
    ? [
        { label: 'Website pages', value: knowledge.website_pages },
        { label: 'Sections & docs', value: knowledge.manual_sources },
        { label: 'FAQs', value: knowledge.faqs },
        { label: 'Chunks', value: knowledge.chunks },
        { label: 'Embedded', value: knowledge.embedded },
      ]
    : [];

  return (
    <section className={`card ${styles.panel}`}>
      <header className="card-head">
        <div>
          <h2 className="card-title">Knowledge &amp; Website Sync</h2>
          <p className="card-sub">What your AI consultant knows</p>
        </div>
        <Link to="/knowledge" className="link">
          Manage <ArrowRight size={14} />
        </Link>
      </header>

      <div className={styles.kcBody}>
        <div className={styles.kcGrid}>
          {loading
            ? [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={58} radius={12} />)
            : stats.map((s) => (
                <div key={s.label} className={styles.kcStat}>
                  <span className={styles.kcValue}>{(s.value ?? 0).toLocaleString()}</span>
                  <span className={styles.kcLabel}>{s.label}</span>
                </div>
              ))}
        </div>

        {!loading && knowledge && (knowledge.failed_embeddings > 0 || knowledge.inactive_sources > 0) && (
          <p className={styles.kcNote}>
            {knowledge.failed_embeddings > 0 && `${knowledge.failed_embeddings} record(s) with failed embeddings. `}
            {knowledge.inactive_sources > 0 && `${knowledge.inactive_sources} inactive record(s).`}
          </p>
        )}

        <dl className={styles.statusList} style={{ padding: 0 }}>
          <div className={styles.statusRow}>
            <dt>Website crawl</dt>
            <dd>
              {loading ? (
                <Skeleton width={90} height={14} />
              ) : meta ? (
                <>
                  <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                  <small>{running ? PHASE_LABELS[latest.phase] || 'Working' : MODE_LABELS[latest.mode] || 'Website sync'}</small>
                </>
              ) : (
                'Never run'
              )}
            </dd>
          </div>
          <div className={styles.statusRow}>
            <dt>
              <CheckCircle2 size={15} /> Last sync
            </dt>
            <dd>{loading ? <Skeleton width={90} height={14} /> : lastSync ? <span title={formatDateTime(lastSync)}>{formatRelative(lastSync)}</span> : 'Never'}</dd>
          </div>
          <div className={styles.statusRow}>
            <dt>
              <CalendarClock size={15} /> Next scheduled
            </dt>
            <dd>{loading ? <Skeleton width={90} height={14} /> : crawl?.nextScheduledAt ? formatDateTime(crawl.nextScheduledAt) : 'Automatic sync off'}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
