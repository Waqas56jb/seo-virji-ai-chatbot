import { badRequest } from '../utils/errors.js';
import { created, ok } from '../utils/response.js';
import { audit } from '../services/admin.service.js';
import * as knowledge from '../services/knowledge/knowledge.service.js';
import { embedMissingChunks, reindexAll } from '../services/knowledge/source-management.service.js';
import { serializeJob, startCrawl } from '../services/crawler/crawler.service.js';

export const list = async (req, res) => {
  const result = await knowledge.listSources(req.validatedQuery);
  const status = await knowledge.knowledgeStatus();
  ok(res, Array.isArray(result) ? { sources: result, status } : { ...result, sources: result.items, status });
};
export const get = async (req, res) => ok(res, await knowledge.getSource(req.params.id));

export const create = async (req, res) => {
  const source = await knowledge.createManualSource(req.body);
  await audit(req.admin.id, 'knowledge.create', 'knowledge_source', source.id);
  created(res, source, 'Knowledge added');
};

export const update = async (req, res) => {
  const source = await knowledge.updateSource(req.params.id, req.body);
  await audit(req.admin.id, 'knowledge.update', 'knowledge_source', req.params.id);
  ok(res, source, 'Knowledge updated');
};

export const setStatus = async (req, res) => {
  const source = await knowledge.setSourceStatus(req.params.id, req.body.status);
  await audit(req.admin.id, `knowledge.${req.body.status === 'active' ? 'activate' : 'deactivate'}`, 'knowledge_source', req.params.id);
  ok(res, source, req.body.status === 'active' ? 'Knowledge activated' : 'Knowledge deactivated — the AI no longer uses it');
};

export const reprocess = async (req, res) => {
  const result = await knowledge.reprocessSource(req.params.id);
  await audit(req.admin.id, 'knowledge.reprocess', 'knowledge_source', req.params.id);
  ok(res, result, result.embeddingStatus === 'complete' ? 'Embeddings regenerated' : `Embedding status: ${result.embeddingStatus}`);
};

/** Re-crawls one website page now (optionally discarding the owner's edits first). */
export const recrawl = async (req, res) => {
  const source = await knowledge.getSource(req.params.id);
  if (source.type !== 'website' || !source.url) throw badRequest('Only website pages can be re-crawled.');
  if (req.body?.discardEdits) await knowledge.revertWebsiteEdit(req.params.id);
  const job = await startCrawl({ url: source.url, trigger: 'admin', singlePage: true });
  await audit(req.admin.id, 'knowledge.recrawl', 'knowledge_source', req.params.id, { url: source.url, discardEdits: Boolean(req.body?.discardEdits) });
  created(res, serializeJob(job), 'Page re-crawl started');
};

export const remove = async (req, res) => {
  await knowledge.deleteSource(req.params.id);
  await audit(req.admin.id, 'knowledge.delete', 'knowledge_source', req.params.id);
  ok(res, {}, 'Knowledge removed');
};

export const retryEmbeddings = async (req, res) => {
  const result = await knowledge.retryFailedEmbeddings();
  await audit(req.admin.id, 'knowledge.retry_embeddings', 'knowledge', null, result);
  ok(res, result, result.sources ? `Re-processed ${result.sources} record(s)` : 'Nothing needed re-processing');
};

export const listFaqs = async (req, res) => ok(res, await knowledge.listFaqs());

export const createFaq = async (req, res) => {
  const faq = await knowledge.createFaq(req.body);
  await audit(req.admin.id, 'faq.create', 'faq', faq.id);
  created(res, faq, 'FAQ added');
};

export const updateFaq = async (req, res) => {
  const faq = await knowledge.updateFaq(req.params.id, req.body);
  await audit(req.admin.id, 'faq.update', 'faq', req.params.id);
  ok(res, faq, 'FAQ updated');
};

export const deleteFaq = async (req, res) => {
  await knowledge.deleteFaq(req.params.id);
  await audit(req.admin.id, 'faq.delete', 'faq', req.params.id);
  ok(res, {}, 'FAQ deleted');
};

/** Fills missing embeddings, or fully re-chunks + re-embeds with { full: true }. */
export const reindex = async (req, res) => {
  const result = req.body?.full ? await reindexAll() : await embedMissingChunks();
  await audit(req.admin.id, 'knowledge.reindex', 'knowledge', null, { full: Boolean(req.body?.full) });
  ok(res, result, 'Knowledge re-indexed');
};
