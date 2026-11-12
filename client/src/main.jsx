import { mountStandalone } from './widget/mount.jsx';

/**
 * The client app is the chatbot itself: a full-page, phone-style chat screen.
 * It uses the same components and Shadow DOM isolation as the embeddable widget
 * (built separately with `npm run build:widget` for seovirji.com).
 */
mountStandalone(document.getElementById('root'), {
  botId: import.meta.env.VITE_BOT_ID || 'seo-virji',
});
