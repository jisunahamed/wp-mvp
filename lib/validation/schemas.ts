import { z } from 'zod';

export const sendMessageSchema = z.object({
  session_id: z.string().uuid({ message: "Invalid session_id format" }),
  to: z.string().regex(/^\d{10,15}$/, { message: "Invalid phone number format (10-15 digits)" }),
  text: z.string().min(1, { message: "Message text cannot be empty" }).max(4096, { message: "Message text too long" })
});

export const webhookSchema = z.object({
  webhook_url: z.string().url({ message: "Invalid URL format" }).startsWith('https://', { message: "Webhook URL must be HTTPS" })
});

export const createSessionSchema = z.object({
  session_name: z.string().min(3).max(50).regex(/^[a-z0-9-_]+$/, { message: "Session name must be alphanumeric with dashes/underscores" })
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});
