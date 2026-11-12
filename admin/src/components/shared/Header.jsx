import { useLocation } from 'react-router-dom';
import { ExternalLink, Menu } from 'lucide-react';
import { NAV_ITEMS } from './Sidebar.jsx';
import { CLIENT_URL } from '../../utils/constants.js';
import logo from '../../assets/logo-mark.svg';
import styles from './Header.module.css';

function currentSection(pathname) {
  const match = NAV_ITEMS.filter((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)));
  return match[match.length - 1]?.label || 'Overview';
}

export default function Header({ onOpenNav }) {
  const { pathname } = useLocation();

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button type="button" className={`icon-btn ${styles.menu}`} onClick={onOpenNav} aria-label="Open navigation">
          <Menu size={21} />
        </button>
        <img src={logo} alt="" width="32" height="32" className={styles.mobileLogo} />
        <nav aria-label="Breadcrumb" className={styles.crumbs}>
          <span className={styles.crumbRoot}>Control panel</span>
          <span className={styles.crumbSep} aria-hidden="true">/</span>
          <span className={styles.crumbCurrent} aria-current="page">
            {currentSection(pathname)}
          </span>
        </nav>
      </div>

      <div className={styles.right}>
        <span className={styles.live}>
          <span className={styles.liveDot} aria-hidden="true" />
          Live on seovirji.com
        </span>
        <a className={`btn btn-secondary btn-sm ${styles.preview}`} href={CLIENT_URL} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={15} />
          <span>Preview chatbot</span>
        </a>
      </div>
    </header>
  );
}
