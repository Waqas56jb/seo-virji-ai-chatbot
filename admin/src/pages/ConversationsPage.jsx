import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, Download, FileText, MessagesSquare } from 'lucide-react';
import { DateRange, ErrorState, FilterTabs, PageHeader, Pagination, SearchInput } from '../components/shared/ui.jsx';
import Modal, { ConfirmDialog } from '../components/shared/Modal.jsx';
import { useToast } from '../components/shared/Toast.jsx';
import ConversationList from '../components/conversations/ConversationList.jsx';
import ConversationViewer from '../components/conversations/ConversationViewer.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { deleteConversation, exportConversations, getConversation, listConversations, setConversationStatus } from '../services/conversationService.js';
import { CONVERSATION_FILTERS } from '../utils/constants.js';
import styles from '../components/conversations/conversations.module.css';

const PAGE_SIZE = 30;

const EXPORTS = [
  { include: 'summary', icon: FileText, title: 'Summary CSV', description: 'One row per conversation: reference, dates, status, visitor, topic, AI summary and WhatsApp handoff.' },
  { include: 'messages', icon: MessagesSquare, title: 'Full messages CSV', description: 'One row per message, with the conversation reference, time, sender and full text.' },
];

export default function ConversationsPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isNarrow = useMediaQuery('(max-width: 900px)');

  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [showDates, setShowDates] = useState(false);
  const [page, setPage] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch, range.from, range.to]);

  const rangeInvalid = Boolean(range.from && range.to && range.from > range.to);
  const filters = { status: filter, search: debouncedSearch, from: range.from, to: range.to };

  const list = useAsync(
    () => (rangeInvalid ? Promise.resolve(null) : listConversations({ ...filters, page, pageSize: PAGE_SIZE })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, debouncedSearch, range.from, range.to, page, rangeInvalid],
  );

  // On wide screens, open the most recent conversation automatically.
  const firstId = list.data?.items?.[0]?.id;
  useEffect(() => {
    if (!conversationId && !isNarrow && firstId) navigate(`/conversations/${firstId}`, { replace: true });
  }, [conversationId, isNarrow, firstId, navigate]);

  const detail = useAsync(async () => (conversationId ? getConversation(conversationId) : null), [conversationId]);

  const view = isNarrow && conversationId ? 'detail' : 'list';
  const { reload: reloadList, setData: setListData } = list;
  const { setData: setDetailData } = detail;

  const toggleResolved = useCallback(
    async (conversation) => {
      const resolved = conversation.resolved || conversation.status === 'resolved';
      setStatusBusy(true);
      try {
        const result = await setConversationStatus(conversation.id, resolved ? 'active' : 'resolved');
        setDetailData(result);
        toast.success(resolved ? 'Conversation reopened' : 'Conversation marked as resolved');
        reloadList();
      } catch (err) {
        toast.error(resolved ? "Couldn't reopen the conversation" : "Couldn't mark as resolved", err.message);
      } finally {
        setStatusBusy(false);
      }
    },
    [toast, reloadList, setDetailData],
  );

  const confirmDelete = async () => {
    setDeleteBusy(true);
    try {
      await deleteConversation(deleting.id);
      toast.success('Conversation deleted', deleting.reference ? `Reference #${deleting.reference}` : undefined);
      const removedId = deleting.id;
      setDeleting(null);
      // Drop it locally first so the auto-open below never re-selects the deleted chat.
      setListData((d) => (d ? { ...d, items: d.items.filter((c) => c.id !== removedId), total: Math.max(0, (d.total || 1) - 1) } : d));
      setDetailData(null);
      navigate('/conversations', { replace: true });
      if (list.data?.items?.length === 1 && page > 1) setPage((p) => p - 1);
      else reloadList();
    } catch (err) {
      toast.error("Couldn't delete conversation", err.message);
    } finally {
      setDeleteBusy(false);
    }
  };

  const runExport = async (include) => {
    setExporting(include);
    try {
      await exportConversations({ ...filters, include });
      toast.success('Export ready', 'Your CSV file has been downloaded.');
      setExportOpen(false);
    } catch (err) {
      toast.error("Couldn't export conversations", err.message);
    } finally {
      setExporting(null);
    }
  };

  const hasFilters = filter !== 'all' || Boolean(debouncedSearch) || Boolean(range.from || range.to);
  const datesActive = Boolean(range.from || range.to);

  return (
    <>
      <PageHeader
        title="Conversations"
        description="See what visitors are asking your AI consultant."
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => setExportOpen(true)} disabled={rangeInvalid}>
            <Download size={16} /> Export
          </button>
        }
      />

      <div className={`card ${styles.split}`} data-view={view}>
        <div className={styles.listPane}>
          <div className={styles.listTools}>
            <div className={styles.listToolsRow}>
              <SearchInput value={search} onChange={setSearch} placeholder="Search names, messages or reference…" label="Search conversations" />
              <button
                type="button"
                className={`btn btn-sm ${datesActive ? 'btn-primary' : 'btn-secondary'} ${styles.filterToggle}`}
                aria-expanded={showDates}
                aria-controls="conv-dates"
                onClick={() => setShowDates((v) => !v)}
                title="Filter by date"
              >
                <CalendarDays size={15} />
                <span className="sr-only">Filter by date</span>
              </button>
            </div>
            {(showDates || datesActive) && (
              <div id="conv-dates">
                <DateRange from={range.from} to={range.to} onChange={setRange} idPrefix="conv-range" compact />
                {rangeInvalid && <p className="field-error" style={{ marginTop: 6 }}>The “From” date must be on or before the “To” date.</p>}
              </div>
            )}
            <FilterTabs options={CONVERSATION_FILTERS} value={filter} onChange={setFilter} counts={list.data?.counts} label="Filter conversations" wrap />
          </div>
          <div className={styles.listScroll}>
            {list.error && !list.data ? (
              <ErrorState compact title="Couldn't load conversations" error={list.error} onRetry={reloadList} />
            ) : (
              <ConversationList
                conversations={rangeInvalid ? [] : list.data?.items}
                loading={list.loading}
                selectedId={conversationId}
                onSelect={(id) => navigate(`/conversations/${id}`)}
                hasFilters={hasFilters}
              />
            )}
            {list.error && list.data && (
              <p className={`field-error ${styles.listError}`} role="alert">
                Couldn't refresh: {list.error.message}{' '}
                <button type="button" className="link" onClick={reloadList}>
                  Try again
                </button>
              </p>
            )}
          </div>
          <div className={styles.listFoot}>
            <Pagination page={list.data?.page || page} pages={list.data?.pages} total={list.data?.total} onChange={setPage} disabled={list.loading} label="Conversation pages" unit="conversations" />
          </div>
        </div>

        <div className={styles.viewerPane}>
          <ConversationViewer
            data={detail.data}
            loading={detail.loading}
            error={detail.error}
            onRetry={detail.reload}
            showBack={isNarrow}
            onBack={() => navigate('/conversations')}
            onToggleResolved={toggleResolved}
            onDelete={setDeleting}
            statusBusy={statusBusy}
          />
        </div>
      </div>

      <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="Export conversations" description={hasFilters ? 'Exports every conversation matching your current filters.' : 'Exports all conversations.'}>
        <div className={styles.exportOptions}>
          {EXPORTS.map(({ include, icon: Icon, title, description }) => (
            <button key={include} type="button" className={styles.exportOption} onClick={() => runExport(include)} disabled={Boolean(exporting)}>
              <span className={styles.exportIcon}>
                <Icon size={18} />
              </span>
              <span className={styles.exportText}>
                <strong>{exporting === include ? 'Preparing download…' : title}</strong>
                <small>{description}</small>
              </span>
              <Download size={16} className={styles.exportDl} />
            </button>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this conversation?"
        description={`All messages${deleting?.reference ? ` in conversation #${deleting.reference}` : ''} and its WhatsApp handoff records will be permanently deleted. Any lead from this chat is kept. This can't be undone.`}
        confirmLabel="Delete conversation"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
