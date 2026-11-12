import { ExternalLink, Trash2, UsersRound } from 'lucide-react';
import { Avatar, EmptyState, Skeleton } from '../shared/ui.jsx';
import { WhatsAppButton, WhatsAppIcon } from '../shared/WhatsAppIcon.jsx';
import LeadStatusSelect from './LeadStatusSelect.jsx';
import { handoffMeta } from '../../utils/constants.js';
import { formatDate } from '../../utils/date.js';
import styles from './leads.module.css';

function Contact({ lead }) {
  return (
    <div className={styles.contact}>
      {lead.email && <span className="truncate">{lead.email}</span>}
      {lead.phone && <span className="truncate">{lead.phone}</span>}
      {!lead.email && !lead.phone && <span className="muted">Not shared</span>}
    </div>
  );
}

function Website({ url }) {
  if (!url) return <span className="muted">—</span>;
  return (
    <a href={/^https?:/.test(url) ? url : `https://${url}`} target="_blank" rel="noopener noreferrer" className={styles.website} onClick={(e) => e.stopPropagation()}>
      <span className="truncate">{url}</span>
      <ExternalLink size={12} />
    </a>
  );
}

/** "WhatsApp link generated" / "WhatsApp opened" — we never know if a message was sent. */
export function HandoffTag({ status }) {
  const meta = handoffMeta(status);
  if (!meta) return null;
  return (
    <span className={`${styles.handoffTag} ${status === 'opened' ? '' : styles.handoffTagLink}`}>
      <WhatsAppIcon size={13} /> {meta.label}
    </span>
  );
}

export default function LeadTable({ leads, loading, onOpen, onStatusChange, onDelete, hasFilters }) {
  if (loading && !leads) {
    return (
      <div className={styles.skeletonList}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.skeletonRow}>
            <Skeleton width={36} height={36} radius={18} />
            <Skeleton width="18%" height={13} />
            <Skeleton width="22%" height={13} />
            <Skeleton width="30%" height={13} />
          </div>
        ))}
      </div>
    );
  }

  if (!leads?.length) {
    return (
      <EmptyState
        icon={UsersRound}
        title={hasFilters ? 'No matching leads' : 'No leads yet'}
        description={hasFilters ? 'Try a different search, status, WhatsApp filter or date range.' : 'Potential clients qualified by your AI consultant will appear here.'}
      />
    );
  }

  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }} aria-busy={loading || undefined}>
      {/* Desktop & tablet: table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Lead</th>
              <th scope="col">Main challenge</th>
              <th scope="col">Contact</th>
              <th scope="col">Status</th>
              <th scope="col">Date</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                key={lead.id}
                onClick={() => onOpen(lead.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(lead.id);
                }}
                tabIndex={0}
                aria-label={`Open details for ${lead.name}`}
              >
                <td>
                  <div className={styles.person}>
                    <Avatar name={lead.name} />
                    <div className={styles.personText}>
                      <span className={`${styles.personName} truncate`}>{lead.name}</span>
                      {lead.businessName && <span className={`${styles.personBiz} truncate`}>{lead.businessName}</span>}
                      {lead.website && <Website url={lead.website} />}
                    </div>
                  </div>
                </td>
                <td className={styles.colChallenge}>
                  <span className={styles.challenge}>{lead.challenge || <span className="muted">Not shared yet</span>}</span>
                </td>
                <td className={styles.colContact}>
                  <Contact lead={lead} />
                </td>
                <td>
                  <LeadStatusSelect value={lead.status} size="sm" onChange={(status) => onStatusChange(lead, status)} label={`Status for ${lead.name}`} />
                  <div>
                    <HandoffTag status={lead.handoffStatus} />
                  </div>
                </td>
                <td className={styles.colDate}>{formatDate(lead.createdAt)}</td>
                <td className={styles.colActions}>
                  <div className={styles.rowActions}>
                    <WhatsAppButton lead={lead} iconOnly />
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(lead);
                      }}
                      aria-label={`Delete lead ${lead.name}`}
                      title="Delete lead"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: cards */}
      <ul className={styles.cards}>
        {leads.map((lead) => (
          <li key={lead.id} className={styles.card}>
            <button type="button" className={styles.cardOpen} onClick={() => onOpen(lead.id)} aria-label={`Open details for ${lead.name}`} />
            <div className={styles.person}>
              <Avatar name={lead.name} />
              <div className={styles.personText}>
                <span className={`${styles.personName} truncate`}>{lead.name}</span>
                {lead.businessName && <span className={`${styles.personBiz} truncate`}>{lead.businessName}</span>}
              </div>
              <span className={styles.cardDate}>{formatDate(lead.createdAt)}</span>
            </div>
            {lead.challenge && <p className={styles.cardChallenge}>{lead.challenge}</p>}
            <div className={styles.cardMeta}>
              {lead.website && <Website url={lead.website} />}
              <Contact lead={lead} />
              <HandoffTag status={lead.handoffStatus} />
            </div>
            <div className={styles.cardFoot}>
              <LeadStatusSelect value={lead.status} size="sm" onChange={(status) => onStatusChange(lead, status)} label={`Status for ${lead.name}`} />
              <div className={styles.rowActions}>
                <WhatsAppButton lead={lead} size="sm" label="WhatsApp" />
                <button type="button" className="icon-btn danger" onClick={() => onDelete(lead)} aria-label={`Delete lead ${lead.name}`} title="Delete lead">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
