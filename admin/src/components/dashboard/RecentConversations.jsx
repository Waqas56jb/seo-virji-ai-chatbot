import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, MessagesSquare } from 'lucide-react';
import { Avatar, EmptyState, Skeleton, StatusBadge } from '../shared/ui.jsx';
import { conversationStatusMeta } from '../../utils/constants.js';
import { formatRelative } from '../../utils/date.js';
import styles from './dashboard.module.css';

export default function RecentConversations({ conversations, loading }) {
  const navigate = useNavigate();

  return (
    <section className={`card ${styles.panel}`}>
      <header className="card-head">
        <div>
          <h2 className="card-title">Recent Conversations</h2>
          <p className="card-sub">What visitors have been asking</p>
        </div>
        <Link to="/conversations" className="link">
          View all <ArrowRight size={14} />
        </Link>
      </header>

      {loading ? (
        <ul className={styles.list}>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className={styles.row}>
              <Skeleton width={36} height={36} radius={18} />
              <div style={{ flex: 1 }}>
                <Skeleton width="40%" height={12} />
                <Skeleton width="75%" height={12} style={{ marginTop: 8 }} />
              </div>
            </li>
          ))}
        </ul>
      ) : !conversations?.length ? (
        <EmptyState icon={MessagesSquare} title="No conversations yet" description="When visitors chat with your AI consultant, they'll appear here." compact />
      ) : (
        <ul className={styles.list}>
          {conversations.map((c) => {
            const status = conversationStatusMeta(c.status);
            return (
              <li key={c.id}>
                <button type="button" className={`${styles.row} ${styles.rowButton}`} onClick={() => navigate(`/conversations/${c.id}`)}>
                  <Avatar name={c.visitorName} />
                  <div className={styles.rowMain}>
                    <div className={styles.rowTop}>
                      <span className={`${styles.rowName} truncate`}>{c.visitorName || 'Anonymous visitor'}</span>
                      <span className={styles.rowTime}>{formatRelative(c.lastMessageAt)}</span>
                    </div>
                    <p className={`${styles.rowText} truncate`}>{c.topic}</p>
                  </div>
                  <div className={styles.rowEnd}>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    <span className={`btn btn-secondary btn-sm ${styles.viewBtn}`}>View</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
