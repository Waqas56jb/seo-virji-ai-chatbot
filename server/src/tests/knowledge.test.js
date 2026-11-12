import { describe, expect, it } from 'vitest';
import { describePersonality } from '../services/ai/personality.service.js';
import { citedSources } from '../services/ai/rag.service.js';
import * as settingsValidators from '../validators/settings.validator.js';
import * as knowledgeValidators from '../validators/knowledge.validator.js';

describe('validators', () => {
  it('validates WhatsApp numbers only when the handoff is enabled', () => {
    const base = { welcomeMessage: '', buttonLabel: 'Continue on WhatsApp' };
    expect(settingsValidators.whatsapp.safeParse({ ...base, enabled: true, number: '+92 337 3330774' }).success).toBe(true);
    expect(settingsValidators.whatsapp.safeParse({ ...base, enabled: true, number: '123' }).success).toBe(false);
    expect(settingsValidators.whatsapp.safeParse({ ...base, enabled: false, number: '' }).success).toBe(true);
  });

  it('validates colours and FAQ content', () => {
    expect(settingsValidators.appearance.safeParse({ primaryColor: 'red', accentColor: '#C9A132', position: 'right', title: 'x' }).success).toBe(false);
    expect(knowledgeValidators.createFaq.safeParse({ question: 'Hi?', answer: 'ok' }).success).toBe(false);
    expect(knowledgeValidators.createFaq.safeParse({ question: 'Do you do local SEO?', answer: 'Yes, we do.' }).success).toBe(true);
  });
});

describe('personality', () => {
  it('maps admin settings to concrete guidance', () => {
    const p = describePersonality({ personality_tone: 'empathetic', response_style: 'concise', behaviours: { followUps: true, avoidRobotic: false } });
    expect(p.tone).toMatch(/feelings/);
    expect(p.style).toMatch(/short/);
    expect(p.behaviours).toHaveLength(1);
  });
});

describe('source citations', () => {
  it('maps model source ids to unique public references (links only for website pages)', () => {
    const chunks = [
      { sourceId: 'a', title: 'Home', url: 'https://seovirji.com/', type: 'website' },
      { sourceId: 'a', title: 'Home', url: 'https://seovirji.com/', type: 'website' },
      { sourceId: 'b', title: 'Pricing', url: null, type: 'business_information' },
    ];
    expect(citedSources(chunks, ['S1', 'S2', 'S3', 'S9'])).toEqual([
      { title: 'Home', url: 'https://seovirji.com/', type: 'website' },
      { title: 'Pricing', url: null, type: 'business_information' },
    ]);
  });
});
