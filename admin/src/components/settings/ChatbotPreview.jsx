import { ArrowUp, Minus } from 'lucide-react';
import { WhatsAppIcon } from '../shared/WhatsAppIcon.jsx';
import styles from './settings.module.css';

/** Live, non-interactive preview of the widget using the current (unsaved) settings. */
export default function ChatbotPreview({ settings }) {
  const { general, whatsapp, appearance } = settings;
  const style = { '--p': appearance.primaryColor, '--a': appearance.accentColor };
  const welcome = general.welcomeMessage?.trim() || 'Hi there! How can I help your business grow today?';

  return (
    <div className={styles.preview} style={style} aria-label="Chatbot preview">
      <div className={styles.pvWindow}>
        <div className={styles.pvHead}>
          <span className={styles.pvLogo}>
            {appearance.logo ? <img src={appearance.logo} alt="" /> : <span>SV</span>}
            {general.online && <i className={styles.pvPresence} />}
          </span>
          <div className={styles.pvTitle}>
            <strong className="truncate">{appearance.title || general.chatbotName || 'AI Consultant'}</strong>
            <span className="truncate">
              <i className={general.online ? styles.pvOnline : styles.pvAway} />
              {general.online ? 'Online' : 'Away'} · {general.description}
            </span>
          </div>
          <Minus size={16} className={styles.pvMin} />
        </div>

        <div className={styles.pvBody}>
          <div className={styles.pvMsg}>
            <span className={styles.pvAvatar} />
            <p>{welcome}</p>
          </div>
          <div className={styles.pvChips}>
            <span>Improve My Google Rankings</span>
            <span>Generate More Leads</span>
          </div>
          <div className={`${styles.pvMsg} ${styles.pvUser}`}>
            <p>I'd like to talk to someone.</p>
          </div>
          {whatsapp.enabled && (
            <div className={styles.pvCta}>
              <span className={styles.pvCtaIcon}>
                <WhatsAppIcon size={15} />
              </span>
              <span className={styles.pvCtaText}>
                <strong className="truncate">{whatsapp.buttonLabel || 'Continue on WhatsApp'}</strong>
                <small>Chat directly with our team</small>
              </span>
            </div>
          )}
        </div>

        <div className={styles.pvComposer}>
          <span>Tell me about your business…</span>
          <i>
            <ArrowUp size={14} strokeWidth={2.5} />
          </i>
        </div>
      </div>

      <div className={`${styles.pvLauncherRow} ${appearance.position === 'left' ? styles.pvLeft : ''}`}>
        <span className={styles.pvLauncher}>
          <svg viewBox="0 0 28 28" width="22" height="22" aria-hidden="true">
            <path d="M14 3.5c-6.08 0-11 4.2-11 9.4 0 2.86 1.5 5.42 3.86 7.14-.17 1.5-.83 2.88-1.9 3.96 2.02-.1 3.85-.82 5.17-1.9 1.2.33 2.49.5 3.87.5 6.08 0 11-4.2 11-9.4S20.08 3.5 14 3.5Z" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M14 8.4l1.25 3.45 3.45 1.25-3.45 1.25L14 17.8l-1.25-3.45-3.45-1.25 3.45-1.25z" fill="var(--a)" />
          </svg>
        </span>
      </div>
    </div>
  );
}
