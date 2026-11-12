import { useEffect, useState } from 'react';
import { Database, ExternalLink, Eye, Pencil, Power, PowerOff, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import Modal, { ConfirmDialog } from '../shared/Modal.jsx';
import { EmptyState, ErrorState, FilterTabs, Pagination, SearchInput, Skeleton } from '../shared/ui.jsx';
import { useToast } from '../shared/Toast.jsx';
import KnowledgeRecordDrawer from './KnowledgeRecordDrawer.jsx';
import { ACTIVE_FILTERS, RecordBadges, TYPE_FILTERS, TYPE_LABELS } from './recordMeta.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import {
  deleteKnowledge,
  listKnowledgeRecords,
  recrawlKnowledge,
  reprocessKnowledge,
  retryFailedEmbeddings,
  setKnowledgeStatus,
  updateKnowledge,
} from '../../services/knowledgeService.js';
import { formatRelative } from '../../utils/date.js';
import { shortUrl } from './crawlMeta.js';
import styles from './knowledge.module.css';

const PAGE_SIZE = 20;

function RowSkeleton() {
  return (
    <ul className={styles.recList}>
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className={styles.recRow}>
          <div className={styles.recMain}>
            <Skeleton width="45%" height={13} />
            <Skeleton width="70%" height={11} style={{ marginTop: 8 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Knowledge Records: every record the AI can use (website pages, business information,
 * manual knowledge, documents, FAQs) with search, filters, pagination and per-record actions.
 */
export default function KnowledgeRecords({ refreshKey, onChanged, onCrawlStarted, crawlRunning }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [active, setActive] = useState('all');
  const [failedOnly, setFailedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState(null); // { id, title, mode }
  const [deleting, setDeleting] = useState(null);
  const [recrawling, setRecrawling] = useState(null);
  const [busy, setBusy] = useState(null); // `${action}:${id}`
  const [retrying, setRetrying] = useState(false);
  const q = useDebouncedValue(search.trim(), 300);

  useEffect(() => {
    setPage(1);
  }, [q, type, active, failedOnly]);

  const list = useAsync(
    () => listKnowledgeRecords({ type: type || undefined, status: active, embedding: failedOnly ? 'failed' : undefined, search: q, page, pageSize: PAGE_SIZE }),
    [q, type, active, failedOnly, page, refreshKey],
  );
  const items = list.data?.items;
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (list.data?.pageSize || PAGE_SIZE)));
  const failedEmbeddings = list.data?.status?.failed_embeddings || 0;
  const hasFilters = Boolean(q || type || active !== 'all' || failedOnly);

  const afterChange = () => {
    list.reload();
    onChanged?.();
  };

  const run = async (key, fn) => {
    setBusy(key);
    try {
      return await fn();
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = (r) =>
    run(`status:${r.id}`, async () => {
      const next = r.sourceStatus === 'inactive' ? 'active' : 'inactive';
      try {
        await setKnowledgeStatus(r.id, next);
        toast.success(next === 'active' ? 'Knowledge activated' : 'Knowledge deactivated', next === 'active' ? `The AI will use “${r.title}” again.` : `The AI no longer uses “${r.title}”.`);
        afterChange();
      } catch (err) {
        toast.error(next === 'active' ? "Couldn't activate" : "Couldn't deactivate", err.message);
      }
    });

  const reprocess = (r) =>
    run(`reprocess:${r.id}`, async () => {
      try {
        const result = await reprocessKnowledge(r.id);
        if (result?.embeddingStatus && result.embeddingStatus !== 'complete') {
          toast.error('Embeddings not complete', `Status: ${String(result.embeddingStatus).replace(/_/g, ' ')}. The text is still keyword-searchable.`);
        } else {
          toast.success('Embeddings regenerated', r.title);
        }
        afterChange();
      } catch (err) {
        toast.error("Couldn't regenerate embeddings", err.message);
      }
    });

  const startRecrawl = (r, discardEdits) =>
    run(`recrawl:${r.id}`, async () => {
      try {
        await recrawlKnowledge(r.id, { discardEdits });
        toast.info('Page re-crawl started', discardEdits ? 'Your edits were discarded — the website text will be used.' : shortUrl(r.url));
        setRecrawling(null);
        onCrawlStarted?.();
      } catch (err) {
        toast.error("Couldn't start the re-crawl", err.message);
      }
    });

  const requestRecrawl = (r) => {
    if (r.adminEdited) setRecrawling(r);
    else startRecrawl(r, false);
  };

  const confirmDelete = () =>
    run(`delete:${deleting.id}`, async () => {
      try {
        await deleteKnowledge(deleting.id);
        toast.success(deleting.type === 'business_information' ? 'Section cleared' : 'Knowledge deleted', deleting.title);
        if (drawer?.id === deleting.id) setDrawer(null);
        setDeleting(null);
        if (items?.length === 1 && page > 1) setPage((p) => p - 1);
        afterChange();
      } catch (err) {
        toast.error("Couldn't delete", err.message);
      }
    });

  const retryAll = async () => {
    setRetrying(true);
    try {
      const r = await retryFailedEmbeddings();
      if (!r.sources) toast.info('Nothing needed re-processing');
      else if (r.stillFailing) toast.error(`${r.stillFailing} record(s) still failing`, `Re-processed ${r.sources} record(s), ${r.embedded} chunk(s) embedded. Check that the AI key is configured.`);
      else toast.success('Embeddings fixed', `Re-processed ${r.sources} record(s), ${r.embedded} chunk(s) embedded.`);
      afterChange();
    } catch (err) {
      toast.error("Couldn't retry embeddings", err.message);
    } finally {
      setRetrying(false);
    }
  };

  const saveRecord = async (record, patch) => {
    if (!Object.keys(patch).length) return record;
    const updated = await updateKnowledge(record.id, patch);
    toast.success('Changes saved', record.type === 'website' && patch.content !== undefined ? 'Marked as admin-edited — syncs will keep your version.' : updated.title);
    afterChange();
    return updated;
  };

  const isBusy = (action, id) => busy === `${action}:${id}`;

  const deleteText = deleting
    ? deleting.type === 'business_information'
      ? `The content of “${deleting.title}” will be cleared. The section itself stays so you can fill it in again later.`
      : deleting.type === 'faq'
        ? `The FAQ “${deleting.title}” will be permanently deleted.`
        : deleting.type === 'website'
          ? `“${deleting.title}” will be deleted from the knowledge base. A later website sync may add it again while it is still on your website — deactivate it instead to keep it out.`
          : `“${deleting.title}” will be permanently deleted. Your AI consultant will stop using it.`
    : '';

  return (
    <div className="card">
      <div className={styles.recHead}>
        <div className={styles.recTools}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search title, URL or content…" label="Search knowledge records" />
          <label className={styles.recSelect} htmlFor="kb-rec-type">
            <span className="sr-only">Type</span>
            <select id="kb-rec-type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPE_FILTERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.recTools}>
          <FilterTabs options={ACTIVE_FILTERS} value={active} onChange={setActive} label="Filter by active status" />
          <label className={styles.recCheck}>
            <input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} />
            Embedding failed only
          </label>
          {failedEmbeddings > 0 && (
            <button type="button" className="btn btn-gold btn-sm" onClick={retryAll} disabled={retrying}>
              <Sparkles size={14} /> {retrying ? 'Retrying…' : `Retry failed embeddings (${failedEmbeddings})`}
            </button>
          )}
        </div>
      </div>

      {list.loading && !list.data ? (
        <RowSkeleton />
      ) : list.error && !list.data ? (
        <ErrorState compact title="Couldn't load knowledge records" error={list.error} onRetry={list.reload} />
      ) : !items?.length ? (
        <EmptyState
          compact
          icon={Database}
          title={hasFilters ? 'No matching records' : 'No knowledge records yet'}
          description={hasFilters ? 'Try a different search or filter.' : 'Sync your website or add knowledge to get started.'}
        />
      ) : (
        <div style={{ opacity: list.loading ? 0.6 : 1, transition: 'opacity 0.2s' }} aria-busy={list.loading || undefined}>
          <div className={styles.recHeaderRow} aria-hidden="true">
            <span>Record</span>
            <span>Category</span>
            <span>Embedded</span>
            <span>Updated</span>
            <span />
          </div>
          <ul className={styles.recList}>
            {items.map((r) => {
              const inactive = r.sourceStatus === 'inactive';
              const chunkTotal = r.chunkCount ?? 0;
              const embedded = r.embeddedCount ?? 0;
              return (
                <li key={r.id} className={`${styles.recRow} ${inactive ? styles.recInactive : ''}`}>
                  <div className={styles.recMain}>
                    <button type="button" className={`${styles.recTitle} truncate`} onClick={() => setDrawer({ id: r.id, title: r.title, mode: 'view' })}>
                      {r.title || 'Untitled'}
                    </button>
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className={`${styles.pageUrl} ${styles.recUrl} truncate`} title={r.url}>
                        {shortUrl(r.url)} <ExternalLink size={11} />
                      </a>
                    )}
                    <div className={styles.recBadges}>
                      <RecordBadges record={r} />
                    </div>
                  </div>
                  <span className={styles.recCell} data-label="Category">
                    {r.category || <span className="muted">{TYPE_LABELS[r.type] || '—'}</span>}
                  </span>
                  <span className={styles.recCell} data-label="Embedded">
                    <span className={embedded < chunkTotal ? styles.recWarn : ''}>
                      {embedded} / {chunkTotal}
                    </span>
                  </span>
                  <span className={`${styles.recCell} muted`} data-label="Updated">
                    {formatRelative(r.updatedAt) || '—'}
                  </span>
                  <div className={styles.recActions}>
                    <button type="button" className="icon-btn" onClick={() => setDrawer({ id: r.id, title: r.title, mode: 'view' })} aria-label={`View ${r.title}`} title="View">
                      <Eye size={16} />
                    </button>
                    {r.type !== 'faq' && (
                      <button type="button" className="icon-btn" onClick={() => setDrawer({ id: r.id, title: r.title, mode: 'edit' })} aria-label={`Edit ${r.title}`} title="Edit">
                        <Pencil size={15} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => toggleActive(r)}
                      disabled={isBusy('status', r.id)}
                      aria-label={inactive ? `Activate ${r.title}` : `Deactivate ${r.title}`}
                      title={inactive ? 'Activate' : 'Deactivate'}
                    >
                      {inactive ? <Power size={15} /> : <PowerOff size={15} />}
                    </button>
                    {r.type === 'website' && r.url && (
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => requestRecrawl(r)}
                        disabled={isBusy('recrawl', r.id) || crawlRunning}
                        aria-label={`Re-crawl ${r.title}`}
                        title={crawlRunning ? 'A website sync is running' : 'Re-crawl page'}
                      >
                        <RefreshCw size={15} className={isBusy('recrawl', r.id) ? styles.spin : ''} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => reprocess(r)}
                      disabled={isBusy('reprocess', r.id) || inactive}
                      aria-label={`Regenerate embeddings for ${r.title}`}
                      title={inactive ? 'Activate first to regenerate embeddings' : 'Regenerate embeddings'}
                    >
                      <Sparkles size={15} className={isBusy('reprocess', r.id) ? styles.spin : ''} />
                    </button>
                    <button type="button" className="icon-btn danger" onClick={() => setDeleting(r)} aria-label={`Delete ${r.title}`} title={r.type === 'business_information' ? 'Clear section' : 'Delete'}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {list.error && list.data && (
        <p className="field-error" role="alert" style={{ padding: '10px 16px' }}>
          Couldn't refresh: {list.error.message}{' '}
          <button type="button" className="link" onClick={list.reload}>
            Try again
          </button>
        </p>
      )}
      <Pagination page={list.data?.page || page} pages={pages} total={list.data ? total : undefined} onChange={setPage} disabled={list.loading} label="Knowledge record pages" unit="records" />

      <KnowledgeRecordDrawer
        target={drawer}
        onClose={() => setDrawer(null)}
        onModeChange={(mode) => setDrawer((d) => (d ? { ...d, mode } : d))}
        onSave={saveRecord}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={deleting?.type === 'business_information' ? 'Clear this section?' : 'Delete this knowledge?'}
        description={deleteText}
        confirmLabel={deleting?.type === 'business_information' ? 'Clear section' : 'Delete'}
        busy={deleting ? isBusy('delete', deleting.id) : false}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />

      <Modal
        open={Boolean(recrawling)}
        onClose={() => setRecrawling(null)}
        size="sm"
        title="This page has your edits"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => startRecrawl(recrawling, false)} disabled={Boolean(busy)}>
              Keep my edits
            </button>
            <button type="button" className="btn btn-danger" onClick={() => startRecrawl(recrawling, true)} disabled={Boolean(busy)}>
              Discard edits
            </button>
          </>
        }
      >
        <p style={{ fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
          You edited “{recrawling?.title}”. Re-crawl and <b>keep your edits</b> (the website text is checked, but your version stays in use), or <b>discard your edits</b> and use the current
          website text instead.
        </p>
      </Modal>
    </div>
  );
}
