import { useEffect, useState } from 'react';
import { BadgeDollarSign, Building2, CalendarCheck, Clock, Contact, Package, Pencil, ScrollText, Sparkles, Trash2, Wrench } from 'lucide-react';
import { Drawer } from '../shared/Modal.jsx';
import { Skeleton } from '../shared/ui.jsx';
import { formatRelative } from '../../utils/date.js';
import styles from './knowledge.module.css';

const ICONS = {
  about: Building2,
  services: Wrench,
  expertise: Sparkles,
  pricing: BadgeDollarSign,
  packages: Package,
  consultation: CalendarCheck,
  policies: ScrollText,
  contact: Contact,
  hours: Clock,
};

/** Fallback labels (the API normally provides title + description for each section). */
export const SECTION_LABELS = {
  about: { title: 'About the Business', description: 'Who you are and what makes you different.' },
  services: { title: 'Services', description: 'What you offer and who it is for.' },
  expertise: { title: 'Expertise', description: 'Industries, specialisms and experience.' },
  pricing: { title: 'Pricing Guidance', description: 'How pricing works — the AI never quotes exact prices.' },
  packages: { title: 'Packages', description: 'Packages or plans you offer and what each includes.' },
  consultation: { title: 'Consultation Details', description: 'How a strategy consultation works, who it is for and what happens next.' },
  policies: { title: 'Policies', description: 'Contracts, guarantees, refunds and other policies.' },
  contact: { title: 'Contact', description: 'How and where customers can reach you.' },
  hours: { title: 'Business Hours', description: 'When your team is available and typical response times.' },
};

const MAX = 4000;

export function KnowledgeCardSkeleton() {
  return (
    <div className={`card ${styles.kCard}`}>
      <Skeleton width={38} height={38} radius={11} />
      <Skeleton width="50%" height={14} style={{ marginTop: 14 }} />
      <Skeleton width="85%" height={12} style={{ marginTop: 8 }} />
      <Skeleton width="100%" height={40} style={{ marginTop: 14 }} />
    </div>
  );
}

/** One editable block of business information. */
export default function KnowledgeCard({ section, onEdit, onDelete }) {
  const Icon = ICONS[section.sectionKey] || ScrollText;
  return (
    <article className={`card ${styles.kCard}`}>
      <div className={styles.kTop}>
        <span className={styles.kIcon}>
          <Icon size={18} />
        </span>
        <span className={styles.kActions}>
          {onDelete && (
            <button type="button" className="icon-btn danger" onClick={() => onDelete(section)} aria-label={`Delete ${section.title}`} title="Delete">
              <Trash2 size={15} />
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(section)}>
            <Pencil size={14} /> Edit
          </button>
        </span>
      </div>
      <h3 className={styles.kTitle}>{section.title || SECTION_LABELS[section.sectionKey]?.title}</h3>
      <p className={styles.kDescription}>{section.description || SECTION_LABELS[section.sectionKey]?.description}</p>
      <p className={styles.kPreview}>{section.content || <em>Nothing added yet — the AI won't mention this topic until you do.</em>}</p>
      <p className={styles.kUpdated}>Updated {formatRelative(section.updatedAt)}</p>
    </article>
  );
}

/** Side panel editor for a business information section. */
export function SectionEditor({ section, onClose, onSave }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  // Keep showing the last section while the drawer animates closed.
  const [current, setCurrent] = useState(section);

  useEffect(() => {
    if (section) {
      setCurrent(section);
      setValue(section.content || '');
    }
  }, [section]);

  const dirty = current && value.trim() !== (current.content || '');

  const save = async () => {
    setBusy(true);
    try {
      await onSave(current.id, value.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={Boolean(section)}
      onClose={onClose}
      title={current ? `Edit: ${current.title}` : ''}
      description={current?.description}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="section-content">
          Content
        </label>
        <textarea
          id="section-content"
          className={`textarea ${styles.editor}`}
          value={value}
          maxLength={MAX}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Write this the way you'd explain it to a customer…"
        />
        <div className={styles.editorMeta}>
          <span className="field-hint">Write naturally — your AI consultant will rephrase it conversationally.</span>
          <span className="field-hint">
            {value.length.toLocaleString()} / {MAX.toLocaleString()}
          </span>
        </div>
      </div>
      <div className={styles.tip}>
        <strong>Good to know</strong>
        Start lines with “•” to create a list. Keep pricing guidance general — the AI never quotes exact prices.
      </div>
    </Drawer>
  );
}
