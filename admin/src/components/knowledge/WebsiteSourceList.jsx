import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, FileText, Globe, Loader2, Plus, Trash2 } from 'lucide-react';
import Modal, { ConfirmDialog } from '../shared/Modal.jsx';
import { EmptyState, Skeleton, StatusBadge } from '../shared/ui.jsx';
import { isValidUrl, normaliseUrl } from '../../utils/validation.js';
import { formatRelative } from '../../utils/date.js';
import styles from './knowledge.module.css';

const PAGE_STATUS = {
  indexed: { label: 'Indexed', tone: 'green' },
  indexing: { label: 'Reading…', tone: 'yellow' },
  not_configured: { label: 'Text only', tone: 'gray' },
  failed: { label: 'Needs re-index', tone: 'red' },
};

function AddUrlModal({ open, onClose, onAdd, allowedHosts }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setUrl('');
    setError('');
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return setError('Please enter a web address.');
    if (!isValidUrl(url)) return setError("That doesn't look like a valid web address — e.g. https://seovirji.com/services/");
    const host = new URL(normaliseUrl(url)).hostname.toLowerCase();
    if (allowedHosts?.length && !allowedHosts.includes(host)) return setError(`Only pages on ${allowedHosts.filter((h) => !h.startsWith('www.')).join(', ')} can be added.`);
    setBusy(true);
    try {
      await onAdd(normaliseUrl(url));
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add Website URL"
      description="Your AI consultant will read this page and use it to answer visitor questions."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={close}>
            Cancel
          </button>
          <button type="submit" form="add-url-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Adding…' : 'Add page'}
          </button>
        </>
      }
    >
      <form id="add-url-form" onSubmit={submit} noValidate className="field">
        <label className="field-label" htmlFor="kb-url">
          Page address
        </label>
        <input
          id="kb-url"
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://seovirji.com/services/"
          value={url}
          aria-invalid={Boolean(error)}
          aria-describedby="kb-url-help"
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError('');
          }}
        />
        {error ? (
          <p id="kb-url-help" className="field-error">
            {error}
          </p>
        ) : (
          <p id="kb-url-help" className="field-hint">
            Pages from your own website only. Tip: add important pages that aren't linked from the menu.
          </p>
        )}
      </form>
    </Modal>
  );
}

/** Website pages in the knowledge base (from the crawler). */
export default function WebsiteSourceList({ primaryUrl, pages, loading, pendingUrl, allowedHosts, onAdd, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const confirmRemove = async () => {
    setBusy(true);
    try {
      await onRemove(removing);
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className={styles.siteHead}>
        <span className={styles.siteIcon}>
          <Globe size={20} />
        </span>
        <div className={styles.siteMeta}>
          <span className={styles.siteLabel}>Website URL</span>
          {loading ? (
            <Skeleton width={180} height={16} />
          ) : (
            <a href={primaryUrl} target="_blank" rel="noopener noreferrer" className={styles.siteUrl}>
              {primaryUrl} <ExternalLink size={13} />
            </a>
          )}
        </div>
        <button type="button" className="btn btn-gold" onClick={() => setAdding(true)}>
          <Plus size={17} /> Add Website URL
        </button>
      </div>

      <div className={styles.pagesHead}>
        <span>Pages your AI has read</span>
        {!loading && <span>{pages.length}</span>}
      </div>

      {loading ? (
        <ul className={styles.pages}>
          {[0, 1, 2].map((i) => (
            <li key={i} className={styles.page}>
              <Skeleton width={34} height={34} radius={10} />
              <div style={{ flex: 1 }}>
                <Skeleton width="30%" height={12} />
                <Skeleton width="55%" height={11} style={{ marginTop: 8 }} />
              </div>
            </li>
          ))}
        </ul>
      ) : pages.length === 0 && !pendingUrl ? (
        <EmptyState compact icon={FileText} title="No pages yet" description="Run a website sync above, or add a page manually." />
      ) : (
        <ul className={styles.pages}>
          {pendingUrl && (
            <li className={styles.page}>
              <span className={styles.pageIcon}>
                <Loader2 size={16} className={styles.spin} />
              </span>
              <div className={styles.pageMain}>
                <p className={`${styles.pageTitle} truncate`}>Reading page…</p>
                <span className={`${styles.pageUrl} truncate`}>{pendingUrl.replace(/^https?:\/\//, '')}</span>
              </div>
              <StatusBadge tone="yellow">Reading…</StatusBadge>
            </li>
          )}
          <AnimatePresence initial={false}>
            {pages.map((page) => {
              const status = PAGE_STATUS[page.status] || PAGE_STATUS.indexed;
              return (
                <motion.li
                  key={page.id}
                  layout
                  className={styles.page}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  <span className={styles.pageIcon}>
                    <FileText size={16} />
                  </span>
                  <div className={styles.pageMain}>
                    <p className={`${styles.pageTitle} truncate`}>{page.title}</p>
                    <a href={page.url} target="_blank" rel="noopener noreferrer" className={`${styles.pageUrl} truncate`}>
                      {page.url.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                  <span className={styles.pageDate} title={`${page.chunkCount} chunks, ${page.embeddedCount} embedded`}>
                    {formatRelative(page.lastCrawledAt || page.updatedAt)}
                  </span>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  <button type="button" className="icon-btn danger" onClick={() => setRemoving(page)} aria-label={`Remove ${page.title}`} title="Remove">
                    <Trash2 size={16} />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <AddUrlModal open={adding} onClose={() => setAdding(false)} onAdd={onAdd} allowedHosts={allowedHosts} />
      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove this page?"
        description={`Your AI consultant will stop using “${removing?.title}” to answer questions. The next full website sync may add it back if it is still on your site.`}
        confirmLabel="Remove page"
        busy={busy}
        onConfirm={confirmRemove}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
