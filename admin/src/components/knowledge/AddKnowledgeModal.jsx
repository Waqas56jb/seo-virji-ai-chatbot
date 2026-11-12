import { useEffect, useState } from 'react';
import Modal from '../shared/Modal.jsx';

/** Create a manual, owner-approved knowledge document (e.g. a case study or package details). */
export default function AddKnowledgeModal({ open, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setContent('');
      setErrors({});
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (title.trim().length < 2) next.title = 'Please add a short title.';
    if (content.trim().length < 10) next.content = 'Please write at least a sentence or two.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await onSave({ title: title.trim(), content: content.trim() });
    } catch (err) {
      setErrors({ content: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Add knowledge"
      description="Approved information your AI consultant can rely on — it takes priority over website text."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="kb-add-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Add knowledge'}
          </button>
        </>
      }
    >
      <form id="kb-add-form" onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="field">
          <label className="field-label" htmlFor="kb-title">
            Title
          </label>
          <input id="kb-title" className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Local SEO package details" aria-invalid={Boolean(errors.title)} />
          {errors.title && <p className="field-error">{errors.title}</p>}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="kb-content">
            Content
          </label>
          <textarea id="kb-content" className="textarea" rows={9} value={content} maxLength={50000} onChange={(e) => setContent(e.target.value)} placeholder="Write it the way you'd explain it to a customer…" aria-invalid={Boolean(errors.content)} />
          {errors.content ? <p className="field-error">{errors.content}</p> : <p className="field-hint">Start lines with “- ” for lists. Only include facts you're happy for the AI to share.</p>}
        </div>
      </form>
    </Modal>
  );
}
