import { ChevronDown, Maximize2, Minimize2, Minus, RotateCcw } from 'lucide-react';

function IconButton({ label, onClick, children }) {
  return (
    <button type="button" className="sv-icon-btn" onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
  );
}

/** Header actions: new conversation, maximize/restore (desktop) and minimize. */
export default function ConversationActions({ canReset, canExpand, canClose = true, isExpanded, isMobile, onReset, onToggleExpand, onClose }) {
  return (
    <div className="sv-header-actions">
      {canReset && (
        <IconButton label="New conversation" onClick={onReset}>
          <RotateCcw size={17} />
        </IconButton>
      )}
      {canExpand && (
        <IconButton label={isExpanded ? 'Restore size' : 'Maximize'} onClick={onToggleExpand}>
          {isExpanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </IconButton>
      )}
      {canClose && (
        <IconButton label="Minimize chat" onClick={onClose}>
          {isMobile ? <ChevronDown size={20} /> : <Minus size={19} />}
        </IconButton>
      )}
    </div>
  );
}
