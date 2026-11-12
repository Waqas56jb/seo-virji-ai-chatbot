import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, CalendarClock, CheckCircle2, ExternalLink, Link2, MessageSquareText, RotateCcw, Sparkles, Target, Trash2 } from 'lucide-react';
import { Avatar, EmptyState, ErrorState, Skeleton, StatusBadge } from '../shared/ui.jsx';
import { WhatsAppButton, WhatsAppIcon } from '../shared/WhatsAppIcon.jsx';
import { conversationStatusMeta, handoffMeta, leadStatusMeta } from '../../utils/constants.js';
import { formatDateTime } from '../../utils/date.js';
import styles from './conversations.module.css';

const plain = (text = '') => text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(\S.*?)\*/g, '$1');

const safeUrl = (url) => (url && /^https?:\/\//i.test(url) ? url : null);

function DetailRow({ label, children }) {
  if (!children) return null;
  return (
    <div className={styles.detailRow}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Knowledge the AI used for an answer — small links under the message. */
function Sources({ sources }) {
  if (!sources?.length) return null;
  return (
    <div className={styles.sources}>
      <span className={styles.sourcesLabel}>Sources</span>
      <ul>
        {sources.map((s, i) => {
          const url = safeUrl(s.url);
          const label = s.title || s.url || 'Knowledge base';
          return (
            <li key={`${s.url || s.title}-${i}`}>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" className={styles.sourceLink} title={url}>
                  <Link2 size={11} /> <span className="truncate">{label}</span>
                </a>
              ) : (
                <span className={styles.sourceLink}>
                  <Link2 size={11} /> <span className="truncate">{label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HandoffRecords({ conversation, lead }) {
  const records = conversation.handoffs || [];
  return (
    <section className={styles.detailBlock}>
      <h3 className={styles.detailTitle}>
        <WhatsAppIcon size={14} /> WhatsApp handoff
      </h3>
      {records.length ? (
        <ul className={styles.handoffList}>
          {records.map((h) => {
            const meta = handoffMeta(h.status) || handoffMeta('link_generated');
            return (
              <li key={h.id}>
                <div className={styles.handoffTop}>
                  <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                  <time className="muted">{formatDateTime(h.createdAt)}</time>
                </div>
                {h.number && <p className={styles.handoffNumber}>To +{String(h.number).replace(/^\+/, '')}</p>}
                {h.message && (
                  <details className={styles.handoffMsg}>
                    <summary>Pre-filled message</summary>
                    <p>{h.message}</p>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.handoffState}>
          <StatusBadge tone="gray">No handoff yet</StatusBadge>
        </p>
      )}
      <p className={styles.waHint}>We can only see that a WhatsApp link was generated or opened — not whether a message was sent.</p>
      <div style={{ marginTop: 12 }}>
        <WhatsAppButton lead={lead || { name: conversation.visitorName, challenge: conversation.topic }} block />
      </div>
      {!lead?.phone && <p className={styles.waHint}>WhatsApp follow-up needs the visitor's phone number.</p>}
    </section>
  );
}

function Details({ conversation, lead }) {
  const status = conversationStatusMeta(conversation.status);
  const lStatus = lead ? leadStatusMeta(lead.status) : null;
  const sourcePage = safeUrl(conversation.sourcePage);
  return (
    <div className={styles.details}>
      <section className={styles.detailBlock}>
        <h3 className={styles.detailTitle}>Visitor</h3>
        <dl>
          <DetailRow label="Name">{conversation.visitorName || 'Anonymous visitor'}</DetailRow>
          <DetailRow label="Reference">{conversation.reference && <span className={styles.refCode}>{conversation.reference}</span>}</DetailRow>
          <DetailRow label="Started">{formatDateTime(conversation.startedAt)}</DetailRow>
          <DetailRow label="Last message">{formatDateTime(conversation.lastMessageAt)}</DetailRow>
          <DetailRow label="Messages">{String(conversation.messages.length)}</DetailRow>
          <DetailRow label="Status">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </DetailRow>
          {conversation.resolvedAt && <DetailRow label="Resolved">{formatDateTime(conversation.resolvedAt)}</DetailRow>}
          <DetailRow label="Started on">
            {sourcePage && (
              <a href={sourcePage} target="_blank" rel="noopener noreferrer" className="link" title={sourcePage}>
                {sourcePage.replace(/^https?:\/\//, '').replace(/\/$/, '') || sourcePage} <ExternalLink size={12} />
              </a>
            )}
          </DetailRow>
        </dl>
      </section>

      {conversation.summary && (
        <section className={styles.detailBlock}>
          <h3 className={styles.detailTitle}>
            <Sparkles size={14} /> AI conversation summary
          </h3>
          <p className={styles.summaryText}>{conversation.summary}</p>
        </section>
      )}

      <section className={`${styles.detailBlock} ${styles.challenge}`}>
        <h3 className={styles.detailTitle}>
          <Target size={14} /> Main business challenge
        </h3>
        <p>{lead?.challenge || conversation.topic}</p>
        {conversation.requirements?.length > 0 && (
          <ul className={styles.reqs}>
            {conversation.requirements.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.detailBlock}>
        <h3 className={styles.detailTitle}>
          <Sparkles size={14} /> Collected lead details
        </h3>
        {lead ? (
          <>
            <dl>
              <DetailRow label="Business">{lead.businessName}</DetailRow>
              <DetailRow label="Website">
                {lead.website && (
                  <a href={/^https?:/.test(lead.website) ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="link">
                    {lead.website}
                  </a>
                )}
              </DetailRow>
              <DetailRow label="Industry">{lead.industry}</DetailRow>
              <DetailRow label="Goal">{lead.goal}</DetailRow>
              <DetailRow label="Budget">{lead.budget}</DetailRow>
              <DetailRow label="Email">{lead.email}</DetailRow>
              <DetailRow label="Phone">{lead.phone}</DetailRow>
              <DetailRow label="Lead status">
                <StatusBadge tone={lStatus.tone}>{lStatus.label}</StatusBadge>
              </DetailRow>
            </dl>
            <Link to={`/leads/${lead.id}`} className={`link ${styles.viewLead}`}>
              View lead <ArrowUpRight size={14} />
            </Link>
          </>
        ) : (
          <p className="muted" style={{ fontSize: 13.5 }}>
            The visitor hasn't shared business details yet.
          </p>
        )}
      </section>

      <HandoffRecords conversation={conversation} lead={lead} />
    </div>
  );
}

export default function ConversationViewer({ data, loading, error, onRetry, onBack, showBack, onToggleResolved, onDelete, statusBusy }) {
  const [tab, setTab] = useState('chat');
  const scrollRef = useRef(null);
  const conversation = data?.conversation;

  useEffect(() => {
    setTab('chat');
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [conversation?.id]);

  if (loading && !conversation) {
    return (
      <div className={styles.viewer}>
        <div className={styles.viewerHead}>
          <Skeleton width={42} height={42} radius={21} />
          <div style={{ flex: 1 }}>
            <Skeleton width="30%" height={14} />
            <Skeleton width="20%" height={11} style={{ marginTop: 8 }} />
          </div>
        </div>
        <div className={styles.thread}>
          {[60, 45, 70, 40].map((w, i) => (
            <Skeleton key={i} width={`${w}%`} height={54} radius={16} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start' }} />
          ))}
        </div>
      </div>
    );
  }

  if (error && !conversation) {
    return (
      <div className={styles.viewer}>
        {showBack && (
          <div className={styles.viewerHead}>
            <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to conversations">
              <ArrowLeft size={19} />
            </button>
          </div>
        )}
        <ErrorState title="Couldn't load this conversation" error={error} onRetry={onRetry} />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className={styles.viewer}>
        <EmptyState icon={MessageSquareText} title="Select a conversation" description="Choose a conversation from the list to read the full chat." />
      </div>
    );
  }

  const status = conversationStatusMeta(conversation.status);
  const resolved = conversation.resolved || conversation.status === 'resolved';
  const visitor = conversation.visitorName || 'Visitor';

  return (
    <div className={styles.viewer} data-tab={tab}>
      <header className={styles.viewerHead}>
        {showBack && (
          <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to conversations">
            <ArrowLeft size={19} />
          </button>
        )}
        <Avatar name={conversation.visitorName} size={42} />
        <div className={styles.viewerWho}>
          <h2 className="truncate">{conversation.visitorName || 'Anonymous visitor'}</h2>
          <p>
            <CalendarClock size={13} /> {formatDateTime(conversation.startedAt)}
            {conversation.reference && (
              <>
                {' · '}
                <span className={styles.refCode} title="Chat reference (included in WhatsApp handoff messages)">
                  #{conversation.reference}
                </span>
              </>
            )}
          </p>
        </div>
        <span className={styles.headBadge}>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </span>
        <div className={styles.headActions}>
          <button
            type="button"
            className={`btn btn-sm ${resolved ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => onToggleResolved(conversation)}
            disabled={statusBusy}
          >
            {resolved ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
            <span className={styles.headActionLabel}>{statusBusy ? 'Saving…' : resolved ? 'Reopen' : 'Mark resolved'}</span>
          </button>
          <button type="button" className="icon-btn danger" onClick={() => onDelete(conversation)} aria-label="Delete conversation" title="Delete conversation">
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      <div className={styles.viewerTabs} role="tablist" aria-label="Conversation view">
        <button type="button" role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>
          Conversation
        </button>
        <button type="button" role="tab" aria-selected={tab === 'details'} onClick={() => setTab('details')}>
          Visitor details
        </button>
      </div>

      <div className={styles.viewerBody}>
        <div className={styles.thread} ref={scrollRef} data-pane="chat" tabIndex={0} aria-label="Messages">
          <p className={styles.threadStart}>Conversation started · {formatDateTime(conversation.startedAt)}</p>
          {conversation.messages.map((m) => (
            <div key={m.id} className={`${styles.msg} ${m.role === 'user' ? styles.msgUser : styles.msgAi}`}>
              <span className={styles.msgWho}>{m.role === 'user' ? visitor : 'SEO Virji AI'}</span>
              <div className={styles.bubble}>{plain(m.content)}</div>
              {m.role !== 'user' && <Sources sources={m.sources} />}
              <time className={styles.msgTime} dateTime={m.createdAt}>
                {formatDateTime(m.createdAt)}
              </time>
            </div>
          ))}
          {(conversation.handoffs || []).map((h) => {
            const meta = handoffMeta(h.status) || handoffMeta('link_generated');
            return (
              <p key={h.id} className={`${styles.handoffMarker} ${h.status === 'opened' ? '' : styles.handoffMarkerLink}`}>
                <WhatsAppIcon size={14} /> {meta.label} · {formatDateTime(h.createdAt)}
              </p>
            );
          })}
          {resolved && <p className={styles.threadStart}>Marked as resolved{conversation.resolvedAt ? ` · ${formatDateTime(conversation.resolvedAt)}` : ''}</p>}
        </div>
        <aside className={styles.detailsPane} data-pane="details" aria-label="Visitor details">
          <Details conversation={conversation} lead={data.lead} />
        </aside>
      </div>
    </div>
  );
}
