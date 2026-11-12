import { z } from 'zod';

export const idParam = z.object({ id: z.string().uuid() });
export const createSource = z.object({
  title: z.string().trim().min(2).max(200),
  content: z.string().trim().min(10).max(50_000),
});
export const updateSource = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  content: z.string().max(50_000).optional(),
});
export const sourceStatus = z.object({ status: z.enum(['active', 'inactive']) });
export const recrawlSource = z.object({ discardEdits: z.boolean().optional() });
export const createFaq = z.object({
  question: z.string().trim().min(5).max(300),
  answer: z.string().trim().min(5).max(3000),
  category: z.string().trim().max(60).optional(),
});
export const updateFaq = createFaq.partial().extend({ isActive: z.boolean().optional() });
export const listQuery = z.object({
  type: z.enum(['website', 'manual', 'faq', 'document', 'business_information']).optional(),
  status: z.enum(['active', 'inactive', 'all']).optional(),
  embedding: z.enum(['complete', 'pending', 'failed', 'not_configured']).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export const crawlStart = z.object({
  url: z.string().trim().url().max(500).optional(),
  singlePage: z.boolean().optional(),
  mode: z.enum(['incremental', 'full', 'retry']).optional(),
});
