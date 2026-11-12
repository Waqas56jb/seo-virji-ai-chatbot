import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { DateRange, ErrorState, FilterTabs, PageHeader, Pagination, SearchInput } from '../components/shared/ui.jsx';
import { ConfirmDialog } from '../components/shared/Modal.jsx';
import { useToast } from '../components/shared/Toast.jsx';
import LeadTable from '../components/leads/LeadTable.jsx';
import LeadDetailPanel from '../components/leads/LeadDetailPanel.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { deleteLead, exportLeads, getLead, listLeads, saveLeadNotes, updateLeadStatus } from '../services/leadService.js';
import { LEAD_HANDOFF_FILTERS, LEAD_STATUSES, leadStatusMeta } from '../utils/constants.js';
import styles from './pages.module.css';
import lStyles from '../components/leads/leads.module.css';

const FILTERS = [{ value: 'all', label: 'All' }, ...LEAD_STATUSES.map(({ value, label }) => ({ value, label }))];
const PAGE_SIZE = 25;

export default function LeadsPage() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [handoff, setHandoff] = useState('all');
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const q = useDebouncedValue(search.trim(), 300);

  // Any filter change goes back to the first page.
  useEffect(() => {
    setPage(1);
  }, [filter, q, handoff, range.from, range.to]);

  const rangeInvalid = Boolean(range.from && range.to && range.from > range.to);
  const filters = { status: filter, search: q, handoff, from: range.from, to: range.to };

  const list = useAsync(
    () => (rangeInvalid ? Promise.resolve(null) : listLeads({ ...filters, page, pageSize: PAGE_SIZE })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, q, handoff, range.from, range.to, page, rangeInvalid],
  );
  const leads = list.data?.items;
  const stats = list.data?.stats;

  // The open lead may not be on the current page, so it is fetched on its own.
  const detail = useAsync(async () => (leadId ? getLead(leadId) : null), [leadId]);
  const selected = leadId ? leads?.find((l) => l.id === leadId) || (detail.data?.id === leadId ? detail.data : null) : null;

  const counts = useMemo(() => {
    if (!stats) return undefined;
    const out = { all: stats.total || 0 };
    LEAD_STATUSES.forEach((s) => {
      out[s.value] = stats.byStatus?.[s.value] || 0;
    });
    return out;
  }, [stats]);

  const patchLocal = (id, patch) => {
    list.setData((d) => (d ? { ...d, items: d.items.map((l) => (l.id === id ? { ...l, ...patch } : l)) } : d));
    detail.setData((d) => (d && d.id === id ? { ...d, ...patch } : d));
  };

  const changeStatus = async (lead, status) => {
    if (lead.status === status) return;
    const previous = lead.status;
    patchLocal(lead.id, { status });
    try {
      const updated = await updateLeadStatus(lead.id, status);
      patchLocal(lead.id, updated);
      toast.success('Status updated', `${lead.name} is now “${leadStatusMeta(status).label}”.`);
      list.reload(); // refresh counts (and the list if a status filter is active)
    } catch (err) {
      patchLocal(lead.id, { status: previous });
      toast.error("Couldn't update status", err.message || 'Please try again.');
    }
  };

  const saveNotes = async (lead, notes) => {
    const updated = await saveLeadNotes(lead.id, notes);
    patchLocal(lead.id, updated);
    toast.success('Notes saved', lead.name);
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    try {
      await deleteLead(deleting.id);
      toast.success('Lead deleted', deleting.name);
      if (leadId === deleting.id) navigate('/leads');
      setDeleting(null);
      // Step back a page if the last lead on this page was removed.
      if (leads?.length === 1 && page > 1) setPage((p) => p - 1);
      else list.reload();
    } catch (err) {
      toast.error("Couldn't delete lead", err.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportLeads(filters);
      toast.success('Export ready', 'Your CSV file has been downloaded.');
    } catch (err) {
      toast.error("Couldn't export leads", err.message);
    } finally {
      setExporting(false);
    }
  };

  const hasFilters = filter !== 'all' || Boolean(q) || handoff !== 'all' || Boolean(range.from || range.to);

  return (
    <>
      <PageHeader
        title="Potential Clients"
        description="Manage people interested in SEO Virji's services."
        actions={
          <button type="button" className="btn btn-secondary" onClick={handleExport} disabled={exporting || rangeInvalid}>
            <Download size={16} /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        }
      />

      <div className={styles.toolbar}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, business, email, notes…" label="Search leads" />
        <FilterTabs options={FILTERS} value={filter} onChange={setFilter} counts={counts} label="Filter by status" />
      </div>

      <div className={lStyles.filters}>
        <label className={lStyles.filterField} htmlFor="lead-handoff">
          <span>WhatsApp</span>
          <select id="lead-handoff" className="select" value={handoff} onChange={(e) => setHandoff(e.target.value)}>
            {LEAD_HANDOFF_FILTERS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <DateRange from={range.from} to={range.to} onChange={setRange} idPrefix="lead-range" />
      </div>
      {rangeInvalid && (
        <p className="field-error" role="alert" style={{ marginTop: -8, marginBottom: 14 }}>
          The “From” date must be on or before the “To” date.
        </p>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        {list.error && !leads ? (
          <ErrorState title="Couldn't load leads" error={list.error} onRetry={list.reload} />
        ) : (
          <>
            <LeadTable
              leads={rangeInvalid ? [] : leads}
              loading={list.loading}
              onOpen={(id) => navigate(`/leads/${id}`)}
              onStatusChange={changeStatus}
              onDelete={setDeleting}
              hasFilters={hasFilters}
            />
            {list.error && leads && (
              <p className="field-error" role="alert" style={{ padding: '10px 16px' }}>
                Couldn't refresh: {list.error.message}{' '}
                <button type="button" className="link" onClick={list.reload}>
                  Try again
                </button>
              </p>
            )}
            <Pagination page={list.data?.page || page} pages={list.data?.pages} total={list.data?.total} onChange={setPage} disabled={list.loading} label="Leads pages" unit="leads" />
          </>
        )}
      </div>

      <LeadDetailPanel
        lead={selected}
        onClose={() => navigate('/leads')}
        onStatusChange={changeStatus}
        onSaveNotes={saveNotes}
        onDelete={setDeleting}
      />
      {leadId && !selected && detail.error && !detail.loading && (
        <p className="field-error" role="alert" style={{ marginTop: 12 }}>
          Couldn't open that lead: {detail.error.message}
        </p>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this lead?"
        description={`“${deleting?.name}” and their internal notes will be permanently deleted. Their conversation is kept. This can't be undone.`}
        confirmLabel="Delete lead"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
