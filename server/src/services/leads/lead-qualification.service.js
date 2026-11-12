/**
 * Simple, transparent qualification score (0–100). It is a prioritisation hint for the
 * team, not a prediction of conversion.
 */
const ADMIN_OWNED = new Set(['contacted', 'converted', 'not_interested']);
const ORDER = ['new', 'interested', 'qualified'];

export function scoreLead(facts = {}, interest = 'none') {
  let score = 0;
  if (facts.challenge) score += 20; // clear business need
  if (facts.website) score += 15; // existing website
  if (facts.goal) score += 15; // specific growth objective
  if (facts.business_name || facts.industry) score += 10;
  if (interest === 'interested') score += 15; // interest in professional SEO
  if (interest === 'ready') score += 25; // ready to discuss next steps
  if (facts.email || facts.phone) score += 15; // contact details voluntarily provided
  return Math.min(100, score);
}

export function statusFor(score, facts = {}, interest = 'none') {
  if (score >= 60 && (facts.email || facts.phone || interest === 'ready')) return 'qualified';
  if (score >= 30 || interest === 'interested' || interest === 'ready') return 'interested';
  return 'new';
}

/** Automatic statuses only ever move forward, and never override what an admin set. */
export function nextStatus(current, proposed) {
  if (!current) return proposed;
  if (ADMIN_OWNED.has(current)) return current;
  return ORDER.indexOf(proposed) > ORDER.indexOf(current) ? proposed : current;
}

/** A lead is worth saving once there is a real need plus something identifying or clear interest. */
export function shouldCreateLead(facts = {}, interest = 'none') {
  const identifying = facts.name || facts.business_name || facts.website || facts.email || facts.phone;
  return Boolean((facts.challenge || facts.goal) && (identifying || interest === 'interested' || interest === 'ready'));
}
