import { created, ok } from '../utils/response.js';
import { sendCsv } from '../utils/csv.js';
import { audit } from '../services/admin.service.js';
import * as leads from '../services/leads/lead.service.js';

export const list = async (req, res) => ok(res, { ...(await leads.listLeads(req.validatedQuery)), stats: await leads.leadStats() });
export const stats = async (req, res) => ok(res, await leads.leadStats());
export const get = async (req, res) => ok(res, await leads.getLead(req.params.id));

export const create = async (req, res) => {
  const lead = await leads.createLead(req.body);
  await audit(req.admin.id, 'lead.create', 'lead', lead.id);
  created(res, lead, 'Lead created');
};

export const update = async (req, res) => {
  const lead = await leads.updateLead(req.params.id, req.body);
  await audit(req.admin.id, 'lead.update', 'lead', req.params.id, { fields: Object.keys(req.body) });
  ok(res, lead, req.body.notes !== undefined && Object.keys(req.body).length === 1 ? 'Notes saved' : 'Lead updated');
};

export const remove = async (req, res) => {
  await leads.deleteLead(req.params.id);
  await audit(req.admin.id, 'lead.delete', 'lead', req.params.id);
  ok(res, {}, 'Lead deleted');
};

export const exportCsv = async (req, res) => {
  const rows = await leads.exportLeads(req.validatedQuery);
  await audit(req.admin.id, 'lead.export', 'lead', null, { rows: rows.length });
  sendCsv(res, `seo-virji-leads-${new Date().toISOString().slice(0, 10)}.csv`, rows);
};
