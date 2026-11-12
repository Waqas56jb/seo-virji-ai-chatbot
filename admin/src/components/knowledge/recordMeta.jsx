import { StatusBadge } from '../shared/ui.jsx';

export const TYPE_LABELS = {
  website: 'Website page',
  manual: 'Manual',
  faq: 'FAQ',
  document: 'Document',
  business_information: 'Business info',
};

export const TYPE_TONES = {
  website: 'blue',
  manual: 'violet',
  faq: 'gold',
  document: 'violet',
  business_information: 'navy',
};

export const TYPE_FILTERS = [
  { value: '', label: 'All types' },
  { value: 'website', label: 'Website pages' },
  { value: 'business_information', label: 'Business information' },
  { value: 'manual', label: 'Manual knowledge' },
  { value: 'document', label: 'Documents' },
  { value: 'faq', label: 'FAQs' },
];

export const ACTIVE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

/** Indexing status shown for a record (inactive overrides everything). */
export function recordStatusMeta(record) {
  if (record.sourceStatus === 'inactive' || record.status === 'inactive') return { label: 'Inactive', tone: 'gray' };
  switch (record.status) {
    case 'indexed':
      return { label: 'Indexed', tone: 'green' };
    case 'indexing':
      return { label: 'Indexing…', tone: 'yellow' };
    case 'failed':
      return { label: 'Embedding failed', tone: 'red' };
    case 'not_configured':
      return { label: 'Text only', tone: 'gray' };
    default:
      return { label: record.status ? String(record.status).replace(/_/g, ' ') : 'Unknown', tone: 'gray' };
  }
}

export function RecordBadges({ record, withType = true }) {
  const st = recordStatusMeta(record);
  return (
    <>
      {withType && (
        <StatusBadge tone={TYPE_TONES[record.type] || 'gray'} dot={false}>
          {TYPE_LABELS[record.type] || record.type}
        </StatusBadge>
      )}
      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
      {record.adminEdited && (
        <StatusBadge tone="gold" dot={false}>
          Admin edited
        </StatusBadge>
      )}
      {record.websiteChangedSinceEdit && (
        <span title="The website text changed after you edited this page. Re-crawl and discard your edits to use the new website text.">
          <StatusBadge tone="yellow" dot={false}>
            Website changed
          </StatusBadge>
        </span>
      )}
      {record.removedFromWebsite && (
        <StatusBadge tone="red" dot={false}>
          Removed from website
        </StatusBadge>
      )}
    </>
  );
}
