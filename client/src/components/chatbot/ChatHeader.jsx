import { BrandMark } from '../shared/BrandMark.jsx';
import ConversationActions from './ConversationActions.jsx';

export default function ChatHeader({ config, isActive, isMobile, isExpanded, standalone, onReset, onToggleExpand, onClose }) {
  return (
    <header className="sv-header">
      <div className="sv-header-brand">
        <span className="sv-header-logo">
          <BrandMark size={42} />
          {config.online && <span className="sv-header-presence" aria-hidden="true" />}
        </span>
        <div className="sv-header-text">
          <h2 className="sv-header-title">{config.assistantName}</h2>
          <p className="sv-header-sub">
            <span className={`sv-status ${config.online ? 'is-online' : ''}`}>
              <span className="sv-status-dot" aria-hidden="true" />
              {config.online ? 'Online' : 'Away'}
            </span>
            <span className="sv-header-sep" aria-hidden="true">·</span>
            <span className="sv-header-tagline">{config.assistantTagline}</span>
          </p>
        </div>
      </div>

      <ConversationActions
        canReset={isActive}
        canExpand={!isMobile && !standalone}
        canClose={!standalone}
        isExpanded={isExpanded}
        isMobile={isMobile}
        onReset={onReset}
        onToggleExpand={onToggleExpand}
        onClose={onClose}
      />
    </header>
  );
}
