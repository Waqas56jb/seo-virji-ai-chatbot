import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';

const MAX_LENGTH = 1000;
const MAX_HEIGHT = 132;

/** Enter sends, Shift+Enter adds a new line. Grows with content up to MAX_HEIGHT. */
const MessageComposer = forwardRef(function MessageComposer({ onSend, isBusy, showHint }, ref) {
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);

  useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus() }), []);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !isBusy;

  const submit = () => {
    if (!canSend) return;
    if (onSend(value)) setValue('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const remaining = MAX_LENGTH - value.length;

  return (
    <form
      className="sv-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className={`sv-composer-field ${isBusy ? 'is-busy' : ''}`}>
        <label htmlFor="sv-composer-input" className="sv-sr-only">
          Type your message
        </label>
        <textarea
          id="sv-composer-input"
          ref={textareaRef}
          rows={1}
          value={value}
          maxLength={MAX_LENGTH}
          placeholder="Tell me about your business…"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          enterKeyHint="send"
          autoComplete="off"
        />
        <button type="submit" className="sv-send" disabled={!canSend} aria-label="Send message">
          <ArrowUp size={19} strokeWidth={2.4} />
        </button>
      </div>
      <div className="sv-composer-foot">
        {showHint ? (
          <span>
            <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line
          </span>
        ) : (
          <span>Private &amp; secure conversation</span>
        )}
        {remaining < 150 ? (
          <span className={remaining < 30 ? 'is-warn' : ''}>{remaining} left</span>
        ) : (
          <span className="sv-powered">Powered by SEO Virji AI</span>
        )}
      </div>
    </form>
  );
});

export default MessageComposer;
