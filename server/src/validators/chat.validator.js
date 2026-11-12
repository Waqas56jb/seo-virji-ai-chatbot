import { z } from 'zod';
import { env } from '../config/env.js';

export const visitorId = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, 'Invalid visitor id');
export const conversationId = z.string().uuid('Invalid conversation id');

export const startChat = z.object({
  visitorId,
  resume: z.object({ conversationId, sessionToken: z.string().min(20).max(128) }).optional(),
  resumeOnly: z.boolean().optional(),
  source: z.string().max(40).optional(),
  pageUrl: z.string().url().max(500).optional(),
});

export const sendMessage = z.object({
  conversationId,
  visitorId,
  message: z.string().trim().min(1, 'Message cannot be empty').max(env.MAX_MESSAGE_LENGTH, `Message is too long (max ${env.MAX_MESSAGE_LENGTH} characters)`),
  clientMessageId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const conversationParams = z.object({ conversationId });
export const visitorQuery = z.object({ visitorId });

export const handoff = z.object({ visitorId, name: z.string().trim().max(60).optional() });
export const feedback = z.object({
  visitorId,
  messageId: z.string().uuid().optional(),
  rating: z.union([z.literal(1), z.literal(-1)]),
  text: z.string().trim().max(1000).optional(),
});
export const visitorBody = z.object({ visitorId });
export const handoffParams = z.object({ conversationId, handoffId: z.string().uuid('Invalid handoff id') });
