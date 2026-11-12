import { NavLink } from 'react-router-dom';
import { BookOpen, LayoutGrid, LogOut, MessagesSquare, Settings2, UsersRound, X } from 'lucide-react';
import { useToast } from './Toast.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import logo from '../../assets/logo-mark.svg';
import styles from './Sidebar.module.css';

export const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
  { to: '/conversations', label: 'Conversations', icon: MessagesSquare },
  { to: '/leads', label: 'Leads', icon: UsersRound },
  { to: '/settings', label: 'Chatbot Settings', icon: Settings2 },
];

export default function Sidebar({ open, onClose }) {
  const toast = useToast();
  const { admin, logout } = useAuth();
  const initials = (admin?.fullName || admin?.email || 'SV').split(/[\s@.]/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

  return (
    <>
      <div className={`${styles.backdrop} ${open ? styles.backdropVisible : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`${styles.sidebar} ${open ? styles.open : ''}`} aria-label="Main navigation">
        <div className={styles.brand}>
          <img src={logo} alt="" width="40" height="40" />
          <div className={styles.brandText}>
            <span className={styles.brandName}>
              SEO <b>VIRJI</b>
            </span>
            <span className={styles.brandSub}>AI Chatbot Control Panel</span>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>
              <Icon size={19} strokeWidth={1.9} className={styles.linkIcon} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.footer}>
          <div className={styles.help}>
            <p className={styles.helpTitle}>Your AI consultant is live</p>
            <p className={styles.helpText}>Answering visitors on seovirji.com around the clock.</p>
          </div>
          <div className={styles.profile}>
            <span className={styles.profileAvatar}>{initials}</span>
            <div className={styles.profileText}>
              <span className={styles.profileName}>{admin?.fullName || 'SEO Virji Admin'}</span>
              <span className={styles.profileRole} title={admin?.email}>{admin?.email || 'Owner'}</span>
            </div>
            <button
              type="button"
              className={styles.logout}
              aria-label="Log out"
              title="Log out"
              onClick={async () => {
                await logout();
                toast.success('Signed out');
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
