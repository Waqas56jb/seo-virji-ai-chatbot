import { Link } from 'react-router-dom';
import { BookOpen, Clock, Cpu, Globe, Power, RefreshCw, Settings2 } from 'lucide-react';
import { WhatsAppIcon } from '../shared/WhatsAppIcon.jsx';
import { Skeleton } from '../shared/ui.jsx';
import { formatRelative } from '../../utils/date.js';
import styles from './dashboard.module.css';

/** Live status computed by the API from the real configuration and database. */
export default function ChatbotStatusCard({ status, loading }) {
  const online = status?.online;
  const enabled = status?.enabled !== false;
  const knowledgeOk = status && status.knowledgeEmbedded > 0;
  const rows = status
    ? [
        { icon: Globe, label: 'Website', value: status.domain },
        { icon: Power, label: 'Website widget', value: enabled ? 'Enabled' : 'Hidden', ok: enabled },
        { icon: Clock, label: 'Availability', value: online ? '24/7' : 'Shown as away' },
        { icon: Cpu, label: 'AI model', value: status.aiConfigured ? status.model || 'Connected' : 'Not configured', ok: status.aiConfigured },
        {
          icon: BookOpen,
          label: 'Knowledge Base',
          value: knowledgeOk ? 'Connected' : 'Empty',
          ok: knowledgeOk,
          hint: `${status.knowledgeItems} sources · ${status.knowledgeEmbedded ?? 0}/${status.knowledgeChunks ?? 0} embedded`,
        },
        { icon: WhatsAppIcon, label: 'WhatsApp Handoff', value: status.whatsappEnabled ? 'Configured' : 'Off', ok: status.whatsappEnabled },
        { icon: RefreshCw, label: 'Website sync', value: status.lastSyncAt ? formatRelative(status.lastSyncAt) : 'Never' },
      ]
    : [];

  return (
    <section className={`card ${styles.statusCard}`}>
      <div className={styles.statusHero}>
        <span className={`${styles.pulse} ${online && enabled ? '' : styles.pulseOff}`} aria-hidden="true" />
        <div>
          <p className={styles.statusEyebrow}>Chatbot status</p>
          <h2 className={styles.statusTitle}>
            {loading ? (
              <Skeleton width={180} height={18} />
            ) : !status ? (
              'Status unavailable'
            ) : !enabled ? (
              'Your AI chatbot is turned off'
            ) : online ? (
              'Your AI chatbot is active'
            ) : (
              'Your AI chatbot is shown as away'
            )}
          </h2>
        </div>
      </div>

      <dl className={styles.statusList}>
        {loading
          ? [0, 1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.statusRow}>
                <Skeleton width="45%" height={12} />
                <Skeleton width="25%" height={12} />
              </div>
            ))
          : rows.map(({ icon: Icon, label, value, ok, hint }) => (
              <div key={label} className={styles.statusRow}>
                <dt>
                  <Icon size={15} />
                  {label}
                </dt>
                <dd>
                  {ok !== undefined && <span className={`${styles.okDot} ${ok ? '' : styles.okDotOff}`} aria-hidden="true" />}
                  {value}
                  {hint && <small>{hint}</small>}
                </dd>
              </div>
            ))}
      </dl>

      <div className={styles.statusFoot}>
        <p>Live status from your server and Supabase database.</p>
        <Link to="/settings" className="btn btn-secondary btn-sm">
          <Settings2 size={15} /> Settings
        </Link>
      </div>
    </section>
  );
}
