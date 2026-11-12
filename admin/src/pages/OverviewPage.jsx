import { Link } from 'react-router-dom';
import { Activity, CheckCircle2, Eye, MessageCircleMore, MessagesSquare, UsersRound } from 'lucide-react';
import { ErrorState, PageHeader, Skeleton } from '../components/shared/ui.jsx';
import { WhatsAppIcon } from '../components/shared/WhatsAppIcon.jsx';
import StatCard from '../components/dashboard/StatCard.jsx';
import RecentConversations from '../components/dashboard/RecentConversations.jsx';
import RecentLeads from '../components/dashboard/RecentLeads.jsx';
import ChatbotStatusCard from '../components/dashboard/ChatbotStatusCard.jsx';
import KnowledgeCrawlCard from '../components/dashboard/KnowledgeCrawlCard.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { getOverview } from '../services/statsService.js';
import styles from './pages.module.css';
import dStyles from '../components/dashboard/dashboard.module.css';

const STATS = [
  { key: 'totalVisitors', label: 'Total Visitors', icon: Eye },
  { key: 'totalConversations', label: 'Total Conversations', icon: MessagesSquare },
  { key: 'totalLeads', label: 'Total Leads', icon: UsersRound },
  { key: 'handoffs', label: 'WhatsApp Handoffs', icon: WhatsAppIcon },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function MiniStat({ icon: Icon, label, value, to, loading, suffix }) {
  const body = (
    <>
      <span className={dStyles.miniIcon}>
        <Icon size={16} />
      </span>
      <span className={dStyles.miniText}>
        <span className={dStyles.miniLabel}>{label}</span>
        {loading ? (
          <Skeleton width={40} height={18} />
        ) : (
          <span className={dStyles.miniValue}>
            {(value ?? 0).toLocaleString()}
            {suffix}
          </span>
        )}
      </span>
    </>
  );
  return to ? (
    <Link to={to} className={`card ${dStyles.mini} ${dStyles.miniLink}`}>
      {body}
    </Link>
  ) : (
    <div className={`card ${dStyles.mini}`}>{body}</div>
  );
}

export default function OverviewPage() {
  const { data, loading, error, reload } = useAsync(getOverview, []);
  const busy = loading && !data;

  if (error && !data) {
    return (
      <>
        <p className={styles.kicker}>{greeting()} 👋</p>
        <PageHeader title="Welcome to SEO Virji" description="Here's what's happening with your AI consultant." />
        <div className="card">
          <ErrorState title="Couldn't load your dashboard" error={error} onRetry={reload} />
        </div>
      </>
    );
  }

  const counts = data?.conversationCounts;

  return (
    <>
      <p className={styles.kicker}>{greeting()} 👋</p>
      <PageHeader title="Welcome to SEO Virji" description="Here's what's happening with your AI consultant." />

      <div className={styles.statGrid}>
        {STATS.map((s) => (
          <StatCard key={s.key} icon={s.icon} label={s.label} stat={data?.stats?.[s.key]} loading={busy} />
        ))}
      </div>

      <div className={dStyles.miniRow}>
        <MiniStat icon={MessageCircleMore} label="Active conversations" value={counts?.active} loading={busy} to="/conversations" />
        <MiniStat icon={CheckCircle2} label="Resolved conversations" value={counts?.resolved} loading={busy} to="/conversations" />
        <MiniStat icon={Activity} label="Chatbot engagement" value={data?.stats?.engagement?.value} suffix="%" loading={busy} />
      </div>

      <div className={styles.overviewGrid}>
        <RecentConversations conversations={data?.recentConversations} loading={busy} />
        <ChatbotStatusCard status={data?.status} loading={busy} />
      </div>

      <div className={styles.overviewGrid}>
        <RecentLeads leads={data?.recentLeads} loading={busy} />
        <KnowledgeCrawlCard knowledge={data?.knowledge} crawl={data?.crawl} loading={busy} />
      </div>
    </>
  );
}
