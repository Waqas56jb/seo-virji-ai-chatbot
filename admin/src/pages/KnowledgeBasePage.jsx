import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookText, Database, FilePlus2, Globe, HelpCircle, Plus } from 'lucide-react';
import { EmptyState, ErrorState, PageHeader } from '../components/shared/ui.jsx';
import { ConfirmDialog } from '../components/shared/Modal.jsx';
import { useToast } from '../components/shared/Toast.jsx';
import WebsiteSyncCard from '../components/knowledge/WebsiteSyncCard.jsx';
import WebsiteSourceList from '../components/knowledge/WebsiteSourceList.jsx';
import KnowledgeCard, { KnowledgeCardSkeleton, SectionEditor } from '../components/knowledge/KnowledgeCard.jsx';
import AddKnowledgeModal from '../components/knowledge/AddKnowledgeModal.jsx';
import FAQManager from '../components/knowledge/FAQManager.jsx';
import KnowledgeRecords from '../components/knowledge/KnowledgeRecords.jsx';
import { MODE_LABELS, isActiveJob } from '../components/knowledge/crawlMeta.js';
import { useAsync } from '../hooks/useAsync.js';
import {
  cancelCrawl,
  createKnowledge,
  deleteKnowledge,
  fullRecrawl,
  getCrawlStatus,
  listFaqs,
  listKnowledge,
  retryFailedPages,
  startCrawl,
  syncWebsite,
  updateKnowledge,
} from '../services/knowledgeService.js';
import styles from './pages.module.css';
import kStyles from '../components/knowledge/knowledge.module.css';

const SECTION_ORDER = ['about', 'services', 'expertise', 'pricing', 'packages', 'consultation', 'policies', 'contact', 'hours'];

const ACTIONS = {
  sync: { run: syncWebsite, started: ['Website sync started', 'Only new or changed pages are re-read.'], failed: "Couldn't start the sync" },
  full: { run: fullRecrawl, started: ['Full re-crawl started', 'Every page is being read again — this can take several minutes.'], failed: "Couldn't start the full re-crawl" },
  retry: { run: retryFailedPages, started: ['Retrying failed pages', 'Pages that failed last time are being read again.'], failed: "Couldn't retry failed pages" },
};

function SectionHead({ step, id, title, description, action }) {
  return (
    <div className={styles.kbSectionHead}>
      <div>
        <h2 className={styles.kbTitle} id={id}>
          <span className={styles.kbStep}>{step}</span>
          {title}
        </h2>
        <p className={styles.kbDescription}>{description}</p>
      </div>
      {action}
    </div>
  );
}

export default function KnowledgeBasePage() {
  const toast = useToast();
  const knowledge = useAsync(listKnowledge, []);
  const faqs = useAsync(listFaqs, []);
  const crawl = useAsync(getCrawlStatus, []);
  const [editing, setEditing] = useState(null);
  const [recordsKey, setRecordsKey] = useState(0);
  const [faqFormOpen, setFaqFormOpen] = useState(false);
  const [addingDoc, setAddingDoc] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [pendingUrl, setPendingUrl] = useState(null);
  const wasRunning = useRef(false);

  const sources = knowledge.data?.sources || [];
  const websitePages = sources.filter((s) => s.type === 'website');
  const sections = sources
    .filter((s) => s.type === 'business_information')
    .sort((a, b) => {
      const ia = SECTION_ORDER.indexOf(a.sectionKey);
      const ib = SECTION_ORDER.indexOf(b.sectionKey);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  const documents = sources.filter((s) => s.type === 'manual' || s.type === 'document');

  const latestJob = crawl.data?.latest;
  const running = isActiveJob(latestJob);

  const { reload: reloadCrawl } = crawl;
  const { reload: reloadKnowledge } = knowledge;
  const { reload: reloadFaqs, setData: setFaqData } = faqs;
  const refreshRecords = useCallback(() => setRecordsKey((k) => k + 1), []);

  // Poll while a sync is queued/running (polling also keeps serverless syncs moving);
  // refresh the knowledge when it finishes.
  useEffect(() => {
    if (running) {
      wasRunning.current = true;
      const t = setInterval(reloadCrawl, 2000);
      return () => clearInterval(t);
    }
    if (wasRunning.current) {
      wasRunning.current = false;
      setPendingUrl(null);
      reloadKnowledge();
      refreshRecords();
      const label = latestJob?.mode === 'single' ? 'Page sync' : MODE_LABELS[latestJob?.mode] || 'Website sync';
      if (latestJob?.status === 'completed') {
        toast.success(
          latestJob.mode === 'single' ? 'Page updated' : 'Website knowledge updated',
          `${latestJob.pagesProcessed ?? 0} processed · ${latestJob.pagesFailed ?? 0} failed · ${latestJob.pagesSkipped ?? 0} skipped.`,
        );
      }
      if (latestJob?.status === 'failed') toast.error(`${label} failed`, latestJob.error || 'Existing knowledge was kept.');
      if (latestJob?.status === 'cancelled') toast.info(`${label} cancelled`, 'Existing knowledge was kept.');
    }
    return undefined;
  }, [running, latestJob, reloadCrawl, reloadKnowledge, refreshRecords, toast]);

  const runAction = useCallback(
    async (kind) => {
      const action = ACTIONS[kind];
      setBusyAction(kind);
      try {
        await action.run();
        toast.info(...action.started);
        reloadCrawl();
      } catch (err) {
        // 409 = a sync is already running; 400 = e.g. no failed pages to retry.
        toast.error(action.failed, err.message);
        if (err.status === 409) reloadCrawl();
      } finally {
        setBusyAction(null);
      }
    },
    [toast, reloadCrawl],
  );

  const refreshAfterRecordChange = useCallback(() => {
    reloadKnowledge();
    reloadFaqs();
  }, [reloadKnowledge, reloadFaqs]);

  const changeFaqs = useCallback(
    (updater) => {
      setFaqData(updater);
      refreshRecords();
      reloadKnowledge();
    },
    [setFaqData, refreshRecords, reloadKnowledge],
  );

  const cancel = async (id) => {
    try {
      await cancelCrawl(id);
      toast.info('Cancelling sync…', 'Pages already read are kept.');
      reloadCrawl();
    } catch (err) {
      toast.error("Couldn't cancel", err.message);
    }
  };

  const addPage = async (url) => {
    await startCrawl({ url, singlePage: true });
    setPendingUrl(url);
    toast.success('Page added', 'Your AI consultant is reading it now.');
    reloadCrawl();
  };

  const removePage = async (page) => {
    await deleteKnowledge(page.id);
    knowledge.setData((d) => ({ ...d, sources: d.sources.filter((s) => s.id !== page.id) }));
    refreshRecords();
    toast.success('Page removed', page.title);
  };

  const saveSection = async (id, content) => {
    try {
      const updated = await updateKnowledge(id, { content });
      knowledge.setData((d) => ({ ...d, sources: d.sources.map((s) => (s.id === id ? { ...s, ...updated } : s)) }));
      toast.success('Changes saved', `${updated.title} is up to date — your AI will use it right away.`);
      setEditing(null);
      refreshRecords();
    } catch (err) {
      toast.error("Couldn't save", err.message);
    }
  };

  const addDocument = async (doc) => {
    const created = await createKnowledge(doc);
    knowledge.setData((d) => ({ ...d, sources: [...d.sources, created] }));
    toast.success('Knowledge added', created.title);
    setAddingDoc(false);
    refreshRecords();
  };

  const removeDocument = async () => {
    try {
      await deleteKnowledge(deletingDoc.id);
      knowledge.setData((d) => ({ ...d, sources: d.sources.filter((s) => s.id !== deletingDoc.id) }));
      toast.success('Knowledge removed', deletingDoc.title);
      refreshRecords();
    } catch (err) {
      toast.error("Couldn't remove", err.message);
    } finally {
      setDeletingDoc(null);
    }
  };

  const counts = useMemo(
    () => [
      { href: '#kb-website', icon: Globe, label: 'website pages', value: knowledge.data ? websitePages.length : undefined },
      { href: '#kb-business', icon: BookText, label: 'business sections filled', value: knowledge.data ? sections.filter((s) => s.content).length : undefined },
      { href: '#kb-docs', icon: FilePlus2, label: 'extra documents', value: knowledge.data ? documents.length : undefined },
      { href: '#kb-faqs', icon: HelpCircle, label: 'FAQs', value: faqs.data?.length },
      { href: '#kb-records', icon: Database, label: 'knowledge chunks', value: knowledge.data?.status?.chunks },
    ],
    [knowledge.data, websitePages.length, sections, documents.length, faqs.data],
  );
  const failedEmbeddings = knowledge.data?.status?.failed_embeddings || 0;

  const primaryUrl = crawl.data?.websiteUrl || (latestJob?.websiteUrl && !latestJob.singlePage ? latestJob.websiteUrl : 'https://seovirji.com/');

  return (
    <>
      <PageHeader title="Knowledge Base" description="Manage the information your AI consultant uses to answer customer questions." />

      {knowledge.error && (
        <div className="card" style={{ marginBottom: 20 }}>
          <ErrorState compact title="Couldn't load the knowledge base" error={knowledge.error} onRetry={reloadKnowledge} />
        </div>
      )}

      <div className={styles.kbSummary}>
        {counts.map(({ href, icon: Icon, label, value }) => (
          <a key={href} href={href} className={styles.kbChip}>
            <Icon size={15} />
            <b>{value ?? '–'}</b> {label}
          </a>
        ))}
        {failedEmbeddings > 0 && (
          <a href="#kb-records" className={`${styles.kbChip} ${styles.kbChipWarn}`}>
            <AlertTriangle size={15} />
            <b>{failedEmbeddings}</b> with failed embeddings
          </a>
        )}
      </div>

      <section className={styles.kbSection} id="kb-website" aria-labelledby="kb-website-title">
        <SectionHead step="A" id="kb-website-title" title="Website Content" description="Pages from your website that the AI reads to understand your business." />
        <WebsiteSyncCard
          status={crawl.data}
          loading={crawl.loading}
          error={crawl.error}
          onRetryLoad={reloadCrawl}
          onAction={runAction}
          onCancel={cancel}
          busyAction={busyAction}
        />
        <WebsiteSourceList
          primaryUrl={primaryUrl}
          pages={websitePages}
          loading={knowledge.loading && !knowledge.data}
          pendingUrl={running && latestJob?.singlePage ? pendingUrl || latestJob.url || latestJob.websiteUrl : null}
          allowedHosts={crawl.data?.allowedHosts}
          onAdd={addPage}
          onRemove={removePage}
        />
      </section>

      <section className={styles.kbSection} id="kb-business" aria-labelledby="kb-business-title">
        <SectionHead step="B" id="kb-business-title" title="Business Information" description="Tell your AI consultant about your business in your own words. This takes priority over website text." />
        <div className={kStyles.kGrid}>
          {knowledge.loading && !knowledge.data
            ? [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => <KnowledgeCardSkeleton key={i} />)
            : sections.map((section) => <KnowledgeCard key={section.id} section={section} onEdit={setEditing} />)}
        </div>
      </section>

      <section className={styles.kbSection} id="kb-docs" aria-labelledby="kb-docs-title">
        <SectionHead
          step="C"
          id="kb-docs-title"
          title="Additional Knowledge"
          description="Packages, case studies, processes — anything else the AI should know."
          action={
            <button type="button" className="btn btn-secondary" onClick={() => setAddingDoc(true)}>
              <Plus size={17} /> Add knowledge
            </button>
          }
        />
        {knowledge.data && documents.length === 0 ? (
          <div className="card">
            <EmptyState compact icon={FilePlus2} title="No extra knowledge yet" description="Add details that aren't on your website, like package inclusions or how onboarding works." />
          </div>
        ) : (
          <div className={kStyles.kGrid}>
            {documents.map((doc) => (
              <KnowledgeCard key={doc.id} section={doc} onEdit={setEditing} onDelete={setDeletingDoc} />
            ))}
          </div>
        )}
      </section>

      <section className={styles.kbSection} id="kb-faqs" aria-labelledby="kb-faqs-title">
        <SectionHead
          step="D"
          id="kb-faqs-title"
          title="FAQs"
          description="Common questions and the answers you'd like your AI consultant to give."
          action={
            <button type="button" className="btn btn-gold" onClick={() => setFaqFormOpen(true)}>
              <Plus size={17} /> Add New FAQ
            </button>
          }
        />
        {faqs.error && !faqs.data ? (
          <div className="card">
            <ErrorState compact title="Couldn't load FAQs" error={faqs.error} onRetry={reloadFaqs} />
          </div>
        ) : (
          <FAQManager faqs={faqs.data || []} loading={faqs.loading && !faqs.data} onChange={changeFaqs} formOpen={faqFormOpen} onFormOpenChange={setFaqFormOpen} />
        )}
      </section>

      <section className={styles.kbSection} id="kb-records" aria-labelledby="kb-records-title">
        <SectionHead
          step="E"
          id="kb-records-title"
          title="Knowledge Records"
          description="Everything your AI consultant can draw on. View, edit, switch off, re-crawl or re-embed any record."
        />
        <KnowledgeRecords refreshKey={recordsKey} onChanged={refreshAfterRecordChange} onCrawlStarted={reloadCrawl} crawlRunning={running} />
      </section>

      <SectionEditor section={editing} onClose={() => setEditing(null)} onSave={saveSection} />
      <AddKnowledgeModal open={addingDoc} onClose={() => setAddingDoc(false)} onSave={addDocument} />
      <ConfirmDialog
        open={Boolean(deletingDoc)}
        title="Remove this knowledge?"
        description={`Your AI consultant will stop using “${deletingDoc?.title}”.`}
        confirmLabel="Remove"
        onConfirm={removeDocument}
        onClose={() => setDeletingDoc(null)}
      />
    </>
  );
}
