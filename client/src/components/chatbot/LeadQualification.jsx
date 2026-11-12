import { ClipboardCheck } from 'lucide-react';
import { leadSummaryRows } from '../../utils/whatsapp.js';
import { FIELD_LABELS } from '../../utils/labels.js';

/**
 * The "business snapshot" the assistant builds up through conversation.
 * Shown once qualification is complete, so the visitor can see what was understood.
 */
export default function LeadQualification({ lead = {} }) {
  const rows = leadSummaryRows(lead);
  const extra = ['seoSituation', 'budget', 'contactMethod']
    .filter((key) => lead[key])
    .map((key) => ({ key, label: FIELD_LABELS[key], value: lead[key] }));
  const all = [...rows, ...extra];

  if (!all.length) return null;

  return (
    <section className="sv-lead-card" aria-label="Your business snapshot">
      <header className="sv-lead-card-head">
        <span className="sv-lead-card-icon"><ClipboardCheck size={16} /></span>
        <div>
          <h4>Your business snapshot</h4>
          <p>{all.length} details understood</p>
        </div>
      </header>
      <dl className="sv-lead-rows">
        {all.map((row) => (
          <div key={row.key} className="sv-lead-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="sv-lead-card-foot">Only shared with our team if you choose to continue on WhatsApp.</p>
    </section>
  );
}
