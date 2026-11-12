import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, UsersRound } from 'lucide-react';
import { Avatar, EmptyState, Skeleton, StatusBadge } from '../shared/ui.jsx';
import { WhatsAppButton } from '../shared/WhatsAppIcon.jsx';
import { leadStatusMeta } from '../../utils/constants.js';
import styles from './dashboard.module.css';

export default function RecentLeads({ leads, loading }) {
  const navigate = useNavigate();

  return (
    <section className={`card ${styles.panel}`}>
      <header className="card-head">
        <div>
          <h2 className="card-title">Recent Leads</h2>
          <p className="card-sub">Potential clients your AI consultant has qualified</p>
        </div>
        <Link to="/leads" className="link">
          View all <ArrowRight size={14} />
        </Link>
      </header>

      {loading ? (
        <div className={styles.leadGrid}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.leadCard}>
              <Skeleton width="50%" height={14} />
              <Skeleton width="70%" height={12} style={{ marginTop: 10 }} />
              <Skeleton width="90%" height={12} style={{ marginTop: 16 }} />
            </div>
          ))}
        </div>
      ) : !leads?.length ? (
        <EmptyState icon={UsersRound} title="No leads yet" description="Qualified visitors will show up here." compact />
      ) : (
        <div className={styles.leadGrid}>
          {leads.map((lead) => {
            const status = leadStatusMeta(lead.status);
            return (
              <article key={lead.id} className={styles.leadCard}>
                <button type="button" className={styles.leadOpen} onClick={() => navigate(`/leads/${lead.id}`)} aria-label={`Open lead ${lead.name}`} />
                <div className={styles.leadHead}>
                  <Avatar name={lead.name} size={38} />
                  <div className={styles.leadWho}>
                    <p className={`${styles.rowName} truncate`}>{lead.name}</p>
                    <p className={`${styles.rowText} truncate`}>{lead.businessName}</p>
                  </div>
                </div>
                <p className={styles.leadNeed}>
                  <span>Main requirement</span>
                  {lead.challenge || 'Not shared yet'}
                </p>
                <div className={styles.leadFoot}>
                  <WhatsAppButton lead={lead} size="sm" label="WhatsApp" />
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
