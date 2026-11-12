import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Brain, Briefcase, Cpu, HeartHandshake, MessagesSquare, Palette, Save, Smile, Upload, Wand2, X } from 'lucide-react';
import { ErrorState, PageHeader, Skeleton, Toggle } from '../components/shared/ui.jsx';
import { useToast } from '../components/shared/Toast.jsx';
import { WhatsAppIcon } from '../components/shared/WhatsAppIcon.jsx';
import SettingsCard, { CheckChips, Field, OptionGroup } from '../components/settings/SettingsCard.jsx';
import ColorPicker from '../components/settings/ColorPicker.jsx';
import ChatbotPreview from '../components/settings/ChatbotPreview.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { getSettings, saveSettings } from '../services/settingsService.js';
import { isHexColor, isValidDomain, isValidPhone, required } from '../utils/validation.js';
import styles from '../components/settings/settings.module.css';

const TONES = [
  { value: 'professional', label: 'Professional', description: 'Polished, precise and to the point.', icon: Briefcase },
  { value: 'friendly', label: 'Friendly', description: 'Warm, relaxed and approachable.', icon: Smile },
  { value: 'empathetic', label: 'Empathetic', description: 'Understands feelings before facts.', icon: HeartHandshake },
  { value: 'consultative', label: 'Consultative', description: 'Asks, listens, then advises.', icon: Brain },
];

const STYLES = [
  { value: 'concise', label: 'Concise' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'detailed', label: 'Detailed' },
];

const BEHAVIOURS = [
  { value: 'natural', label: 'Natural conversations' },
  { value: 'followUps', label: 'Ask follow-up questions' },
  { value: 'understandProblems', label: 'Understand customer problems' },
  { value: 'avoidRobotic', label: 'Avoid robotic responses' },
];

const COLOR_PRESETS = {
  primary: [
    { label: 'SEO Virji Navy', value: '#0B1050' },
    { label: 'Royal Blue', value: '#2B3FC4' },
    { label: 'Black', value: '#0A0A0A' },
  ],
  accent: [
    { label: 'SEO Virji Gold', value: '#C9A132' },
    { label: 'Yellow', value: '#FFC400' },
    { label: 'Cream', value: '#FBF5EC' },
  ],
};

const MAX_LOGO_BYTES = 200 * 1024;

/** Allowed ranges — mirror the server validation for `ai` settings. */
export const AI_LIMITS = {
  temperature: { min: 0, max: 1.2, step: 0.05, label: 'Creativity (temperature)' },
  maxOutputTokens: { min: 200, max: 1500, step: 50, integer: true, label: 'Max response length' },
  topK: { min: 2, max: 12, step: 1, integer: true, label: 'Results per answer' },
  minSimilarity: { min: 0.1, max: 0.8, step: 0.05, label: 'Minimum relevance' },
  memoryLimit: { min: 6, max: 40, step: 1, integer: true, label: 'Recent messages kept' },
};

function rangeError(value, { min, max, integer, label }) {
  if (value === '' || value === null || value === undefined || Number.isNaN(Number(value))) return `${label} is required.`;
  const n = Number(value);
  if (integer && !Number.isInteger(n)) return `${label} must be a whole number.`;
  if (n < min || n > max) return `${label} must be between ${min} and ${max}.`;
  return null;
}

function validate(s) {
  const e = {};
  e.chatbotName = required(s.general.chatbotName, 'Chatbot name');
  e.businessName = required(s.general.businessName, 'Business name');
  e.domain = !s.general.domain.trim() ? 'Website domain is required.' : !isValidDomain(s.general.domain) ? 'Use a domain like seovirji.com' : null;
  e.welcomeMessage = required(s.general.welcomeMessage, 'Welcome message');
  if (s.whatsapp.enabled) {
    e.number = !isValidPhone(s.whatsapp.number) ? 'Enter 8–15 digits including the country code, e.g. 447700900123.' : null;
    e.buttonLabel = required(s.whatsapp.buttonLabel, 'Button label');
  }
  if (s.ai) {
    e.model = s.ai.models?.length && !s.ai.models.includes(s.ai.model) ? 'Choose one of the available models.' : null;
    Object.entries(AI_LIMITS).forEach(([key, limits]) => {
      e[key] = rangeError(s.ai[key], limits);
    });
  }
  e.primaryColor = isHexColor(s.appearance.primaryColor) ? null : 'Invalid colour';
  e.accentColor = isHexColor(s.appearance.accentColor) ? null : 'Invalid colour';
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v));
}

export default function SettingsPage() {
  const toast = useToast();
  const { data: saved, loading, error: loadError, reload, setData: setSaved } = useAsync(getSettings, []);
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (saved && !draft) setDraft(saved);
  }, [saved, draft]);

  const dirty = useMemo(() => draft && saved && JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  const update = (group, key) => (value) => {
    setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: value } }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: null }));
  };
  const onInput = (group, key) => (e) => update(group, key)(e.target.value);
  // Numbers stay numbers; an emptied field stays '' so validation can flag it.
  const onNumber = (key) => (e) => update('ai', key)(e.target.value === '' ? '' : Number(e.target.value));

  const handleSave = async () => {
    const next = validate(draft);
    setErrors(next);
    if (Object.keys(next).length) {
      toast.error('Please check the highlighted fields', 'Some settings need your attention before saving.');
      return;
    }
    setSaving(true);
    try {
      const result = await saveSettings(draft);
      setSaved(result);
      setDraft(result);
      toast.success('Settings saved', 'Your chatbot has been updated.');
    } catch (err) {
      // `whatsapp.welcomeMessage` has its own key so it doesn't collide with the general welcome message.
      const fieldErrors = Object.fromEntries(
        (err.details || []).map((d) => [d.field === 'whatsapp.welcomeMessage' ? 'waWelcomeMessage' : String(d.field).split('.').pop(), d.message]),
      );
      if (Object.keys(fieldErrors).length) setErrors(fieldErrors);
      toast.error("Couldn't save settings", err.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogo = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file');
    if (file.size > MAX_LOGO_BYTES) return toast.error('Image is too large', 'Please use an image under 200 KB.');
    const reader = new FileReader();
    reader.onload = () => update('appearance', 'logo')(reader.result);
    reader.readAsDataURL(file);
  };

  const saveButton = (
    <button type="button" className="btn btn-gold" onClick={handleSave} disabled={!dirty || saving}>
      <Save size={16} /> {saving ? 'Saving…' : 'Save Changes'}
    </button>
  );

  if (loadError && !saved) {
    return (
      <>
        <PageHeader title="Chatbot Settings" description="Control how your AI consultant looks, sounds and hands conversations to you." />
        <div className="card">
          <ErrorState title="Couldn't load your settings" error={loadError} onRetry={reload} />
        </div>
      </>
    );
  }

  if (loading || !draft) {
    return (
      <>
        <PageHeader title="Chatbot Settings" description="Control how your AI consultant looks, sounds and hands conversations to you." />
        <div className={styles.layout}>
          <div className={styles.column}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="card" style={{ padding: 22 }}>
                <Skeleton width="30%" height={16} />
                <Skeleton width="100%" height={42} style={{ marginTop: 20 }} />
                <Skeleton width="100%" height={42} style={{ marginTop: 14 }} />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  const { general, personality, whatsapp, appearance } = draft;
  const ai = draft.ai;

  return (
    <>
      <PageHeader
        title="Chatbot Settings"
        description="Control how your AI consultant looks, sounds and hands conversations to you."
        actions={saveButton}
      />

      <div className={styles.layout}>
        <div className={styles.column}>
          {/* A. General */}
          <SettingsCard id="general" icon={MessagesSquare} title="General" description="The basics visitors see first.">
            <div className={`${styles.toggleBox} ${general.enabled === false ? styles.toggleBoxOff : ''}`}>
              <Toggle
                id="s-enabled"
                checked={general.enabled !== false}
                onChange={update('general', 'enabled')}
                label="Chatbot enabled"
                description={
                  general.enabled === false
                    ? 'Off — the chat widget is hidden from your website. Visitors cannot start new conversations.'
                    : 'On — the chat widget is shown on your website. Turn off to hide it completely.'
                }
              />
            </div>
            <div className={styles.grid2}>
              <Field label="Chatbot name" htmlFor="s-name" error={errors.chatbotName}>
                <input id="s-name" className="input" value={general.chatbotName} onChange={onInput('general', 'chatbotName')} maxLength={60} aria-invalid={Boolean(errors.chatbotName)} />
              </Field>
              <Field label="Business name" htmlFor="s-business" error={errors.businessName} hint="How the AI refers to your business.">
                <input id="s-business" className="input" value={general.businessName || ''} onChange={onInput('general', 'businessName')} maxLength={80} aria-invalid={Boolean(errors.businessName)} />
              </Field>
            </div>
            <Field label="Website domain" htmlFor="s-domain" error={errors.domain} hint="Where the chatbot is installed.">
              <input id="s-domain" className="input" value={general.domain} onChange={onInput('general', 'domain')} placeholder="seovirji.com" aria-invalid={Boolean(errors.domain)} />
            </Field>
            <Field label="Assistant description" htmlFor="s-desc" hint="Shown under the name in the chat header.">
              <input id="s-desc" className="input" value={general.description} onChange={onInput('general', 'description')} maxLength={80} />
            </Field>
            <Field label="Welcome message" htmlFor="s-welcome" error={errors.welcomeMessage} hint="The first thing your AI consultant says.">
              <textarea id="s-welcome" className="textarea" rows={4} value={general.welcomeMessage} onChange={onInput('general', 'welcomeMessage')} maxLength={1000} aria-invalid={Boolean(errors.welcomeMessage)} />
            </Field>
            <div className={styles.toggleBox}>
              <Toggle
                id="s-online"
                checked={general.online}
                onChange={update('general', 'online')}
                label="Show as online"
                description={general.online ? 'Visitors see a green “Online” status.' : 'Visitors see “Away” — the chatbot still answers.'}
              />
            </div>
          </SettingsCard>

          {/* B. Personality */}
          <SettingsCard id="personality" icon={Wand2} title="Personality" description="How your AI consultant speaks to visitors.">
            <p className={styles.subLabel}>Tone</p>
            <OptionGroup name="tone" label="Tone" options={TONES} value={personality.tone} onChange={update('personality', 'tone')} />
            <div className={styles.divider} />
            <p className={styles.subLabel}>Response style</p>
            <div>
              <OptionGroup name="style" label="Response style" variant="segmented" options={STYLES} value={personality.style} onChange={update('personality', 'style')} />
            </div>
            <div className={styles.divider} />
            <p className={styles.subLabel}>
              Communication <span>— choose all that apply</span>
            </p>
            <CheckChips label="Communication" options={BEHAVIOURS} values={personality.behaviours} onChange={update('personality', 'behaviours')} />
            <Field label="Additional Instructions" htmlFor="s-instructions" optional hint="Anything else your AI consultant should always (or never) do.">
              <textarea
                id="s-instructions"
                className="textarea"
                rows={4}
                value={personality.instructions}
                onChange={onInput('personality', 'instructions')}
                maxLength={1000}
                placeholder="e.g. Always mention our free initial audit when visitors ask about pricing."
              />
            </Field>
          </SettingsCard>

          {/* AI & Knowledge */}
          {ai && (
            <SettingsCard id="ai" icon={Cpu} title="AI & Knowledge" description="The model behind your consultant and how it uses your knowledge base.">
              {ai.configured === false && (
                <p className={styles.warnNote} role="note">
                  <AlertTriangle size={15} /> The AI key isn't configured on the server yet, so the chatbot can't generate answers. These settings are saved and apply once it is.
                </p>
              )}
              <div className={styles.grid2}>
                <Field label="AI model" htmlFor="s-ai-model" error={errors.model} hint="Larger models write better answers but cost more and respond slower.">
                  <select id="s-ai-model" className="select" value={ai.model} onChange={onInput('ai', 'model')} aria-invalid={Boolean(errors.model)}>
                    {(ai.models?.length ? ai.models : [ai.model]).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Max response length (tokens)"
                  htmlFor="s-ai-tokens"
                  error={errors.maxOutputTokens}
                  hint={`${AI_LIMITS.maxOutputTokens.min}–${AI_LIMITS.maxOutputTokens.max}. About 75 words per 100 tokens.`}
                >
                  <input
                    id="s-ai-tokens"
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min={AI_LIMITS.maxOutputTokens.min}
                    max={AI_LIMITS.maxOutputTokens.max}
                    step={AI_LIMITS.maxOutputTokens.step}
                    value={ai.maxOutputTokens}
                    onChange={onNumber('maxOutputTokens')}
                    aria-invalid={Boolean(errors.maxOutputTokens)}
                  />
                </Field>
              </div>

              <Field
                label="Creativity (temperature)"
                htmlFor="s-ai-temp"
                error={errors.temperature}
                hint="Lower = more focused and consistent. Higher = more varied wording. 0.3–0.7 suits most businesses."
              >
                <div className={styles.rangeRow}>
                  <input
                    type="range"
                    className={styles.range}
                    min={AI_LIMITS.temperature.min}
                    max={AI_LIMITS.temperature.max}
                    step={AI_LIMITS.temperature.step}
                    value={ai.temperature === '' ? AI_LIMITS.temperature.min : ai.temperature}
                    onChange={onNumber('temperature')}
                    aria-label="Creativity (temperature) slider"
                  />
                  <input
                    id="s-ai-temp"
                    className={`input ${styles.rangeNumber}`}
                    type="number"
                    inputMode="decimal"
                    min={AI_LIMITS.temperature.min}
                    max={AI_LIMITS.temperature.max}
                    step={AI_LIMITS.temperature.step}
                    value={ai.temperature}
                    onChange={onNumber('temperature')}
                    aria-invalid={Boolean(errors.temperature)}
                  />
                </div>
              </Field>

              <div className={styles.divider} />
              <p className={styles.subLabel}>
                Retrieval <span>— how much of your knowledge base is used per answer</span>
              </p>
              <div className={styles.grid2}>
                <Field label="Results per answer" htmlFor="s-ai-topk" error={errors.topK} hint={`${AI_LIMITS.topK.min}–${AI_LIMITS.topK.max} knowledge chunks given to the AI for each reply.`}>
                  <input
                    id="s-ai-topk"
                    className="input"
                    type="number"
                    inputMode="numeric"
                    min={AI_LIMITS.topK.min}
                    max={AI_LIMITS.topK.max}
                    step={1}
                    value={ai.topK}
                    onChange={onNumber('topK')}
                    aria-invalid={Boolean(errors.topK)}
                  />
                </Field>
                <Field
                  label="Minimum relevance"
                  htmlFor="s-ai-sim"
                  error={errors.minSimilarity}
                  hint={`${AI_LIMITS.minSimilarity.min}–${AI_LIMITS.minSimilarity.max}. Higher = only closely matching knowledge is used.`}
                >
                  <input
                    id="s-ai-sim"
                    className="input"
                    type="number"
                    inputMode="decimal"
                    min={AI_LIMITS.minSimilarity.min}
                    max={AI_LIMITS.minSimilarity.max}
                    step={AI_LIMITS.minSimilarity.step}
                    value={ai.minSimilarity}
                    onChange={onNumber('minSimilarity')}
                    aria-invalid={Boolean(errors.minSimilarity)}
                  />
                </Field>
              </div>

              <div className={styles.divider} />
              <p className={styles.subLabel}>
                Memory <span>— conversation context</span>
              </p>
              <Field
                label="Recent messages kept in context"
                htmlFor="s-ai-memory"
                error={errors.memoryLimit}
                hint={`${AI_LIMITS.memoryLimit.min}–${AI_LIMITS.memoryLimit.max}. Older messages are summarised so the AI still remembers key details.`}
              >
                <input
                  id="s-ai-memory"
                  className={`input ${styles.narrowInput}`}
                  type="number"
                  inputMode="numeric"
                  min={AI_LIMITS.memoryLimit.min}
                  max={AI_LIMITS.memoryLimit.max}
                  step={1}
                  value={ai.memoryLimit}
                  onChange={onNumber('memoryLimit')}
                  aria-invalid={Boolean(errors.memoryLimit)}
                />
              </Field>
            </SettingsCard>
          )}

          {/* C. WhatsApp */}
          <SettingsCard
            id="whatsapp"
            icon={WhatsAppIcon}
            title="WhatsApp"
            description="Let ready visitors continue the conversation with you directly."
          >
            <div className={styles.toggleBox}>
              <Toggle
                id="s-wa-enabled"
                checked={whatsapp.enabled}
                onChange={update('whatsapp', 'enabled')}
                label="Enable WhatsApp handoff"
                description="Show a “Continue on WhatsApp” option when visitors are ready."
              />
            </div>
            <div className={styles.grid2}>
              <Field label="WhatsApp business number" htmlFor="s-wa-number" error={errors.number} hint="Country code + number, digits only.">
                <input
                  id="s-wa-number"
                  className="input"
                  inputMode="tel"
                  value={whatsapp.number}
                  onChange={(e) => update('whatsapp', 'number')(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="447700900123"
                  disabled={!whatsapp.enabled}
                  aria-invalid={Boolean(errors.number)}
                />
              </Field>
              <Field label="Handoff button label" htmlFor="s-wa-label" error={errors.buttonLabel}>
                <input id="s-wa-label" className="input" value={whatsapp.buttonLabel} onChange={onInput('whatsapp', 'buttonLabel')} maxLength={32} disabled={!whatsapp.enabled} aria-invalid={Boolean(errors.buttonLabel)} />
              </Field>
            </div>
            <Field
              label="WhatsApp handoff message"
              htmlFor="s-wa-msg"
              error={errors.waWelcomeMessage}
              hint="The intro line of the pre-filled WhatsApp message. The visitor's question, their details and a chat reference are added automatically."
            >
              <textarea
                id="s-wa-msg"
                className="textarea"
                rows={3}
                value={whatsapp.welcomeMessage}
                onChange={(e) => {
                  update('whatsapp', 'welcomeMessage')(e.target.value);
                  if (errors.waWelcomeMessage) setErrors((er) => ({ ...er, waWelcomeMessage: null }));
                }}
                maxLength={600}
                disabled={!whatsapp.enabled}
                placeholder="Hi SEO Virji, I'd like to continue my chat with your AI consultant."
                aria-invalid={Boolean(errors.waWelcomeMessage)}
              />
            </Field>
            <div className={styles.waPreview}>
              <span className={styles.waPreviewLabel}>Preview</span>
              <span className={`${styles.waButton} ${whatsapp.enabled ? '' : styles.waOff}`}>
                <span>
                  <WhatsAppIcon size={17} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <strong className="truncate">{whatsapp.buttonLabel || 'Continue on WhatsApp'}</strong>
                  <small>Chat directly with our team</small>
                </span>
              </span>
            </div>
          </SettingsCard>

          {/* D. Appearance */}
          <SettingsCard id="appearance" icon={Palette} title="Appearance" description="Match the chatbot to your brand.">
            <div className={styles.grid2}>
              <ColorPicker label="Primary color" value={appearance.primaryColor} onChange={update('appearance', 'primaryColor')} presets={COLOR_PRESETS.primary} hint="Header, launcher and your visitors' messages." />
              <ColorPicker label="Secondary color" value={appearance.accentColor} onChange={update('appearance', 'accentColor')} presets={COLOR_PRESETS.accent} hint="Buttons and highlights — use sparingly." />
            </div>
            <div className={styles.grid2}>
              <Field label="Chatbot title" htmlFor="s-title" hint="Shown in the chat window header.">
                <input id="s-title" className="input" value={appearance.title} onChange={onInput('appearance', 'title')} maxLength={60} />
              </Field>
              <div className="field">
                <span className="field-label">Launcher position</span>
                <OptionGroup
                  name="position"
                  label="Launcher position"
                  variant="segmented"
                  options={[
                    { value: 'left', label: 'Bottom left' },
                    { value: 'right', label: 'Bottom right' },
                  ]}
                  value={appearance.position}
                  onChange={update('appearance', 'position')}
                />
              </div>
            </div>
            <div className="field">
              <span className="field-label">Assistant logo</span>
              <div className={styles.logoRow}>
                <span className={styles.logoBox}>{appearance.logo ? <img src={appearance.logo} alt="Assistant logo preview" /> : 'SV'}</span>
                <div className={styles.logoActions}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                    <Upload size={15} /> {appearance.logo ? 'Replace' : 'Upload logo'}
                  </button>
                  {appearance.logo && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => update('appearance', 'logo')(null)}>
                      <X size={15} /> Remove
                    </button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={handleLogo} />
              </div>
              <p className="field-hint">Square image, under 200 KB. The SV monogram is used until you upload one.</p>
            </div>
          </SettingsCard>

        </div>

        <aside className={styles.aside} aria-label="Live preview">
          <div className={styles.asideLabel}>
            <span>Live preview</span>
            {dirty && <span style={{ color: 'var(--gold-dark)' }}>Unsaved</span>}
          </div>
          <ChatbotPreview settings={draft} />
          <p className={styles.asideNote}>
            {general.enabled === false ? 'The chatbot is turned off — the widget is hidden on your website until you turn it back on.' : 'Updates as you type. Save to apply to your website.'}
          </p>
        </aside>
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div
            className={styles.saveBar}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.22 }}
            role="region"
            aria-label="Unsaved changes"
          >
            <p>You have unsaved changes</p>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setDraft(saved);
                setErrors({});
              }}
            >
              Discard
            </button>
            {saveButton}
          </motion.div>
        )}
      </AnimatePresence>

    </>
  );
}
