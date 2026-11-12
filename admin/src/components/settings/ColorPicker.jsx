import { useEffect, useId, useState } from 'react';
import { isHexColor } from '../../utils/validation.js';
import styles from './settings.module.css';

/** Native colour input + hex text field + brand presets. */
export default function ColorPicker({ label, value, onChange, presets = [], hint }) {
  const id = useId();
  const [text, setText] = useState(value);
  const valid = isHexColor(text);

  useEffect(() => setText(value), [value]);

  const commit = (next) => {
    setText(next);
    if (isHexColor(next)) onChange(next.toUpperCase());
  };

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className={styles.color}>
        <span className={styles.swatch} style={{ background: valid ? text : value }}>
          <input type="color" value={value.length === 4 ? `#${[...value.slice(1)].map((c) => c + c).join('')}` : value} onChange={(e) => commit(e.target.value)} aria-label={`${label} picker`} />
        </span>
        <input
          id={id}
          className={`input ${styles.hex}`}
          value={text}
          maxLength={7}
          spellCheck={false}
          aria-invalid={!valid}
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
            commit(v);
          }}
          onBlur={() => !valid && setText(value)}
        />
        {presets.length > 0 && (
          <div className={styles.presets}>
            {presets.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`${styles.preset} ${p.value.toLowerCase() === value.toLowerCase() ? styles.presetActive : ''}`}
                style={{ background: p.value }}
                onClick={() => commit(p.value)}
                aria-label={`Use ${p.label}`}
                title={p.label}
              />
            ))}
          </div>
        )}
      </div>
      {!valid ? <p className="field-error">Use a hex colour like #0B1050.</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}
