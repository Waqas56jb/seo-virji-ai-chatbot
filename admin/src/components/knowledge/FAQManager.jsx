import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, HelpCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import Modal, { ConfirmDialog } from '../shared/Modal.jsx';
import { EmptyState, Skeleton } from '../shared/ui.jsx';
import { useToast } from '../shared/Toast.jsx';
import { createFaq, deleteFaq, updateFaq } from '../../services/knowledgeService.js';
import styles from './knowledge.module.css';

function FaqForm({ faq, open, onClose, onSaved }) {
  const isEdit = Boolean(faq?.id);
  const [values, setValues] = useState({ question: '', answer: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  // Reset the form whenever it opens (for a new FAQ or a different one).
  useEffect(() => {
    if (!open) return;
    setValues({ question: faq?.question || '', answer: faq?.answer || '' });
    setErrors({});
  }, [open, faq]);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: null }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (values.question.trim().length < 5) next.question = 'Please write the question (at least 5 characters).';
    if (values.answer.trim().length < 5) next.answer = 'Please write an answer (at least 5 characters).';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    const payload = { question: values.question.trim(), answer: values.answer.trim() };
    try {
      const saved = isEdit ? await updateFaq(faq.id, payload) : await createFaq(payload);
      onSaved(saved, isEdit);
    } catch (err) {
      setErrors({ answer: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit FAQ' : 'Add New FAQ'}
      description="Short, clear answers work best."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="faq-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add FAQ'}
          </button>
        </>
      }
    >
      <form id="faq-form" onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="field">
          <label className="field-label" htmlFor="faq-q">
            Question
          </label>
          <input
            id="faq-q"
            className="input"
            value={values.question}
            onChange={set('question')}
            maxLength={200}
            placeholder="e.g. Do you work with small businesses?"
            aria-invalid={Boolean(errors.question)}
          />
          {errors.question && <p className="field-error">{errors.question}</p>}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="faq-a">
            Answer
          </label>
          <textarea
            id="faq-a"
            className="textarea"
            rows={5}
            value={values.answer}
            onChange={set('answer')}
            maxLength={1500}
            placeholder="Write the answer the way you'd say it to a customer."
            aria-invalid={Boolean(errors.answer)}
          />
          {errors.answer && <p className="field-error">{errors.answer}</p>}
        </div>
      </form>
    </Modal>
  );
}

export default function FAQManager({ faqs, loading, onChange, formOpen, onFormOpenChange }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const openNew = () => {
    setEditing(null);
    onFormOpenChange(true);
  };

  const handleSaved = (saved, isEdit) => {
    onChange((list) => (isEdit ? list.map((f) => (f.id === saved.id ? saved : f)) : [saved, ...list]));
    toast.success(isEdit ? 'FAQ updated' : 'FAQ added', saved.question);
    onFormOpenChange(false);
    setEditing(null);
    if (!isEdit) setExpanded(saved.id);
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await deleteFaq(removing.id);
      onChange((list) => list.filter((f) => f.id !== removing.id));
      toast.success('FAQ deleted');
    } catch (err) {
      toast.error("Couldn't delete FAQ", err.message);
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  return (
    <div className="card">
      {loading ? (
        <ul className={styles.faqs}>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className={styles.faq}>
              <div className={styles.faqRow}>
                <Skeleton width="60%" height={14} />
              </div>
            </li>
          ))}
        </ul>
      ) : faqs.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="No FAQs yet"
          description="Add the questions customers ask most often — your AI consultant will answer them confidently."
          action={
            <button type="button" className="btn btn-gold" onClick={openNew}>
              <Plus size={17} /> Add New FAQ
            </button>
          }
        />
      ) : (
        <ul className={styles.faqs}>
          <AnimatePresence initial={false}>
            {faqs.map((faq) => {
              const open = expanded === faq.id;
              return (
                <motion.li key={faq.id} layout className={`${styles.faq} ${open ? styles.faqOpen : ''}`} exit={{ opacity: 0, height: 0 }}>
                  <div className={styles.faqRow}>
                    <button type="button" className={styles.faqToggle} aria-expanded={open} onClick={() => setExpanded(open ? null : faq.id)}>
                      <span className={styles.faqQ}>Q</span>
                      <span className={styles.faqQuestion}>{faq.question}</span>
                      <ChevronDown size={17} className={styles.faqChevron} />
                    </button>
                    <div className={styles.faqActions}>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Edit: ${faq.question}`}
                        title="Edit"
                        onClick={() => {
                          setEditing(faq);
                          onFormOpenChange(true);
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button type="button" className="icon-btn danger" aria-label={`Delete: ${faq.question}`} title="Delete" onClick={() => setRemoving(faq)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        className={styles.faqAnswerWrap}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                      >
                        <p className={styles.faqAnswer}>{faq.answer}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <FaqForm
        faq={editing}
        open={formOpen}
        onClose={() => {
          onFormOpenChange(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        title="Delete this FAQ?"
        description={`“${removing?.question}” will be removed from your knowledge base.`}
        confirmLabel="Delete FAQ"
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => setRemoving(null)}
      />
    </div>
  );
}
