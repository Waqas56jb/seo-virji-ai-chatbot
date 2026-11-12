import { MessagesSquare } from 'lucide-react';
import { Avatar, EmptyState, Skeleton, StatusBadge } from '../shared/ui.jsx';
import { WhatsAppIcon } from '../shared/WhatsAppIcon.jsx';
import { conversationStatusMeta, handoffMeta } from '../../utils/constants.js';
import { formatRelative } from '../../utils/date.js';
import styles from './conversations.module.css';

export function firstVisitorMessage(conversation) {
  return conversation.preview || conversation.topic;
}

export default function ConversationList({ conversations, loading, selectedId, onSelect, hasFilters }) {
  if (loading && !conversations) {
    return (
      <ul className={styles.list}>
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className={styles.item}>
            <Skeleton width={38} height={38} radius={19} />
            <div style={{ flex: 1 }}>
              <Skeleton width="45%" height={12} />
              <Skeleton width="90%" height={11} style={{ marginTop: 9 }} />
              <Skeleton width="30%" height={18} style={{ marginTop: 10 }} radius={9} />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (!conversations?.length) {
    return (
      <EmptyState
        compact
        icon={MessagesSquare}
        title={hasFilters ? 'No matching conversations' : 'No conversations yet'}
        description={hasFilters ? 'Try a different search or filter.' : 'Conversations with your AI consultant will appear here.'}
      />
    );
  }

  return (
    <ul className={`${styles.list} ${loading ? styles.listLoading : ''}`} aria-label="Conversations">
      {conversations.map((c) => {
        const status = conversationStatusMeta(c.status);
        const handoff = handoffMeta(c.handoffStatus || (c.handoff ? 'link_generated' : null));
        const selected = c.id === selectedId;
        return (
          <li key={c.id}>
            <button
              type="button"
              className={`${styles.item} ${selected ? styles.itemSelected : ''}`}
              onClick={() => onSelect(c.id)}
              aria-current={selected ? 'true' : undefined}
            >
              <Avatar name={c.visitorName} size={38} />
              <div className={styles.itemMain}>
                <div className={styles.itemTop}>
                  <span className={`${styles.itemName} truncate`}>{c.visitorName || 'Anonymous visitor'}</span>
                  <span className={styles.itemDate}>{formatRelative(c.lastMessageAt)}</span>
                </div>
                <p className={styles.itemPreview}>{firstVisitorMessage(c)}</p>
                <div className={styles.itemBadges}>
                  <StatusBadge tone={c.leadId ? 'gold' : 'gray'} dot={false}>
                    {c.leadId ? 'Lead captured' : 'No lead yet'}
                  </StatusBadge>
                  {c.status === 'resolved' || !handoff ? (
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  ) : null}
                  {handoff && (
                    <span className={`${styles.waTag} ${c.handoffStatus === 'opened' ? '' : styles.waTagLink}`} title={handoff.label}>
                      <WhatsAppIcon size={13} /> {handoff.label}
                    </span>
                  )}
                  {c.reference && <span className={styles.refTag}>#{c.reference}</span>}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
