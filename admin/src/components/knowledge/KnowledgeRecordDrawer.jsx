import { useEffect, useState } from 'react';
import { Check, Clock3, ExternalLink, Pencil } from 'lucide-react';
import { Drawer } from '../shared/Modal.jsx';
import { ErrorState, Skeleton, StatusBadge } from '../shared/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { getKnowledge } from '../../services/knowledgeService.js';
import { formatDateTime } from '../../utils/date.js';
import { RecordBadges, TYPE_LABELS } from './recordMeta.jsx';
import styles from './knowledge.module.css';

const CONTENT_MAX = 50000;

function EditForm({ record, onCancel, onSave }) {
  const [title, setTitle] = useState(record.title || '');
  const [content, setContent] = useState(record.content || '');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const dirty = title.trim() !== (record.title || '') || content !== (record.content || '');

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (title.trim().length < 2) next.title = 'Please add a title (at least 2 characters).';
    if (title.trim().length > 200) next.title = 'Keep the title under 200 characters.';
    if (content.length > CONTENT_MAX) next.content = `Content is limited to ${CONTENT_MAX.toLocaleString()} characters.`;
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const patch = {};
      if (title.trim() !== (record.title || '')) patch.title = title.trim();
      if (content !== (record.content || '')) patch.content = content;
      await onSave(patch);
    } catch (err) {
      const fieldErrors = Object.fromEntries((err.details || []).map((d) => [String(d.field).split('.').pop(), d.message]));
      setErrors(Object.keys(fieldErrors).length ? fieldErrors : { content: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id="kb-record-form" onSubmit={submit} noValidate className={styles.recordForm}>
      {record.type === 'website' && (
        <div className={styles.tip}>
          <strong>Editing a website page</strong>
          Your version is kept by future website syncs. To go back to the website text, use “Re-crawl page” and choose to discard your edits.
        </div>
      )}
      <div className="field">
        <label className="field-label" htmlFor="kb-record-title">
          Title
        </label>
        <input id="kb-record-title" className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} aria-invalid={Boolean(errors.title)} />
        {errors.title && <p className="field-error">{errors.title}</p>}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="kb-record-content">
          Content
        </label>
        <textarea
          id="kb-record-content"
          className={`textarea ${styles.editor}`}
          value={content}
          maxLength={CONTENT_MAX}
          onChange={(e) => setContent(e.target.value)}
          aria-invalid={Boolean(errors.content)}
        />
        <div className={styles.editorMeta}>
          {errors.content ? <span className="field-error">{errors.content}</span> : <span className="field-hint">Saving re-chunks and re-embeds this record.</span>}
          <span className="field-hint">
            {content.length.toLocaleString()} / {CONTENT_MAX.toLocaleString()}
          </span>
        </div>
      </div>
      <div className={styles.recordFormActions}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!dirty || busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

/** View (full content + chunk list) or edit (title/content) one knowledge record. */
export default function KnowledgeRecordDrawer({ target, onClose, onModeChange, onSave }) {
  // Keep the last record visible while the drawer animates closed.
  const [current, setCurrent] = useState(target);
  useEffect(() => {
    if (target) setCurrent(target);
  }, [target]);

  const id = target?.id;
  const record = useAsync(async () => (id ? getKnowledge(id) : null), [id]);
  const data = record.data && record.data.id === current?.id ? record.data : null;
  const mode = current?.mode || 'view';
  const canEdit = data && data.type !== 'faq';

  const save = async (patch) => {
    const updated = await onSave(data, patch);
    if (updated) record.setData(updated);
    onModeChange('view');
  };

  return (
    <Drawer
      open={Boolean(target)}
      onClose={onClose}
      width={680}
      title={mode === 'edit' ? `Edit: ${data?.title || current?.title || ''}` : data?.title || current?.title || 'Knowledge record'}
      description={data ? `${TYPE_LABELS[data.type] || data.type}${data.category ? ` · ${data.category}` : ''} · version ${data.version ?? 1}` : undefined}
    >
      {record.loading && !data ? (
        <div className={styles.recordView}>
          <Skeleton width="40%" height={14} />
          <Skeleton width="100%" height={180} style={{ marginTop: 16 }} />
          <Skeleton width="100%" height={60} style={{ marginTop: 16 }} />
        </div>
      ) : record.error && !data ? (
        <ErrorState title="Couldn't load this record" error={record.error} onRetry={record.reload} />
      ) : data ? (
        mode === 'edit' && canEdit ? (
          <EditForm key={`${data.id}-${data.version}`} record={data} onCancel={() => onModeChange('view')} onSave={save} />
        ) : (
          <div className={styles.recordView}>
            <div className={styles.recordBadges}>
              <RecordBadges record={data} />
            </div>
            <dl className={styles.recordMeta}>
              {data.url && (
                <div>
                  <dt>Source</dt>
                  <dd>
                    <a href={data.url} target="_blank" rel="noopener noreferrer" className="link" style={{ overflowWrap: 'anywhere' }}>
                      {data.url} <ExternalLink size={12} />
                    </a>
                  </dd>
                </div>
              )}
              <div>
                <dt>Updated</dt>
                <dd>{formatDateTime(data.updatedAt) || '—'}</dd>
              </div>
              {data.lastCrawledAt && (
                <div>
                  <dt>Last crawled</dt>
                  <dd>{formatDateTime(data.lastCrawledAt)}</dd>
                </div>
              )}
              <div>
                <dt>Embeddings</dt>
                <dd>
                  {data.embeddedCount ?? 0} / {data.chunkCount ?? 0} chunks
                </dd>
              </div>
            </dl>

            {canEdit ? (
              <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onModeChange('edit')}>
                <Pencil size={14} /> Edit content
              </button>
            ) : (
              data.type === 'faq' && <p className="field-hint">FAQs are edited in the FAQs section below.</p>
            )}

            <section>
              <h3 className={styles.recordH}>Full content</h3>
              {data.content ? <pre className={styles.recordContent}>{data.content}</pre> : <p className="muted">This record has no content yet.</p>}
            </section>

            <section>
              <h3 className={styles.recordH}>
                Chunks <span className="muted">({data.chunks?.length || 0})</span>
              </h3>
              {data.chunks?.length ? (
                <ol className={styles.chunkList}>
                  {data.chunks.map((c) => (
                    <li key={c.id}>
                      <div className={styles.chunkTop}>
                        <span>#{c.index + 1}</span>
                        {c.tokens != null && <span className="muted">{c.tokens} tokens</span>}
                        {c.embedded ? (
                          <StatusBadge tone="green" dot={false}>
                            <Check size={12} /> Embedded
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="yellow" dot={false}>
                            <Clock3 size={12} /> Not embedded
                          </StatusBadge>
                        )}
                      </div>
                      <p className={styles.chunkText}>{c.preview}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted" style={{ fontSize: 13.5 }}>
                  No chunks yet{data.sourceStatus === 'inactive' ? ' — this record is inactive.' : '.'}
                </p>
              )}
            </section>
          </div>
        )
      ) : (
        <p className="muted">This record could not be found. It may have been deleted.</p>
      )}
    </Drawer>
  );
}
