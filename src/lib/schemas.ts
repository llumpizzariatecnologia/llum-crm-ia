import { z } from 'zod'

const maxStringMessage = (label: string, max: number) => `${label} deve ter no maximo ${max} caracteres.`

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
})

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
})

export const handoffSchema = z.object({
  reason: z.string().trim().min(3).max(240).optional(),
})

export const conversationStatusSchema = z.object({
  status: z.enum(['ai_active', 'human_active', 'handoff_requested', 'closed']),
})

export const simulateInboundSchema = z.object({
  customerName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(8).max(20),
  body: z.string().trim().min(1).max(2000),
  externalMessageId: z.string().trim().min(3).max(120).optional(),
})

export const crmSettingsSchema = z.object({
  assistantName: z.string().trim().min(2).max(60),
  tone: z.string().trim().min(4).max(200),
  aiEnabled: z.boolean(),
  handoffMessage: z.string().trim().min(10).max(500),
  businessContext: z.string().trim().min(10).max(2000),
  closingMessage: z.string().trim().min(10).max(500).optional().default(''),
})

export const agentProfileSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional().default(''),
  assistantName: z.string().trim().min(2).max(60),
  tone: z.string().trim().min(4).max(200),
  systemPrompt: z.string().trim().min(20).max(12000, maxStringMessage('System prompt', 12000)),
  businessContext: z.string().trim().min(10).max(3000, maxStringMessage('Contexto de negocio', 3000)),
  handoffMessage: z.string().trim().min(10).max(500, maxStringMessage('Mensagem de handoff', 500)),
  model: z.string().trim().min(2).max(80),
  temperature: z.coerce.number().min(0).max(2),
  aiEnabled: z.boolean(),
  handoffOnUnknown: z.boolean(),
  maxResponseChars: z.coerce.number().int().min(120).max(4000),
  status: z.enum(['draft', 'active', 'archived']),
})

export const knowledgeDocumentSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(120),
  category: z.string().trim().min(2).max(60),
  sourceType: z.enum(['faq', 'policy', 'menu', 'pricing', 'operations', 'custom']),
  content: z.string().trim().min(20).max(100000),
  summary: z.string().trim().max(600).optional().default(''),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  status: z.enum(['draft', 'published', 'archived']),
})

export const whatsappChannelConfigSchema = z.object({
  id: z.string().uuid().optional(),
  displayName: z.string().trim().min(2).max(80),
  phoneNumberId: z.string().trim().min(4).max(60),
  wabaId: z.string().trim().min(4).max(60),
  webhookUrl: z.string().trim().url().optional().or(z.literal('')).default(''),
  graphApiVersion: z.string().trim().min(2).max(20),
  verifiedName: z.string().trim().max(120).optional().default(''),
  qualityRating: z.string().trim().max(40).optional().default(''),
  status: z.enum(['draft', 'connected', 'attention', 'disconnected']),
})

export const whatsappTemplateButtonSchema = z.object({
  type: z.enum(['quick_reply', 'url', 'phone_number']),
  label: z.string().trim().min(1).max(25),
  value: z.string().trim().max(200).optional().default(''),
})

export const whatsappTemplateSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  metaName: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9_]+$/, 'Use apenas minúsculas, números e underscore'),
  category: z.enum(['marketing', 'utility', 'authentication']),
  language: z.string().trim().min(2).max(20),
  status: z.enum(['draft', 'ready_for_review', 'submitted', 'approved', 'rejected', 'paused']),
  headerType: z.enum(['none', 'text']),
  headerText: z.string().trim().max(60).optional().default(''),
  bodyText: z.string().trim().min(10).max(1024),
  footerText: z.string().trim().max(60).optional().default(''),
  buttons: z.array(whatsappTemplateButtonSchema).max(10).default([]),
  variables: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  complianceNotes: z.string().trim().max(800).optional().default(''),
})
