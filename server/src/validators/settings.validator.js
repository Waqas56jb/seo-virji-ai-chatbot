import { z } from 'zod';
import { AI_MODELS } from '../services/settings.service.js';

const hex = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, 'Use a hex colour like #0B1050');

export const general = z.object({
  chatbotName: z.string().trim().min(1).max(60),
  businessName: z.string().trim().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  description: z.string().trim().max(120),
  welcomeMessage: z.string().trim().min(1).max(1000),
  domain: z.string().trim().min(3).max(200),
  online: z.boolean(),
});
export const personality = z.object({
  tone: z.enum(['professional', 'friendly', 'empathetic', 'consultative']),
  style: z.enum(['concise', 'balanced', 'detailed']),
  behaviours: z.object({ natural: z.boolean(), followUps: z.boolean(), understandProblems: z.boolean(), avoidRobotic: z.boolean() }).partial(),
  instructions: z.string().max(2000).default(''),
  systemInstructions: z.string().max(4000).optional(),
});
export const whatsapp = z.object({
  enabled: z.boolean(),
  number: z.string().trim().regex(/^\+?[\d\s-]{0,20}$/, 'Digits only, with country code').transform((v) => v.replace(/\D/g, '')),
  welcomeMessage: z.string().trim().max(600).default(''),
  buttonLabel: z.string().trim().min(1).max(40),
}).refine((w) => !w.enabled || (w.number.length >= 8 && w.number.length <= 15), { message: 'Enter 8–15 digits including the country code', path: ['number'] });
export const appearance = z.object({
  primaryColor: hex,
  accentColor: hex,
  position: z.enum(['left', 'right']),
  title: z.string().trim().max(60),
  logo: z.string().max(300_000).nullable().optional(), // data URL or https URL
});

export const ai = z.object({
  model: z.enum(AI_MODELS),
  temperature: z.coerce.number().min(0).max(1.2),
  maxOutputTokens: z.coerce.number().int().min(200).max(1500),
  topK: z.coerce.number().int().min(2).max(12),
  minSimilarity: z.coerce.number().min(0.1).max(0.8),
  memoryLimit: z.coerce.number().int().min(6).max(40),
}).partial();

export const fullSettings = z.object({
  general: general.optional(),
  ai: ai.optional(),
  personality: personality.optional(),
  whatsapp: whatsapp.optional(),
  appearance: appearance.optional(),
});
