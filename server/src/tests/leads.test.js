import { describe, expect, it } from 'vitest';
import { nextStatus, scoreLead, shouldCreateLead, statusFor } from '../services/leads/lead-qualification.service.js';
import { groundFacts, mergeFacts } from '../services/ai/memory.service.js';
import { buildHandoffMessage, buildWhatsAppUrl } from '../services/whatsapp/whatsapp.service.js';

describe('lead qualification', () => {
  it('scores transparently and caps at 100', () => {
    expect(scoreLead({})).toBe(0);
    expect(scoreLead({ challenge: 'x', website: 'a.com', goal: 'g', industry: 'i', email: 'a@b.co' }, 'ready')).toBe(100);
  });

  it('derives statuses and never overrides admin decisions or moves backwards', () => {
    expect(statusFor(20, {}, 'none')).toBe('new');
    expect(statusFor(35, {}, 'curious')).toBe('interested');
    expect(statusFor(70, { email: 'a@b.co' }, 'interested')).toBe('qualified');
    expect(nextStatus('qualified', 'interested')).toBe('qualified');
    expect(nextStatus('contacted', 'qualified')).toBe('contacted');
    expect(nextStatus('converted', 'new')).toBe('converted');
    expect(nextStatus(undefined, 'new')).toBe('new');
  });

  it('only creates a lead once there is a real need plus something identifying or clear interest', () => {
    expect(shouldCreateLead({ name: 'Sam' })).toBe(false);
    expect(shouldCreateLead({ challenge: 'no traffic' })).toBe(false);
    expect(shouldCreateLead({ challenge: 'no traffic', website: 'a.com' })).toBe(true);
    expect(shouldCreateLead({ goal: 'more leads' }, 'interested')).toBe(true);
  });
});

describe('fact grounding (no invented details)', () => {
  const said = 'I run a dental clinic in Leeds. My site is brightsmiledental.co.uk and I am Sarah.';

  it('drops details the visitor never typed', () => {
    const facts = groundFacts(
      mergeFacts({}, { name: 'Sarah', business_name: 'Bright Smile Dental', industry: 'healthcare', website: 'brightsmiledental.co.uk', email: 'x@y.com' }),
      said,
    );
    expect(facts).toEqual({ name: 'Sarah', website: 'brightsmiledental.co.uk' });
  });

  it('keeps industries in the visitor’s words and rejects an industry used as a business name', () => {
    const facts = groundFacts({ industry: 'dental clinic', business_name: 'dental clinic' }, said);
    expect(facts).toEqual({ industry: 'dental clinic' });
  });

  it('mergeFacts validates emails/phones and ignores placeholders', () => {
    expect(mergeFacts({}, { email: 'not-an-email', phone: '12', name: 'unknown', goal: 'More bookings' })).toEqual({ goal: 'More bookings' });
    expect(mergeFacts({ name: 'Sam' }, { name: null })).toEqual({ name: 'Sam' });
  });
});

describe('WhatsApp handoff', () => {
  it('builds an encoded wa.me link with only shared details', () => {
    const msg = buildHandoffMessage({ facts: { name: 'Sarah', website: 'example.com' }, summary: 'Wants more patients.' });
    expect(msg).toContain('• Name: Sarah');
    expect(msg).not.toContain('Business:');
    const url = buildWhatsAppUrl('+92 337 333 0774', msg);
    expect(url.startsWith('https://wa.me/923373330774?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toBe(msg);
  });

  it('refuses invalid numbers', () => {
    expect(buildWhatsAppUrl('', 'hi')).toBeNull();
    expect(buildWhatsAppUrl('123', 'hi')).toBeNull();
  });
});
