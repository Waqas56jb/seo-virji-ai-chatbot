import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, CalendarDays, ClipboardList, Mail, MessagesSquare, NotebookPen, Phone, Save, Sparkles, Target, Trash2 } from 'lucide-react';
import { Drawer } from '../shared/Modal.jsx';
import { Avatar } from '../shared/ui.jsx';
import { WhatsAppButton, WhatsAppIcon } from '../shared/WhatsAppIcon.jsx';
import LeadStatusSelect from './LeadStatusSelect.jsx';
import { HandoffTag } from './LeadTable.jsx';
import { formatDateTime } from '../../utils/date.js';
import styles from './leads.module.css';

function Block({ icon: Icon, title, children }) {
  return (
    <section className={styles.block}>
      <h3 className={styles.blockTitle}>
        <Icon size={15} /> {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className={styles.dRow}>
      <dt>{label}</dt>
      <dd>{children || <span className="muted">Not shared</span>}</dd>
    </div>
  );
}

const NOTES_MAX = 4000;

/** Internal notes (never shown to the visitor). Saved with PATCH /api/leads/:id { notes }. */
function NotesEditor({ lead, onSave }) {
  const [value, setValue] = useState(lead.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Reset when a different lead opens or the saved notes change.
  useEffect(() => {
    setValue(lead.notes || '');
    setError('');
  }, [lead.id, lead.notes]);

  const dirty = value !== (lead.notes || '');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await onSave(lead, value.trim());
    } catch (err) {
      setError(err.message || "Couldn't save notes.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <label className="sr-only" htmlFor="lead-notes">
        Internal notes
      </label>
      <textarea
        id="lead-notes"
        className={`textarea ${styles.notes}`}
        value={value}
        maxLength={NOTES_MAX}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. Called on Monday — wants a local SEO proposal by Friday."
        aria-invalid={Boolean(error)}
      />
      {error && <p className="field-error">{error}</p>}
      <div className={styles.notesFoot}>
        <span className="field-hint">
          Only visible to your team · {value.length.toLocaleString()} / {NOTES_MAX.toLocaleString()}
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!dirty || busy}>
          <Save size={14} /> {busy ? 'Saving…' : 'Save notes'}
        </button>
      </div>
    </div>
  );
}

export default function LeadDetailPanel({ lead, onClose, onStatusChange, onSaveNotes, onDelete }) {
  // Keep content visible while the drawer animates out.
  const [shown, setShown] = useState(lead);
  useEffect(() => {
    if (lead) setShown(lead);
  }, [lead]);

  const l = lead || shown;

  return (
    <Drawer open={Boolean(lead)} onClose={onClose} title="Lead details" width={560}>
      {l && (
        <>
          <div className={styles.dHead}>
            <Avatar name={l.name} size={52} />
            <div className={styles.dWho}>
              <h3>{l.name}</h3>
              {l.businessName && <p>{l.businessName}</p>}
            </div>
            <LeadStatusSelect value={l.status} onChange={(status) => onStatusChange(l, status)} />
          </div>

          <div className={styles.dActions}>
            <WhatsAppButton lead={l} label="WhatsApp" />
            {l.email && (
              <a className="btn btn-secondary" href={`mailto:${l.email}`}>
                <Mail size={16} /> Email
              </a>
            )}
            {l.conversationId && (
              <Link className="btn btn-secondary" to={`/conversations/${l.conversationId}`}>
                <MessagesSquare size={16} /> Conversation
              </Link>
            )}
          </div>

          <Block icon={NotebookPen} title="Internal notes">
            <NotesEditor lead={l} onSave={onSaveNotes} />
          </Block>

          <Block icon={WhatsAppIcon} title="WhatsApp handoff">
            {l.handoffStatus ? (
              <>
                <HandoffTag status={l.handoffStatus} />
                <p className={styles.subtle}>
                  {l.handoffStatus === 'opened'
                    ? 'The visitor opened WhatsApp with a pre-filled message. Check your WhatsApp for their message.'
                    : 'A WhatsApp link was generated for the visitor. They may not have opened it yet.'}
                  {l.whatsappHandoffAt && ` (${formatDateTime(l.whatsappHandoffAt)})`}
                </p>
              </>
            ) : (
              <p className="muted" style={{ fontSize: 13.5 }}>
                No WhatsApp handoff yet.
              </p>
            )}
            {l.reference && (
              <p className={styles.subtle}>
                Chat reference <span className={styles.ref}>{l.reference}</span>
              </p>
            )}
          </Block>

          <Block icon={Sparkles} title="AI conversation summary">
            <p className={styles.summary}>{l.summary || 'A summary appears after a few messages of conversation.'}</p>
          </Block>

          <Block icon={Target} title="Main SEO challenges">
            {l.challenge ? <p className={styles.challengeBig}>{l.challenge}</p> : <p className="muted">Not shared yet.</p>}
            {l.seoSituation && <p className={styles.subtle}>SEO so far: {l.seoSituation}</p>}
          </Block>

          <Block icon={ClipboardList} title="Collected requirements">
            {l.requirements?.length ? (
              <ul className={styles.reqs}>
                {l.requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">No specific requirements yet.</p>
            )}
            {l.goal && (
              <p className={styles.subtle}>
                <b>Goal:</b> {l.goal}
              </p>
            )}
          </Block>

          <Block icon={Phone} title="Contact information">
            <dl>
              <Row label="Email">{l.email && <a className="link" href={`mailto:${l.email}`}>{l.email}</a>}</Row>
              <Row label="Phone">{l.phone}</Row>
              <Row label="Prefers">{l.contactMethod}</Row>
            </dl>
          </Block>

          <Block icon={Briefcase} title="Business information">
            <dl>
              <Row label="Business">{l.businessName}</Row>
              <Row label="Website">
                {l.website && (
                  <a className="link" href={/^https?:/.test(l.website) ? l.website : `https://${l.website}`} target="_blank" rel="noopener noreferrer">
                    {l.website}
                  </a>
                )}
              </Row>
              <Row label="Industry">{l.industry}</Row>
              <Row label="Budget">{l.budget}</Row>
            </dl>
          </Block>

          <Block icon={CalendarDays} title="Date created">
            <p className={styles.subtle} style={{ marginTop: 0 }}>
              {formatDateTime(l.createdAt)}
            </p>
          </Block>

          <Block icon={Trash2} title="Delete lead">
            <div className={styles.dangerZone}>
              <p>Permanently removes this lead and its notes. The conversation itself is kept.</p>
              <button type="button" className="btn btn-secondary btn-sm" style={{ color: 'var(--red)' }} onClick={() => onDelete(l)}>
                <Trash2 size={14} /> Delete lead
              </button>
            </div>
          </Block>
        </>
      )}
    </Drawer>
  );
}
