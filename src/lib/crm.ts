import 'server-only'

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { decrypt, encrypt, maskCredential } from '@/lib/encryption'
import {
  CRM_CONFIG_PROVIDER,
  DEFAULT_CLOSING_MESSAGE,
  DEFAULT_WORKSPACE_ID,
  KNOWN_INTEGRATION_PROVIDERS,
} from '@/lib/constants'
import { getServerSupabaseClient } from '@/lib/server/supabase'
import {
  getPrimaryAgentProfile,
  getWhatsappChannelConfig,
  getWhatsappChannelConfigByPhoneNumberId,
} from '@/lib/workspace-admin'
import { searchKnowledgeMatches, type KnowledgeMatch } from '@/lib/knowledge-rag'
import { checkAvailability, type AvailabilityResult } from '@/lib/availability'
import type {
  AgentRun,
  AgentProfile,
  Conversation,
  ConversationWithCustomer,
  CrmSettings,
  Customer,
  DashboardStats,
  Handoff,
  HandoffWithRelations,
  Integration,
  Interaction,
  Json,
  Lead,
  LeadWithRelations,
  WebhookEvent,
  WhatsappChannelConfig,
} from '@/types/database'

type ClassifiedIntent =
  | 'greeting'
  | 'menu_question'
  | 'pricing_question'
  | 'opening_hours'
  | 'location_question'
  | 'reservation_interest'
  | 'birthday_interest'
  | 'kids_area_question'
  | 'complaint'
  | 'human_request'
  | 'unclear'
  | 'other'

type ClassificationResult = {
  intent: ClassifiedIntent
  confidence: number
  shouldCreateLead: boolean
  shouldHandoff: boolean
  reply: string
  routeReason: string
  leadSummary?: string
  extractedData?: Record<string, unknown>
  source: 'provider' | 'openai' | 'heuristic'
  knowledgeDocumentIds: string[]
  knowledgeChunkIds: string[]
  modelUsed?: string
  providerUsed?: string
}

type ConversationContextTurn = {
  direction: Interaction['direction']
  senderType: Interaction['sender_type']
  body: string
  createdAt: string
}

export const defaultCrmSettings: CrmSettings = {
  assistantName: 'Marcos',
  tone: 'acolhedor, simpático, claro e objetivo',
  aiEnabled: true,
  handoffMessage:
    'Perfeito! Vou chamar um atendente da LLUM pra te ajudar melhor. Enquanto isso, se quiser, já pode me mandar mais detalhes por aqui.',
  businessContext:
    'LLUM Pizzaria. Ajude com cardápio, reservas, horários, preços, espaço kids e atendimento humano. Nunca invente disponibilidade ou preços.',
}

type IntegrationRecord = Pick<
  Integration,
  | 'id'
  | 'provider'
  | 'status'
  | 'masked_preview'
  | 'last_validated_at'
  | 'validation_error'
  | 'workspace_id'
  | 'encrypted_credentials'
>

type StoredIntegrationPayload = {
  credentials?: Record<string, string>
  validationDetails?: Record<string, unknown> | null
}

type WhatsAppSendApiResponse = {
  messages?: Array<{ id?: string }>
  error?: { message?: string }
  [key: string]: unknown
}

type AiProvider = 'openai' | 'anthropic' | 'groq' | 'openrouter' | 'deepseek'

type ResolvedAiProvider = {
  provider: AiProvider
  apiKey: string
  model: string
  credentialSource: 'integration' | 'environment'
}

type ResolvedWhatsAppRuntime = {
  accessToken: string | null
  phoneNumberId: string | null
  wabaId: string | null
  appSecret: string | null
  verifyToken: string | null
  channelConfig: WhatsappChannelConfig | null
  source: 'integration' | 'environment' | 'mixed' | 'none'
}

function nowIso() {
  return new Date().toISOString()
}

function getWorkspaceId(workspaceId?: string) {
  return workspaceId || DEFAULT_WORKSPACE_ID
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

function getIntegrationWorkspaceId(workspaceId?: string) {
  const workspace = getWorkspaceId(workspaceId)
  return isUuidLike(workspace) ? workspace : null
}

function isKnownProvider(provider: string): provider is (typeof KNOWN_INTEGRATION_PROVIDERS)[number] {
  return (KNOWN_INTEGRATION_PROVIDERS as readonly string[]).includes(provider)
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function clipText(value: string, maxLength = 240) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3).trim()}...`
}

function isShortAffirmationMessage(value: string) {
  const normalized = normalizeText(value).trim()
  return /^(sim|s|isso|ok|okay|certo|claro|com certeza|pode|pode sim|pode ser|fechado|confirmo|confirmar|quero sim|isso mesmo)$/.test(
    normalized
  )
}

// Splits a paragraph into sentences without breaking inside URLs, decimals or
// abbreviations. The boundary is punctuation followed by whitespace (or end of
// string), so "vercel.app" and "R$ 5,00" stay intact.
function splitIntoSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+(?=[A-Za-zÀ-ÿ0-9])/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function formatAgentReplyBlocks(value: string, maxBlockChars = 220) {
  const normalized = value
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()

  if (!normalized) return value
  const paragraphs = normalized.includes('\n\n')
    ? normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
    : [normalized]

  const blocks: string[] = []
  for (const paragraph of paragraphs) {
    const sentences = splitIntoSentences(paragraph)
    if (sentences.length === 0) {
      blocks.push(paragraph)
      continue
    }

    let current = ''
    for (const sentence of sentences) {
      const next = current ? `${current} ${sentence}` : sentence
      if (current.length > 0 && next.length > maxBlockChars) {
        blocks.push(current)
        current = sentence
        continue
      }
      current = next
    }

    if (current) blocks.push(current)
  }

  return blocks.join('\n\n')
}

function truncateReplyToLimit(value: string, maxChars: number) {
  if (!value || value.length <= maxChars) return value

  const sentences = splitIntoSentences(value.replace(/\s+/g, ' ').trim())
  let assembled = ''
  for (const sentence of sentences) {
    const next = assembled ? `${assembled} ${sentence}` : sentence
    if (next.length > maxChars) break
    assembled = next
  }

  if (assembled.length >= 60) return assembled

  // No clean sentence boundary fit — fall back to word-aware truncation.
  const words = value.split(/\s+/).filter(Boolean)
  let wordChunk = ''
  for (const word of words) {
    const next = wordChunk ? `${wordChunk} ${word}` : word
    if (next.length > maxChars - 1) break
    wordChunk = next
  }
  return `${wordChunk.trim()}…`
}

function splitLongWhatsAppMessage(body: string, maxChars: number) {
  const normalized = body.replace(/\r/g, '').trim()
  if (!normalized || normalized.length <= maxChars) return [normalized]

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''

  const flush = () => {
    if (current.trim()) {
      chunks.push(current.trim())
      current = ''
    }
  }

  const fitSegment = (segment: string) => {
    if (segment.length <= maxChars) return [segment]

    const words = segment.split(/\s+/).filter(Boolean)
    const fitted: string[] = []
    let wordChunk = ''

    for (const word of words) {
      const nextWordChunk = wordChunk ? `${wordChunk} ${word}` : word
      if (nextWordChunk.length <= maxChars) {
        wordChunk = nextWordChunk
        continue
      }

      if (wordChunk) fitted.push(wordChunk.trim())
      wordChunk = word
    }

    if (wordChunk.trim()) fitted.push(wordChunk.trim())
    return fitted
  }

  for (const paragraph of paragraphs) {
    const segments = splitIntoSentences(paragraph)
    const safeSegments = segments.length > 0 ? segments : [paragraph]

    for (const segment of safeSegments) {
      const fittedSegments = fitSegment(segment)
      for (const fitted of fittedSegments) {
        const next = current ? `${current} ${fitted}` : fitted
        if (next.length <= maxChars) {
          current = next
          continue
        }

        flush()
        current = fitted
      }
    }

    flush()
  }

  flush()
  return chunks.filter(Boolean)
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getKnowledgeMatches(message: string, workspaceId?: string): Promise<KnowledgeMatch[]> {
  return searchKnowledgeMatches(message, workspaceId)
}

function buildKnowledgePrompt(matches: KnowledgeMatch[]) {
  if (!matches.length) {
    return 'Nenhum item publicado da base de conhecimento foi relacionado a esta mensagem.'
  }

  return matches
    .map(
      (item, index) =>
        `${index + 1}. [${item.id}] ${item.title} (${item.category}) - ${item.excerpt}`
    )
    .join('\n')
}

function buildConversationContextPrompt(history: ConversationContextTurn[]) {
  if (!history.length) {
    return 'Nao ha historico anterior relevante alem da mensagem atual.'
  }

  return history
    .map((turn, index) => {
      const speaker =
        turn.senderType === 'customer'
          ? 'Cliente'
          : turn.senderType === 'human'
            ? 'Humano'
            : turn.senderType === 'system'
              ? 'Sistema'
              : 'IA'

      return `${index + 1}. ${speaker} (${turn.direction}) às ${new Date(turn.createdAt).toLocaleTimeString(
        'pt-BR',
        {
          hour: '2-digit',
          minute: '2-digit',
        }
      )}: ${clipText(turn.body, 280)}`
    })
    .join('\n')
}

function isShortAmbiguousMessage(message: string) {
  const normalized = normalizeText(message).trim()
  if (!normalized) return true
  if (normalized.length <= 3) return true

  return /^(ok|blz|beleza|show|top|entendi|assim|como assim|oq|o que|e ai|e agora|o que voce precisa|que voce precisa|como funciona|\?+)$/.test(
    normalized
  )
}

function buildHeuristicSignalText(message: string, history: ConversationContextTurn[]) {
  const current = normalizeText(message)
  if (!isShortAmbiguousMessage(message)) {
    return current
  }

  const recentContext = history
    .slice(0, -1)
    .filter((turn) => turn.senderType !== 'system' && turn.body.trim().length > 0)
    .slice(-3)
    .map((turn) => normalizeText(turn.body))
    .join(' ')

  return `${recentContext} ${current}`.trim()
}

function buildKnowledgeAwareReply(intent: ClassifiedIntent, matches: KnowledgeMatch[]) {
  const topMatch = matches[0]
  if (!topMatch) return null

  if (
    ![
      'menu_question',
      'pricing_question',
      'opening_hours',
      'location_question',
      'kids_area_question',
      'reservation_interest',
      'birthday_interest',
    ].includes(intent)
  ) {
    return null
  }

  const intros: Record<string, string> = {
    menu_question: 'Pelo que está publicado na nossa base',
    pricing_question: 'Com base na informação validada que tenho aqui',
    opening_hours: 'No que está registrado na operação',
    location_question: 'Pelo que consta na base',
    kids_area_question: 'No material operacional que tenho aqui',
    reservation_interest: 'Pelo fluxo publicado de atendimento',
    birthday_interest: 'Pelo material de atendimento para eventos',
  }

  const intro = intros[intent] || 'Com base no que está publicado'
  return `${intro}, ${topMatch.excerpt} Se quiser, eu continuo daqui com o próximo passo do atendimento.`
}

function getDefaultModelForProvider(provider: AiProvider) {
  switch (provider) {
    case 'anthropic':
      return 'claude-3-5-sonnet-latest'
    case 'groq':
      return 'llama-3.1-8b-instant'
    case 'openrouter':
      return 'openai/gpt-4.1-mini'
    case 'deepseek':
      return 'deepseek-chat'
    case 'openai':
    default:
      return 'gpt-4.1-mini'
  }
}

function inferPreferredAiProviders(model?: string | null): AiProvider[] {
  const normalized = normalizeText(model || '')
  const ranked: AiProvider[] = []

  const push = (provider: AiProvider) => {
    if (!ranked.includes(provider)) ranked.push(provider)
  }

  if (normalized.includes('claude')) {
    push('anthropic')
    push('openrouter')
  } else if (normalized.includes('deepseek')) {
    push('deepseek')
    push('openrouter')
  } else if (
    normalized.includes('llama') ||
    normalized.includes('mixtral') ||
    normalized.includes('gemma')
  ) {
    push('groq')
    push('openrouter')
  } else if (
    normalized.includes('gpt') ||
    normalized.includes('o1') ||
    normalized.includes('o3') ||
    normalized.includes('o4')
  ) {
    push('openai')
    push('openrouter')
  }

  push('openai')
  push('anthropic')
  push('groq')
  push('openrouter')
  push('deepseek')

  return ranked
}

function isModelCompatibleWithProvider(model: string, provider: AiProvider) {
  const normalized = normalizeText(model)

  if (provider === 'openrouter') return true
  if (provider === 'openai') return /(^|[^a-z])(gpt|o1|o3|o4)/.test(normalized)
  if (provider === 'anthropic') return normalized.includes('claude')
  if (provider === 'deepseek') return normalized.includes('deepseek')
  if (provider === 'groq') {
    return (
      normalized.includes('llama') ||
      normalized.includes('mixtral') ||
      normalized.includes('gemma')
    )
  }

  return false
}

function resolveModelForProvider(provider: AiProvider, requestedModel?: string | null) {
  if (requestedModel && isModelCompatibleWithProvider(requestedModel, provider)) {
    return requestedModel
  }

  return getDefaultModelForProvider(provider)
}

async function getConfigIntegration(workspaceId?: string) {
  const supabase = getServerSupabaseClient()
  const workspace = getIntegrationWorkspaceId(workspaceId)
  let query = supabase.from('integrations').select('*').eq('provider', CRM_CONFIG_PROVIDER)
  query = workspace ? query.eq('workspace_id', workspace) : query.is('workspace_id', null)
  const { data } = await query.maybeSingle()

  return data as IntegrationRecord | null
}

async function upsertEncryptedIntegration(
  provider: string,
  payload: Record<string, unknown>,
  workspaceId?: string,
  maskedPreview?: string | null
) {
  const supabase = getServerSupabaseClient()
  const workspace = getIntegrationWorkspaceId(workspaceId)
  const encryptedPayload = await encrypt(JSON.stringify(payload))
  let existingQuery = supabase.from('integrations').select('id').eq('provider', provider)
  existingQuery = workspace ? existingQuery.eq('workspace_id', workspace) : existingQuery.is('workspace_id', null)
  const existing = (await existingQuery.maybeSingle()) as { data: { id: string } | null }

  const row = {
    workspace_id: workspace,
    provider,
    encrypted_credentials: encryptedPayload,
    label: provider,
    masked_preview: maskedPreview || 'configurado',
    status: 'active',
    last_validated_at: nowIso(),
    validation_error: null,
  }

  if (existing.data?.id) {
    await supabase.from('integrations').update(row as never).eq('id', existing.data.id)
    return existing.data.id
  }

  const { data } = (await supabase
    .from('integrations')
    .insert(row as never)
    .select('id')
    .single()) as { data: { id: string } | null }
  return data?.id
}

export async function getCrmSettings(workspaceId?: string): Promise<CrmSettings> {
  const config = await getConfigIntegration(workspaceId)
  let savedConfig: Partial<CrmSettings> = {}

  try {
    if (config?.encrypted_credentials) {
      const raw = await decrypt(config.encrypted_credentials)
      savedConfig = JSON.parse(raw) as Partial<CrmSettings>
    }
  } catch {
    savedConfig = {}
  }

  const agentProfile = await getPrimaryAgentProfile(workspaceId)
  if (agentProfile) {
    return {
      ...defaultCrmSettings,
      ...savedConfig,
      assistantName: agentProfile.assistant_name,
      tone: agentProfile.tone,
      aiEnabled: agentProfile.ai_enabled,
      handoffMessage: agentProfile.handoff_message,
      businessContext: agentProfile.business_context,
      closingMessage: savedConfig.closingMessage || DEFAULT_CLOSING_MESSAGE,
    }
  }

  return {
    ...defaultCrmSettings,
    ...savedConfig,
    closingMessage: savedConfig.closingMessage || DEFAULT_CLOSING_MESSAGE,
  }
}

export async function saveCrmSettings(settings: CrmSettings, workspaceId?: string) {
  await upsertEncryptedIntegration(
    CRM_CONFIG_PROVIDER,
    settings as unknown as Record<string, unknown>,
    workspaceId,
    'configurado'
  )
  return settings
}

export async function listIntegrations(workspaceId?: string) {
  const supabase = getServerSupabaseClient()
  const workspace = getIntegrationWorkspaceId(workspaceId)
  let query = supabase
    .from('integrations')
    .select('id, provider, status, masked_preview, last_validated_at, validation_error, workspace_id')
  query = workspace ? query.eq('workspace_id', workspace) : query.is('workspace_id', null)
  const { data } = (await query.order('created_at', { ascending: true })) as {
    data: IntegrationRecord[] | null
  }

  return (data || []).filter((item) => isKnownProvider(item.provider))
}

export async function getDecryptedIntegration(
  provider: string,
  workspaceId?: string
): Promise<StoredIntegrationPayload | null> {
  const supabase = getServerSupabaseClient()
  const workspace = getIntegrationWorkspaceId(workspaceId)
  let query = supabase
    .from('integrations')
    .select('encrypted_credentials, is_active')
    .eq('provider', provider)
  query = workspace ? query.eq('workspace_id', workspace) : query.is('workspace_id', null)
  // Prefer the active row; fall back to whatever exists for backward compat
  // with pre-migration rows that don't have `is_active` populated yet.
  const { data } = (await query
    .order('is_active', { ascending: false })
    .limit(1)
    .maybeSingle()) as {
    data: { encrypted_credentials: string | null } | null
  }

  if (!data?.encrypted_credentials) return null
  const decrypted = await decrypt(data.encrypted_credentials)
  return JSON.parse(decrypted) as StoredIntegrationPayload
}

/** Decrypted view of a stored integration credentials row. */
export type WhatsappEnvironmentRow = {
  integrationId: string
  channelConfigId: string | null
  label: string
  displayName: string
  phoneNumberId: string | null
  wabaId: string | null
  webhookUrl: string | null
  status: string
  isActive: boolean
  hasAccessToken: boolean
  hasAppSecret: boolean
  verifyTokenPreview: string | null
  maskedAccessToken: string | null
}

type WhatsappIntegrationRow = {
  id: string
  label: string | null
  is_active: boolean | null
  encrypted_credentials: string
  status: string | null
}

type WhatsappChannelConfigRow = {
  id: string
  display_name: string
  phone_number_id: string
  waba_id: string
  webhook_url: string | null
  status: string
  label: string | null
  is_active: boolean | null
  integration_id: string | null
}

function maskToken(token: string | undefined | null, head = 8, tail = 6) {
  if (!token) return null
  if (token.length <= head + tail) return '****'
  return `${token.slice(0, head)}...${token.slice(-tail)}`
}

function maskVerifyToken(token: string | undefined | null) {
  if (!token) return null
  if (token.length <= 4) return '****'
  return `${token.slice(0, 4)}...${token.slice(-2)}`
}

export async function listWhatsappEnvironments(
  workspaceId?: string
): Promise<WhatsappEnvironmentRow[]> {
  const supabase = getServerSupabaseClient()
  // integrations.workspace_id is a uuid (NULL for the global tenant), but
  // whatsapp_channel_configs.workspace_id is a text slug like 'llum-default'.
  // We have to query each table with its own convention.
  const integrationWorkspace = getIntegrationWorkspaceId(workspaceId)
  const channelWorkspace = getWorkspaceId(workspaceId)

  let integrationsQuery = supabase
    .from('integrations')
    .select('id, label, is_active, encrypted_credentials, status')
    .eq('provider', 'whatsapp')
  integrationsQuery = integrationWorkspace
    ? integrationsQuery.eq('workspace_id', integrationWorkspace)
    : integrationsQuery.is('workspace_id', null)

  const channelsQuery = supabase
    .from('whatsapp_channel_configs')
    .select(
      'id, display_name, phone_number_id, waba_id, webhook_url, status, label, is_active, integration_id'
    )
    .eq('workspace_id', channelWorkspace)

  const [intRes, chanRes] = await Promise.all([integrationsQuery, channelsQuery])
  const integrations = (intRes.data as WhatsappIntegrationRow[] | null) || []
  const channels = (chanRes.data as WhatsappChannelConfigRow[] | null) || []

  const environments: WhatsappEnvironmentRow[] = []

  for (const integration of integrations) {
    let creds: Record<string, string> = {}
    try {
      const raw = await decrypt(integration.encrypted_credentials)
      const parsed = JSON.parse(raw) as { credentials?: Record<string, string> }
      creds = parsed.credentials || {}
    } catch {
      creds = {}
    }

    // Pair: prefer integration_id link; fall back to phone_number_id match.
    const channel =
      channels.find((c) => c.integration_id === integration.id) ||
      channels.find((c) => c.phone_number_id === creds.phone_number_id) ||
      null

    environments.push({
      integrationId: integration.id,
      channelConfigId: channel?.id ?? null,
      label: integration.label || channel?.label || channel?.display_name || 'Sem nome',
      displayName: channel?.display_name || integration.label || 'WhatsApp',
      phoneNumberId: channel?.phone_number_id || creds.phone_number_id || null,
      wabaId: channel?.waba_id || creds.waba_id || null,
      webhookUrl: channel?.webhook_url || null,
      status: channel?.status || integration.status || 'draft',
      isActive: Boolean(integration.is_active) && Boolean(channel?.is_active ?? true),
      hasAccessToken: Boolean(creds.access_token),
      hasAppSecret: Boolean(creds.app_secret),
      verifyTokenPreview: maskVerifyToken(creds.verify_token),
      maskedAccessToken: maskToken(creds.access_token),
    })
  }

  return environments
}

export async function activateWhatsappEnvironment(
  integrationId: string,
  workspaceId?: string
): Promise<void> {
  const supabase = getServerSupabaseClient()
  // integrations uses uuid workspace_id (NULL for global); channels use a
  // text slug like 'llum-default'. We deactivate everyone in this workspace
  // first to avoid colliding with the partial unique-index on is_active=true.
  const integrationWorkspace = getIntegrationWorkspaceId(workspaceId)
  const channelWorkspace = getWorkspaceId(workspaceId)

  let deactivateQuery = supabase
    .from('integrations')
    .update({ is_active: false } as never)
    .eq('provider', 'whatsapp')
  deactivateQuery = integrationWorkspace
    ? deactivateQuery.eq('workspace_id', integrationWorkspace)
    : deactivateQuery.is('workspace_id', null)
  await deactivateQuery

  await supabase
    .from('whatsapp_channel_configs')
    .update({ is_active: false } as never)
    .eq('workspace_id', channelWorkspace)

  // Activate the chosen integration.
  await supabase
    .from('integrations')
    .update({ is_active: true } as never)
    .eq('id', integrationId)

  // Find linked channel (by integration_id or by matching phone_number_id) and activate.
  const { data: integrationRow } = (await supabase
    .from('integrations')
    .select('encrypted_credentials')
    .eq('id', integrationId)
    .maybeSingle()) as { data: { encrypted_credentials: string } | null }

  if (!integrationRow) return

  let phoneNumberId: string | null = null
  try {
    const raw = await decrypt(integrationRow.encrypted_credentials)
    const parsed = JSON.parse(raw) as { credentials?: Record<string, string> }
    phoneNumberId = parsed.credentials?.phone_number_id || null
  } catch {
    phoneNumberId = null
  }

  // Try linking by integration_id first.
  const linkedByIntegration = await supabase
    .from('whatsapp_channel_configs')
    .update({ is_active: true } as never)
    .eq('integration_id', integrationId)
    .select('id')
  const linkedRows = (linkedByIntegration.data as Array<{ id: string }> | null) || []

  if (linkedRows.length === 0 && phoneNumberId) {
    // Fall back to matching by phone_number_id.
    await supabase
      .from('whatsapp_channel_configs')
      .update({ is_active: true, integration_id: integrationId } as never)
      .eq('phone_number_id', phoneNumberId)
  }
}

export async function saveValidatedIntegration(input: {
  provider: string
  credentials: Record<string, string>
  validationDetails?: Record<string, unknown> | null
  workspaceId?: string
}) {
  const masked =
    input.provider === 'whatsapp'
      ? `token ${maskCredential(input.credentials.access_token || '')}`
      : maskCredential(input.credentials.api_key || Object.values(input.credentials)[0] || '')

  await upsertEncryptedIntegration(
    input.provider,
    {
      credentials: input.credentials,
      validationDetails: input.validationDetails || null,
    },
    input.workspaceId,
    masked
  )
}

async function resolveAiProvider(
  workspaceId?: string,
  requestedModel?: string | null
): Promise<ResolvedAiProvider | null> {
  const providerOrder = inferPreferredAiProviders(requestedModel)

  for (const provider of providerOrder) {
    const integration = await getDecryptedIntegration(provider, workspaceId)
    const apiKey = integration?.credentials?.api_key?.trim()
    if (!apiKey) continue

    return {
      provider,
      apiKey,
      model: resolveModelForProvider(provider, requestedModel),
      credentialSource: 'integration',
    }
  }

  const envApiKey = process.env.OPENAI_API_KEY?.trim()
  if (!envApiKey) return null

  return {
    provider: 'openai',
    apiKey: envApiKey,
    model: resolveModelForProvider('openai', requestedModel),
    credentialSource: 'environment',
  }
}

/**
 * Internal helper: find the integration whose stored phone_number_id matches
 * the requested one. Returns null if no match found.
 */
async function findWhatsappIntegrationByPhoneNumberId(
  phoneNumberId: string,
  workspaceId?: string
): Promise<StoredIntegrationPayload | null> {
  const supabase = getServerSupabaseClient()
  const workspace = getIntegrationWorkspaceId(workspaceId)
  let query = supabase
    .from('integrations')
    .select('encrypted_credentials')
    .eq('provider', 'whatsapp')
  query = workspace ? query.eq('workspace_id', workspace) : query.is('workspace_id', null)
  const { data } = (await query) as {
    data: Array<{ encrypted_credentials: string }> | null
  }
  if (!data) return null

  for (const row of data) {
    try {
      const decrypted = await decrypt(row.encrypted_credentials)
      const parsed = JSON.parse(decrypted) as StoredIntegrationPayload
      if (parsed.credentials?.phone_number_id?.trim() === phoneNumberId) {
        return parsed
      }
    } catch {
      continue
    }
  }
  return null
}

export async function resolveWhatsAppRuntime(
  workspaceId?: string,
  /** When provided, pick credentials whose phone_number_id matches — used by the inbound webhook router to support multi-environment. */
  inboundPhoneNumberId?: string
): Promise<ResolvedWhatsAppRuntime> {
  let integration: StoredIntegrationPayload | null = null

  if (inboundPhoneNumberId) {
    integration = await findWhatsappIntegrationByPhoneNumberId(inboundPhoneNumberId, workspaceId)
  }
  if (!integration) {
    integration = await getDecryptedIntegration('whatsapp', workspaceId)
  }

  const savedCredentials = integration?.credentials || {}
  const channelConfig = inboundPhoneNumberId
    ? (await getWhatsappChannelConfigByPhoneNumberId(inboundPhoneNumberId, workspaceId)) ||
      (await getWhatsappChannelConfig(workspaceId))
    : await getWhatsappChannelConfig(workspaceId)

  const accessToken = savedCredentials.access_token?.trim() || process.env.META_ACCESS_TOKEN || null
  const phoneNumberId =
    channelConfig?.phone_number_id ||
    savedCredentials.phone_number_id?.trim() ||
    process.env.META_PHONE_NUMBER_ID ||
    null
  const wabaId =
    channelConfig?.waba_id || savedCredentials.waba_id?.trim() || process.env.META_WABA_ID || null
  const appSecret = savedCredentials.app_secret?.trim() || process.env.META_APP_SECRET || null
  const verifyToken =
    savedCredentials.verify_token?.trim() || process.env.META_VERIFY_TOKEN || null

  const savedCount = [
    savedCredentials.access_token,
    savedCredentials.phone_number_id,
    savedCredentials.waba_id,
    savedCredentials.app_secret,
    savedCredentials.verify_token,
  ].filter(Boolean).length

  const envCount = [
    process.env.META_ACCESS_TOKEN,
    process.env.META_PHONE_NUMBER_ID,
    process.env.META_WABA_ID,
    process.env.META_APP_SECRET,
    process.env.META_VERIFY_TOKEN,
  ].filter(Boolean).length

  let source: ResolvedWhatsAppRuntime['source'] = 'none'
  if (savedCount > 0 && envCount > 0) source = 'mixed'
  else if (savedCount > 0) source = 'integration'
  else if (envCount > 0) source = 'environment'

  return {
    accessToken,
    phoneNumberId,
    wabaId,
    appSecret,
    verifyToken,
    channelConfig,
    source,
  }
}

// =========================================================================
// AI agent: two-pass architecture (classify → respond)
//
// The classify pass uses the cheapest model in the configured family to decide
// intent, handoff and lead fields. The respond pass writes the customer-facing
// reply only after the decision is made. Each pass uses strict JSON output
// validated by zod; if validation fails we retry once before falling back to
// the deterministic heuristic.
// =========================================================================

const INTENT_VALUES = [
  'greeting',
  'menu_question',
  'pricing_question',
  'opening_hours',
  'location_question',
  'reservation_interest',
  'birthday_interest',
  'kids_area_question',
  'complaint',
  'human_request',
  'unclear',
  'other',
] as const

const leadFieldsSchema = z.object({
  partySize: z.number().int().min(1).max(200).nullable().optional().default(null),
  desiredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'desiredDate deve ser YYYY-MM-DD')
    .nullable()
    .optional()
    .default(null),
  desiredTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'desiredTime deve ser HH:MM')
    .nullable()
    .optional()
    .default(null),
  occasion: z.string().trim().max(80).nullable().optional().default(null),
  customerNotes: z.string().trim().max(400).nullable().optional().default(null),
})
type ParsedLeadFields = z.infer<typeof leadFieldsSchema>

const classifyOutputSchema = z.object({
  intent: z.enum(INTENT_VALUES),
  confidence: z.number().min(0).max(1),
  shouldCreateLead: z.boolean(),
  shouldHandoff: z.boolean(),
  routeReason: z.string().trim().min(1).max(120),
  leadSummary: z.string().trim().max(280).optional().default(''),
  leadFields: leadFieldsSchema.optional().default({
    partySize: null,
    desiredDate: null,
    desiredTime: null,
    occasion: null,
    customerNotes: null,
  }),
  knowledgeTopicsUsed: z.array(z.string().trim().max(120)).max(10).optional().default([]),
})
type ClassifyOutput = z.infer<typeof classifyOutputSchema>

const responderOutputSchema = z.object({
  reply: z.string().trim().min(1).max(2000),
  citations: z.array(z.string()).max(8).optional().default([]),
})
type ResponderOutput = z.infer<typeof responderOutputSchema>

function deriveMaxTokensForReply(agentProfile: AgentProfile | null) {
  const maxChars = agentProfile?.max_response_chars ?? 420
  // pt-BR averages ~3 chars per token; add headroom for JSON envelope + citations.
  return Math.min(800, Math.max(180, Math.ceil(maxChars / 2.5) + 160))
}

const CLASSIFY_MAX_TOKENS = 400

function buildClassifyPrompt(input: {
  settings: CrmSettings
  knowledgeMatches: KnowledgeMatch[]
  conversationHistory: ConversationContextTurn[]
}) {
  const knowledgeTopics = input.knowledgeMatches.length
    ? input.knowledgeMatches.map((match) => `- ${match.title} (${match.category})`).join('\n')
    : '- (nenhum tópico relacionado encontrado na base)'

  return [
    `Você é um triador de mensagens para o atendimento da LLUM Pizzaria no WhatsApp. NÃO escreve resposta para o cliente — você apenas classifica.`,
    `Contexto do negócio: ${input.settings.businessContext}`,
    `Tópicos disponíveis na base de conhecimento publicada (use só para entender o domínio coberto, não copie):\n${knowledgeTopics}`,
    `Histórico recente da conversa (mais antigo no topo). Considere antes de classificar:\n${buildConversationContextPrompt(
      input.conversationHistory
    )}`,
    [
      'Regras de classificação:',
      `- "shouldHandoff": true quando o cliente pede humano, reclama, ou quando o intent é reservation_interest e já há dados suficientes (data + número de pessoas).`,
      `- "shouldCreateLead": true só quando há sinal real de visita (reservation_interest, birthday_interest, ou perguntas comerciais com data/grupo).`,
      `- "leadFields": preencha o que estiver explícito ou claramente inferível na mensagem ou no histórico. Use null quando o cliente NÃO informou. Não invente.`,
      `- "desiredDate" sempre no formato YYYY-MM-DD; converta datas relativas (hoje, amanhã, sábado) a partir da data de hoje (${new Date()
        .toISOString()
        .slice(0, 10)}).`,
      `- "desiredTime" sempre HH:MM (24h).`,
      `- "occasion" é livre, máximo 80 chars (ex.: "aniversário 7 anos", "almoço família").`,
      `- "knowledgeTopicsUsed": liste os títulos da base que são realmente relevantes para responder. Lista vazia se nada se aplica.`,
    ].join('\n'),
    [
      'Responda SEMPRE com um único objeto JSON válido com EXATAMENTE estas chaves:',
      '{',
      `  "intent": "${INTENT_VALUES.join('"|"')}"`,
      '  "confidence": number entre 0 e 1,',
      '  "shouldCreateLead": boolean,',
      '  "shouldHandoff": boolean,',
      '  "routeReason": string curta com o motivo,',
      '  "leadSummary": string com resumo de 1 linha do lead ou "",',
      '  "leadFields": { "partySize": number|null, "desiredDate": "YYYY-MM-DD"|null, "desiredTime": "HH:MM"|null, "occasion": string|null, "customerNotes": string|null },',
      '  "knowledgeTopicsUsed": string[]',
      '}',
      'Não inclua nada fora do JSON.',
    ].join('\n'),
  ]
}

function buildResponderPrompt(input: {
  settings: CrmSettings
  agentProfile: AgentProfile | null
  knowledgeMatches: KnowledgeMatch[]
  conversationHistory: ConversationContextTurn[]
  classification: ClassifyOutput
  availability?: AvailabilityResult | null
}) {
  const customPersona = input.agentProfile?.system_prompt?.trim()
  const persona =
    customPersona ||
    `Você é ${input.settings.assistantName}, assistente da LLUM Pizzaria no WhatsApp. Tom: ${input.settings.tone}. Contexto: ${input.settings.businessContext}.`

  const maxChars = input.agentProfile?.max_response_chars ?? 420

  const guardrails = [
    `Limite duro: a chave "reply" deve ter no máximo ${maxChars} caracteres.`,
    'Use apenas a base de conhecimento abaixo como fonte factual. Se a base estiver vazia ou irrelevante para o que o cliente pediu, peça mais detalhes em vez de inventar.',
    'Não repita informações já enviadas no histórico — continue a conversa.',
    'Responda em português do Brasil, sem markdown, sem listas numeradas, no máximo 1 emoji, sem chamadas para link a não ser que esteja explicitamente na base.',
    'Não cumprimente novamente se a conversa já está em andamento.',
  ].join('\n- ')

  const classifierSummary = [
    `Decisão do triador (já tomada, NÃO refaça):`,
    `- intent: ${input.classification.intent}`,
    `- confidence: ${input.classification.confidence}`,
    `- shouldHandoff: ${input.classification.shouldHandoff}`,
    `- routeReason: ${input.classification.routeReason}`,
    input.classification.leadFields.partySize
      ? `- partySize já coletado: ${input.classification.leadFields.partySize}`
      : null,
    input.classification.leadFields.desiredDate
      ? `- desiredDate já coletado: ${input.classification.leadFields.desiredDate}`
      : null,
    input.classification.leadFields.occasion
      ? `- occasion já coletado: ${input.classification.leadFields.occasion}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  const outputContract = [
    'Responda APENAS com um JSON com estas chaves:',
    '{',
    '  "reply": string  // a mensagem literal a enviar para o cliente,',
    '  "citations": string[]  // ids da base que sustentam a resposta (use os ids entre colchetes que aparecem em "Base de conhecimento publicada")',
    '}',
    'Não inclua nada fora do JSON. Não copie textualmente o conteúdo da base — sintetize.',
  ].join('\n')

  const availabilityBlock = input.availability
    ? [
        'Disponibilidade real consultada AGORA no sistema de reservas (use como fato — NÃO invente):',
        `- data: ${input.availability.date}`,
        `- status: ${input.availability.status}`,
        input.availability.capacityLeft !== null
          ? `- lugares livres: ${input.availability.capacityLeft} de ${input.availability.capacityMax}`
          : null,
        `- mensagem técnica: ${input.availability.message}`,
        input.availability.alternatives.length > 0
          ? `- datas alternativas próximas com vaga: ${input.availability.alternatives
              .map((alt) => `${alt.date} (${alt.capacityLeft} livres)`)
              .join(', ')}`
          : null,
        input.availability.status === 'full' || input.availability.status === 'blocked'
          ? 'Informe ao cliente que a data está indisponível e ofereça as alternativas listadas acima.'
          : input.availability.status === 'busy'
            ? 'Avise que está com alta procura mas ainda há vagas — incentive confirmar logo.'
            : input.availability.status === 'available'
              ? 'Confirme a disponibilidade. Não prometa reserva — peça os dados para encaminhar ao link de reserva.'
              : 'Não afirme disponibilidade — peça que o cliente confirme via link ou aguarde a equipe.',
      ]
        .filter(Boolean)
        .join('\n')
    : null

  return [
    persona,
    `Diretrizes operacionais:\n- ${guardrails}`,
    classifierSummary,
    availabilityBlock,
    `Base de conhecimento publicada (formato: [id] título (categoria) - trecho):\n${buildKnowledgePrompt(
      input.knowledgeMatches
    )}`,
    `Histórico recente da conversa (mais antigo no topo). Continue a partir daqui:\n${buildConversationContextPrompt(
      input.conversationHistory
    )}`,
    outputContract,
  ].filter((block): block is string => Boolean(block))
}

type ResolvedProvider = NonNullable<Awaited<ReturnType<typeof resolveAiProvider>>>

async function callProviderJson(input: {
  provider: ResolvedProvider
  systemPrompts: string[]
  userMessage: string
  maxTokens: number
  temperature: number
}): Promise<string | null> {
  if (input.provider.provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': input.provider.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: input.provider.model,
        max_tokens: input.maxTokens,
        temperature: input.temperature,
        system: input.systemPrompts.join('\n\n'),
        messages: [{ role: 'user', content: input.userMessage }],
      }),
    })

    if (!response.ok) return null
    const data = await response.json()
    const textBlock = Array.isArray(data.content)
      ? data.content.find((item: { type?: string; text?: string }) => item?.type === 'text')
      : null
    return textBlock?.text || null
  }

  const endpointByProvider: Record<Exclude<AiProvider, 'anthropic'>, string> = {
    openai: 'https://api.openai.com/v1/chat/completions',
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    deepseek: 'https://api.deepseek.com/chat/completions',
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${input.provider.apiKey}`,
  }

  if (input.provider.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://llum.local'
    headers['X-Title'] = 'LLUM CRM IA'
  }

  const response = await fetch(endpointByProvider[input.provider.provider], {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: input.provider.model,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        ...input.systemPrompts.map((content) => ({ role: 'system' as const, content })),
        { role: 'user', content: input.userMessage },
      ],
    }),
  })

  if (!response.ok) return null
  const data = await response.json()
  return data.choices?.[0]?.message?.content || null
}

function safeJsonParse(content: string | null): unknown {
  if (!content) return null
  try {
    return JSON.parse(content)
  } catch {
    // Some providers wrap JSON in code fences or prose. Extract the outermost object.
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch {
      return null
    }
  }
}

async function runClassifyPass(input: {
  provider: ResolvedProvider
  settings: CrmSettings
  knowledgeMatches: KnowledgeMatch[]
  conversationHistory: ConversationContextTurn[]
  message: string
  temperature: number
}): Promise<ClassifyOutput | null> {
  const systemPrompts = buildClassifyPrompt({
    settings: input.settings,
    knowledgeMatches: input.knowledgeMatches,
    conversationHistory: input.conversationHistory,
  })

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await callProviderJson({
      provider: input.provider,
      systemPrompts,
      userMessage: input.message,
      maxTokens: CLASSIFY_MAX_TOKENS,
      temperature: input.temperature,
    })

    const parsed = safeJsonParse(raw)
    const result = classifyOutputSchema.safeParse(parsed)
    if (result.success) return result.data
  }

  return null
}

async function runResponderPass(input: {
  provider: ResolvedProvider
  settings: CrmSettings
  agentProfile: AgentProfile | null
  knowledgeMatches: KnowledgeMatch[]
  conversationHistory: ConversationContextTurn[]
  classification: ClassifyOutput
  message: string
  temperature: number
  availability?: AvailabilityResult | null
}): Promise<ResponderOutput | null> {
  const systemPrompts = buildResponderPrompt({
    settings: input.settings,
    agentProfile: input.agentProfile,
    knowledgeMatches: input.knowledgeMatches,
    conversationHistory: input.conversationHistory,
    classification: input.classification,
    availability: input.availability,
  })

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await callProviderJson({
      provider: input.provider,
      systemPrompts,
      userMessage: input.message,
      maxTokens: deriveMaxTokensForReply(input.agentProfile),
      temperature: input.temperature,
    })

    const parsed = safeJsonParse(raw)
    const result = responderOutputSchema.safeParse(parsed)
    if (result.success) return result.data
  }

  return null
}

async function classifyWithConfiguredProvider(
  message: string,
  settings: CrmSettings,
  knowledgeMatches: KnowledgeMatch[],
  agentProfile: AgentProfile | null,
  conversationHistory: ConversationContextTurn[],
  workspaceId?: string
): Promise<ClassificationResult | null> {
  const resolvedProvider = await resolveAiProvider(workspaceId, agentProfile?.model)
  if (!resolvedProvider) return null

  const temperature = agentProfile?.temperature ?? 0.2

  const classification = await runClassifyPass({
    provider: resolvedProvider,
    settings,
    knowledgeMatches,
    conversationHistory,
    message,
    temperature: Math.min(temperature, 0.2), // classifier should be near-deterministic
  })

  if (!classification) return null

  // Handoff for human request: use canned message, skip responder pass entirely.
  const useCannedHandoffReply =
    classification.shouldHandoff && classification.intent === 'human_request'

  let replyText: string
  let citations: string[] = []
  let responderUsed = false

  // Tool-call pré-emptivo de disponibilidade. O facade em `@/lib/availability`
  // decide qual provider usar (sheets, supabase, ou off) via AVAILABILITY_PROVIDER.
  // Retorna null quando OFF ou em qualquer erro — Maria responde sem inventar.
  let availability: AvailabilityResult | null = null
  const wantsReservation =
    classification.intent === 'reservation_interest' ||
    classification.intent === 'birthday_interest'
  if (wantsReservation && classification.leadFields.desiredDate) {
    availability = await checkAvailability(
      classification.leadFields.desiredDate,
      classification.leadFields.partySize ?? null
    )
  }

  if (useCannedHandoffReply) {
    replyText = settings.handoffMessage
  } else {
    const responder = await runResponderPass({
      provider: resolvedProvider,
      settings,
      agentProfile,
      knowledgeMatches,
      conversationHistory,
      classification,
      message,
      temperature,
      availability,
    })

    if (!responder) return null
    replyText = responder.reply
    citations = responder.citations
    responderUsed = true
  }

  // Citations from the responder are chunk ids it relied on; fall back to the
  // full retrieval set when the model didn't tag any specific chunks.
  const validCitationIds = citations.length
    ? citations.filter((id) => knowledgeMatches.some((match) => match.id === id))
    : []
  const usedMatches = validCitationIds.length
    ? knowledgeMatches.filter((m) => validCitationIds.includes(m.id))
    : knowledgeMatches

  const knowledgeDocumentIds = [...new Set(usedMatches.map((m) => m.documentId))]
  const knowledgeChunkIds = usedMatches.map((m) => m.chunkId).filter((id): id is string => id !== null)

  return {
    intent: classification.intent,
    confidence: classification.confidence,
    shouldCreateLead: classification.shouldCreateLead,
    shouldHandoff: classification.shouldHandoff,
    reply: replyText,
    routeReason: `${resolvedProvider.provider}_${classification.routeReason}${
      responderUsed ? '' : '_canned_handoff'
    }`,
    leadSummary: classification.leadSummary || undefined,
    extractedData: {
      leadFields: classification.leadFields,
      knowledgeTopicsUsed: classification.knowledgeTopicsUsed,
      citationChunkIds: knowledgeChunkIds,
      availability: availability
        ? {
            date: availability.date,
            status: availability.status,
            capacityLeft: availability.capacityLeft,
            capacityMax: availability.capacityMax,
            alternatives: availability.alternatives,
          }
        : null,
    },
    source: 'provider',
    knowledgeDocumentIds,
    knowledgeChunkIds,
    modelUsed: resolvedProvider.model,
    providerUsed: resolvedProvider.provider,
  }
}

function classifyHeuristically(
  message: string,
  settings: CrmSettings,
  conversationHistory: ConversationContextTurn[] = []
): Omit<ClassificationResult, 'knowledgeDocumentIds' | 'knowledgeChunkIds' | 'modelUsed'> {
  const text = buildHeuristicSignalText(message, conversationHistory)
  const previousTurns = conversationHistory.slice(0, -1)
  const lastAssistantTurn = [...previousTurns]
    .reverse()
    .find((turn) => turn.senderType === 'ai' || turn.senderType === 'human')
  const hasVisitSignal = /(hoje|amanh[ãa]|mesa|ir|visitar|reservar|reserva|anivers)/.test(text)
  const wantsHuman =
    /(atendente|humano|respons[áa]vel|ajuda humana|falar com (alguem|algu[eé]m|uma pessoa|um atendente)|quero falar com|prefiro falar com)/.test(
      text
    )
  const complaint = /(problema|reclama|mal atendido|ruim|péssimo|horr[íi]vel)/.test(text)
  const reservation = /(reserv|mesa|quantas pessoas|hoje à noite|hoje a noite)/.test(text)
  const birthday = /(anivers|niver|comemorar|bolo)/.test(text)
  const menu = /(card[áa]pio|pizza doce|massa|sobremesa|rod[íi]zio|tem pizza)/.test(text)
  const pricing = /(valor|preço|preco|quanto custa|criança paga|criança|rod[íi]zio)/.test(text)
  const openingHours = /(hor[áa]rio|abre hoje|funciona domingo|que horas)/.test(text)
  const kids = /(kids|brinquedo|gamer|criança brincar|espaço kids|espaco kids)/.test(text)
  const location = /(onde fica|endereço|endereco|localização|localizacao)/.test(text)
  const greeting = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|opa)\b/.test(text)

  const contextualReservationAcceptance =
    isShortAffirmationMessage(message) &&
    Boolean(
      lastAssistantTurn?.body &&
        /(reserva|mesa|domingo|sabado|horario|19h|taxa|quantas pessoas|confirm)/.test(
          normalizeText(lastAssistantTurn.body)
        )
    )

  if (wantsHuman || complaint) {
    return {
      intent: wantsHuman ? 'human_request' : 'complaint',
      confidence: 0.92,
      shouldCreateLead: complaint ? false : hasVisitSignal,
      shouldHandoff: true,
      reply: settings.handoffMessage,
      routeReason: wantsHuman ? 'human_requested' : 'complaint_detected',
      leadSummary: wantsHuman ? 'Cliente pediu atendimento humano.' : 'Cliente registrou reclamação.',
      source: 'heuristic',
    }
  }

  if (contextualReservationAcceptance) {
    return {
      intent: 'reservation_interest',
      confidence: 0.96,
      shouldCreateLead: true,
      shouldHandoff: true,
      reply:
        'Perfeito! Recebi seu ok 😊\n\nVou encaminhar sua reserva para a equipe finalizar com seguranca e te orientar direitinho sobre a taxa e os proximos passos por aqui.',
      routeReason: 'reservation_affirmation_handoff',
      leadSummary: 'Cliente confirmou prosseguir com a reserva.',
      source: 'heuristic',
    }
  }

  if (reservation) {
    return {
      intent: 'reservation_interest',
      confidence: 0.9,
      shouldCreateLead: true,
      shouldHandoff: false,
      reply:
        'Que legal que você quer vir! Para eu adiantar por aqui, me conta quantas pessoas vêm e qual horário você prefere.',
      routeReason: 'reservation_interest',
      leadSummary: 'Cliente demonstrou intenção de reserva.',
      source: 'heuristic',
    }
  }

  if (birthday) {
    return {
      intent: 'birthday_interest',
      confidence: 0.9,
      shouldCreateLead: true,
      shouldHandoff: false,
      reply:
        'Que massa comemorar com a gente! Me passa a data, quantas pessoas e se vai ter crianças, que eu já deixo tudo encaminhado.',
      routeReason: 'birthday_interest',
      leadSummary: 'Cliente pediu informações para aniversário.',
      source: 'heuristic',
    }
  }

  if (pricing) {
    return {
      intent: 'pricing_question',
      confidence: 0.84,
      shouldCreateLead: hasVisitSignal,
      shouldHandoff: false,
      reply:
        'Posso te ajudar com isso. Se quiser, já me fala para quando está pensando em vir que eu organizo a melhor orientação para o seu caso.',
      routeReason: 'pricing_question',
      leadSummary: 'Cliente perguntou sobre preço ou regras comerciais.',
      source: 'heuristic',
    }
  }

  if (menu) {
    return {
      intent: 'menu_question',
      confidence: 0.88,
      shouldCreateLead: hasVisitSignal,
      shouldHandoff: false,
      reply:
        'Tem sim! Posso te orientar sobre o cardápio e também te ajudar a seguir para uma reserva, se fizer sentido.',
      routeReason: 'menu_question',
      leadSummary: hasVisitSignal ? 'Pergunta de cardápio com sinal comercial.' : undefined,
      source: 'heuristic',
    }
  }

  if (openingHours) {
    return {
      intent: 'opening_hours',
      confidence: 0.82,
      shouldCreateLead: hasVisitSignal,
      shouldHandoff: false,
      reply:
        'Consigo te ajudar com horário também. Se quiser, já me fala o dia que você pretende vir e eu deixo a conversa pronta.',
      routeReason: 'opening_hours',
      leadSummary: hasVisitSignal ? 'Pergunta de horário com intenção de visita.' : undefined,
      source: 'heuristic',
    }
  }

  if (kids) {
    return {
      intent: 'kids_area_question',
      confidence: 0.84,
      shouldCreateLead: true,
      shouldHandoff: false,
      reply:
        'A LLUM é bem procurada por famílias. Se você quiser, já me conta o dia e o tamanho do grupo que eu deixo o atendimento encaminhado.',
      routeReason: 'kids_area_question',
      leadSummary: 'Cliente perguntou sobre espaço kids ou experiência familiar.',
      source: 'heuristic',
    }
  }

  if (location) {
    return {
      intent: 'location_question',
      confidence: 0.8,
      shouldCreateLead: false,
      shouldHandoff: false,
      reply: 'Posso te ajudar com localização também. Se quiser, já me fala de qual região você vem.',
      routeReason: 'location_question',
      source: 'heuristic',
    }
  }

  if (greeting) {
    return {
      intent: 'greeting',
      confidence: 0.95,
      shouldCreateLead: false,
      shouldHandoff: false,
      reply: `Opa! Eu sou o ${settings.assistantName} da LLUM. Posso te ajudar com cardápio, reservas, horários, valores ou chamar um atendente.`,
      routeReason: 'greeting',
      source: 'heuristic',
    }
  }

  return {
    intent: 'unclear',
    confidence: 0.5,
    shouldCreateLead: false,
    shouldHandoff: false,
    reply: 'Me explica um pouquinho melhor o que você precisa e eu sigo com você por aqui.',
    routeReason: 'unclear_message',
    source: 'heuristic',
  }
}

function findRecentAssistantQuestion(history: ConversationContextTurn[]) {
  return [...history]
    .slice(-4)
    .reverse()
    .find(
      (turn) =>
        (turn.senderType === 'ai' || turn.senderType === 'human') &&
        /\?\s*$/.test(turn.body.trim())
    )
}

function gateTrivialMessage(
  message: string,
  history: ConversationContextTurn[],
  settings: CrmSettings
): Omit<ClassificationResult, 'knowledgeDocumentIds' | 'knowledgeChunkIds' | 'modelUsed'> | null {
  if (!isShortAmbiguousMessage(message)) return null

  // Affirmation handling already lives in classifyHeuristically — don't double-handle it.
  if (isShortAffirmationMessage(message)) return null

  const pendingQuestion = findRecentAssistantQuestion(history)
  if (pendingQuestion) {
    // The customer is replying to an open question, but with something we can't parse.
    // Re-surface the question instead of generating a brand-new reply.
    return {
      intent: 'unclear',
      confidence: 0.4,
      shouldCreateLead: false,
      shouldHandoff: false,
      reply: `Para eu te ajudar direitinho, me confirma: ${pendingQuestion.body.trim()}`,
      routeReason: 'trivial_reply_replays_question',
      source: 'heuristic',
    }
  }

  return {
    intent: 'unclear',
    confidence: 0.4,
    shouldCreateLead: false,
    shouldHandoff: false,
    reply: `Oi! Eu sou o ${settings.assistantName} da LLUM. Posso te ajudar com cardápio, reservas, horários ou valores. O que você precisa?`,
    routeReason: 'trivial_message_clarify',
    source: 'heuristic',
  }
}

async function classifyMessage(
  message: string,
  settings: CrmSettings,
  knowledgeMatches: KnowledgeMatch[],
  agentProfile: AgentProfile | null,
  conversationHistory: ConversationContextTurn[],
  workspaceId?: string
) {
  const trivialGate = gateTrivialMessage(message, conversationHistory, settings)
  if (trivialGate) {
    return {
      ...trivialGate,
      knowledgeDocumentIds: [],
      knowledgeChunkIds: [],
      modelUsed: 'trivial-gate',
    }
  }

  const heuristicResult = classifyHeuristically(message, settings, conversationHistory)
  if (heuristicResult.routeReason === 'reservation_affirmation_handoff') {
    return {
      ...heuristicResult,
      knowledgeDocumentIds: [...new Set(knowledgeMatches.map((m) => m.documentId))],
      knowledgeChunkIds: knowledgeMatches.map((m) => m.chunkId).filter((id): id is string => id !== null),
      modelUsed: 'heuristic-router',
    }
  }

  const openAiResult = await classifyWithConfiguredProvider(
    message,
    settings,
    knowledgeMatches,
    agentProfile,
    conversationHistory,
    workspaceId
  )
  if (openAiResult) return openAiResult
  return {
    ...heuristicResult,
    reply: buildKnowledgeAwareReply(heuristicResult.intent, knowledgeMatches) || heuristicResult.reply,
    knowledgeDocumentIds: [...new Set(knowledgeMatches.map((m) => m.documentId))],
    knowledgeChunkIds: knowledgeMatches.map((m) => m.chunkId).filter((id): id is string => id !== null),
    modelUsed: 'heuristic-router',
  }
}

async function findOrCreateCustomer(phone: string, name?: string | null) {
  const supabase = getServerSupabaseClient()
  const normalizedPhone = phone.replace(/\s+/g, '')
  const { data: existing } = (await supabase
    .from('customers')
    .select('*')
    .or(`phone.eq.${normalizedPhone},wa_id.eq.${normalizedPhone}`)
    .maybeSingle()) as { data: Customer | null }

  if (existing) {
    const updates: Partial<Customer> = {
      last_seen_at: nowIso(),
    }
    if (name && !existing.name) updates.name = name
    await supabase.from('customers').update(updates as never).eq('id', existing.id)
    return { ...existing, ...updates } as Customer
  }

  const payload = {
    name: name || normalizedPhone,
    phone: normalizedPhone,
    wa_id: normalizedPhone,
    source: 'whatsapp',
    first_seen_at: nowIso(),
    last_seen_at: nowIso(),
    metadata: {},
  }

  const { data } = (await supabase
    .from('customers')
    .insert(payload as never)
    .select('*')
    .single()) as { data: Customer | null }
  return data as Customer
}

async function getLatestConversation(customerId: string) {
  const supabase = getServerSupabaseClient()
  const { data } = (await supabase
    .from('conversations')
    .select('*')
    .eq('customer_id', customerId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()) as { data: Conversation | null }

  return data as Conversation | null
}

async function findOrCreateConversation(customer: Customer, preview: string) {
  const supabase = getServerSupabaseClient()
  const existing = await getLatestConversation(customer.id)

  if (existing) {
    const updates = {
      status: existing.status === 'closed' ? 'ai_active' : existing.status,
      assigned_to: existing.status === 'closed' ? null : existing.assigned_to,
      last_inbound_at: nowIso(),
      last_message_preview: preview,
      unread_count: (existing.unread_count || 0) + 1,
      updated_at: nowIso(),
    }
    await supabase.from('conversations').update(updates as never).eq('id', existing.id)
    return { ...existing, ...updates } as Conversation
  }

  const { data } = (await supabase
    .from('conversations')
    .insert({
      customer_id: customer.id,
      channel: 'whatsapp',
      status: 'ai_active',
      assigned_to: null,
      last_inbound_at: nowIso(),
      last_outbound_at: null,
      unread_count: 1,
      last_message_preview: preview,
      current_intent: null,
      metadata: {},
    } as never)
    .select('*')
    .single()) as { data: Conversation | null }

  return data as Conversation
}

async function createAgentRun(params: Omit<AgentRun, 'id' | 'created_at'>) {
  const supabase = getServerSupabaseClient()
  const { data } = (await supabase
    .from('agent_runs')
    .insert(params as never)
    .select('*')
    .single()) as { data: AgentRun | null }
  return data as AgentRun
}

async function createInboundInteraction(params: {
  conversationId: string
  customerId: string
  body: string
  externalMessageId?: string | null
  metadata?: Record<string, unknown>
}) {
  const supabase = getServerSupabaseClient()
  const { data } = (await supabase
    .from('interactions')
    .insert({
      conversation_id: params.conversationId,
      customer_id: params.customerId,
      direction: 'inbound',
      sender_type: 'customer',
      message_type: 'text',
      body: params.body,
      external_message_id: params.externalMessageId || null,
      status: 'received',
      metadata: params.metadata || {},
    } as never)
    .select('*')
    .single()) as { data: Interaction | null }

  return data as Interaction
}

async function getConversationHistory(
  conversationId: string,
  limit = 8
): Promise<ConversationContextTurn[]> {
  const supabase = getServerSupabaseClient()
  const { data } = (await supabase
    .from('interactions')
    .select('direction, sender_type, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)) as {
    data:
      | Array<Pick<Interaction, 'direction' | 'sender_type' | 'body' | 'created_at'>>
      | null
  }

  return (data || [])
    .filter((item) => Boolean(item.body?.trim()))
    .reverse()
    .map((item) => ({
      direction: item.direction,
      senderType: item.sender_type,
      body: item.body || '',
      createdAt: item.created_at,
    }))
}

async function createOutboundInteraction(params: {
  conversationId: string
  customerId: string
  body: string
  senderType: 'ai' | 'human' | 'system'
  externalMessageId?: string | null
  status?: string
  metadata?: Record<string, unknown>
}) {
  const supabase = getServerSupabaseClient()
  const { data } = (await supabase
    .from('interactions')
    .insert({
      conversation_id: params.conversationId,
      customer_id: params.customerId,
      direction: 'outbound',
      sender_type: params.senderType,
      message_type: 'text',
      body: params.body,
      external_message_id: params.externalMessageId || null,
      status: params.status || 'sent',
      metadata: params.metadata || {},
    } as never)
    .select('*')
    .single()) as { data: Interaction | null }

  return data as Interaction
}

async function updateConversation(conversationId: string, updates: Partial<Conversation>) {
  const supabase = getServerSupabaseClient()
  await supabase.from('conversations').update(updates as never).eq('id', conversationId)
}

async function syncOpenHandoffForConversation(
  conversationId: string,
  action: 'claim' | 'resolve' | 'release_to_ai'
) {
  const supabase = getServerSupabaseClient()
  const { data: openHandoff } = (await supabase
    .from('handoffs')
    .select('*')
    .eq('conversation_id', conversationId)
    .in('status', ['pending', 'in_progress'])
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()) as { data: Handoff | null }

  if (!openHandoff) return null

  const patch =
    action === 'claim'
      ? {
          status: 'in_progress',
          metadata: { ...(openHandoff.metadata || {}), claimed_by: 'Operador', claimed_at: nowIso() },
        }
      : action === 'resolve'
        ? {
            status: 'resolved',
            resolved_at: nowIso(),
            resolved_by: 'Operador',
          }
        : {
          status: 'resolved',
          resolved_at: nowIso(),
          resolved_by: 'CRM IA',
          metadata: {
            ...(openHandoff.metadata || {}),
            released_to_ai_at: nowIso(),
          },
        }

  const { data } = await supabase
    .from('handoffs')
    .update(patch as never)
    .eq('id', openHandoff.id)
    .select('*')
    .single()

  return (data as unknown as Handoff) || null
}

async function createOrUpdateLead(params: {
  customerId: string
  conversationId: string
  intent: string
  summary?: string
  score?: number
  fields?: ParsedLeadFields | null
}) {
  const supabase = getServerSupabaseClient()
  const { data: existing } = (await supabase
    .from('leads')
    .select('*')
    .eq('conversation_id', params.conversationId)
    .not('status', 'eq', 'archived')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()) as { data: Lead | null }

  const fields = params.fields ?? null

  if (existing) {
    // Merge extracted fields without overwriting good data with null.
    const mergedDesiredDate = fields?.desiredDate ?? existing.desired_date
    const mergedDesiredTime = fields?.desiredTime ?? existing.desired_time
    const mergedPartySize = fields?.partySize ?? existing.party_size
    const mergedCustomerNotes =
      fields?.customerNotes && fields.customerNotes.trim().length > 0
        ? fields.customerNotes
        : existing.customer_notes
    const mergedMetadata: Record<string, Json> = {
      ...(existing.metadata || {}),
      ...(fields?.occasion ? { occasion: fields.occasion } : {}),
    }

    await supabase
      .from('leads')
      .update({
        intent: params.intent,
        summary: params.summary || existing.summary,
        score: params.score ?? existing.score,
        desired_date: mergedDesiredDate,
        desired_time: mergedDesiredTime,
        party_size: mergedPartySize,
        customer_notes: mergedCustomerNotes,
        metadata: mergedMetadata,
        last_message_at: nowIso(),
        updated_at: nowIso(),
      } as never)
      .eq('id', existing.id)

    return {
      ...existing,
      intent: params.intent,
      desired_date: mergedDesiredDate,
      desired_time: mergedDesiredTime,
      party_size: mergedPartySize,
      customer_notes: mergedCustomerNotes,
      metadata: mergedMetadata,
    } as Lead
  }

  const payload = {
    customer_id: params.customerId,
    conversation_id: params.conversationId,
    status: params.intent === 'reservation_interest' ? 'qualifying' : 'new',
    source: 'whatsapp',
    intent: params.intent,
    score: params.score ?? 50,
    summary: params.summary || null,
    desired_date: fields?.desiredDate ?? null,
    desired_time: fields?.desiredTime ?? null,
    party_size: fields?.partySize ?? null,
    customer_notes: fields?.customerNotes ?? null,
    last_message_at: nowIso(),
    metadata: fields?.occasion ? { occasion: fields.occasion } : {},
  }

  const { data } = (await supabase
    .from('leads')
    .insert(payload as never)
    .select('*')
    .single()) as { data: Lead | null }
  return data as Lead
}

async function createOrUpdateHandoff(params: {
  customerId: string
  conversationId: string
  reason: string
}) {
  const supabase = getServerSupabaseClient()
  const { data: existing } = (await supabase
    .from('handoffs')
    .select('*')
    .eq('conversation_id', params.conversationId)
    .in('status', ['pending', 'in_progress'])
    .maybeSingle()) as { data: Handoff | null }

  if (existing) {
    return existing as Handoff
  }

  const { data } = (await supabase
    .from('handoffs')
    .insert({
      customer_id: params.customerId,
      conversation_id: params.conversationId,
      reason: params.reason,
      status: 'pending',
      requested_at: nowIso(),
      resolved_at: null,
      resolved_by: null,
      metadata: {},
    } as never)
    .select('*')
    .single()) as { data: Handoff | null }

  return data as Handoff
}

async function sendWhatsAppMessage(params: {
  conversation: Conversation
  customer: Customer
  interactionId: string | null
  body: string
  workspaceId?: string
}) {
  const supabase = getServerSupabaseClient()
  const runtime = await resolveWhatsAppRuntime(params.workspaceId)
  const splitLongMessages = runtime.channelConfig?.split_long_messages ?? true
  const maxMessageChars = runtime.channelConfig?.max_message_chars ?? 300
  const splitMessageDelaySeconds = runtime.channelConfig?.split_message_delay_seconds ?? 1
  const chunks = splitLongMessages
    ? splitLongWhatsAppMessage(params.body, maxMessageChars)
    : [params.body]

  let providerMessageId = `simulated-${randomUUID()}`
  let sendStatus = 'simulated'
  let responsePayload: WhatsAppSendApiResponse = { mode: 'simulated', chunk_count: chunks.length }
  let error: string | null = null

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]
    let chunkProviderMessageId = `simulated-${randomUUID()}`
    let chunkSendStatus = 'simulated'
    let chunkResponsePayload: WhatsAppSendApiResponse = {
      mode: 'simulated',
      chunk_index: index,
      chunk_count: chunks.length,
    }
    let chunkError: string | null = null

    if (runtime.accessToken && runtime.phoneNumberId) {
      try {
        const response = await fetch(
          `https://graph.facebook.com/v20.0/${runtime.phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${runtime.accessToken}`,
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: params.customer.phone.replace(/^\+/, ''),
              type: 'text',
              text: { body: chunk },
            }),
          }
        )

        chunkResponsePayload = (await response.json().catch(() => ({}))) as WhatsAppSendApiResponse
        if (response.ok) {
          chunkProviderMessageId =
            chunkResponsePayload.messages?.[0]?.id || chunkProviderMessageId
          chunkSendStatus = 'sent'
        } else {
          chunkSendStatus = 'failed'
          chunkError =
            (chunkResponsePayload as { error?: { message?: string } }).error?.message ||
            'Falha no envio'
        }
      } catch (sendError) {
        chunkSendStatus = 'failed'
        chunkError = (sendError as Error).message
        chunkResponsePayload = { mode: 'real_failed', chunk_index: index, chunk_count: chunks.length }
      }
    }

    await supabase.from('whatsapp_sends').insert({
      conversation_id: params.conversation.id,
      interaction_id: params.interactionId,
      customer_id: params.customer.id,
      to_phone: params.customer.phone,
      message_body: chunk,
      provider_message_id: chunkProviderMessageId,
      status: chunkSendStatus,
      error: chunkError,
      payload: {
        body: chunk,
        chunk_index: index,
        chunk_count: chunks.length,
        split_long_messages: splitLongMessages,
        max_message_chars: maxMessageChars,
        split_message_delay_seconds: splitMessageDelaySeconds,
        phone_number_id: runtime.phoneNumberId,
        config_source: runtime.source,
      },
      response: chunkResponsePayload,
    } as never)

    providerMessageId = chunkProviderMessageId
    sendStatus = chunkSendStatus
    responsePayload = chunkResponsePayload
    error = chunkError

    if (chunkSendStatus === 'failed') {
      break
    }

    if (index < chunks.length - 1 && splitMessageDelaySeconds > 0) {
      await wait(splitMessageDelaySeconds * 1000)
    }
  }

  return {
    providerMessageId,
    sendStatus,
    error,
    responsePayload,
  }
}

export async function processInboundMessage(input: {
  customerName: string
  phone: string
  body: string
  externalMessageId?: string | null
  workspaceId?: string
  payload?: Record<string, unknown>
  source?: 'webhook' | 'diagnostic'
  /** When set, the webhook_events row to update instead of inserting new ones. */
  webhookEventId?: string | null
  /** Inbound phone_number_id from Meta, used to pick the right environment. */
  inboundPhoneNumberId?: string
}) {
  const supabase = getServerSupabaseClient()
  const workspaceId = getWorkspaceId(input.workspaceId)
  const t0 = Date.now()
  const [settings, agentProfile, knowledgeMatches, whatsappRuntime] = await Promise.all([
    getCrmSettings(workspaceId),
    getPrimaryAgentProfile(workspaceId),
    getKnowledgeMatches(input.body, workspaceId),
    resolveWhatsAppRuntime(workspaceId, input.inboundPhoneNumberId),
  ])
  const retrievalLatencyMs = Date.now() - t0

  const recordWebhookOutcome = async (
    processing_result: string,
    error: string | null = null
  ) => {
    if (input.webhookEventId) {
      await supabase
        .from('webhook_events')
        .update({ processed: true, processing_result, error } as never)
        .eq('id', input.webhookEventId)
      return
    }
    await supabase.from('webhook_events').insert({
      provider: 'meta',
      event_type: 'message',
      external_message_id: input.externalMessageId || `local-${randomUUID()}`,
      phone_number_id: whatsappRuntime.phoneNumberId,
      wa_id: input.phone,
      payload: input.payload || {},
      signature_valid: true,
      processed: true,
      processing_result,
      error,
    } as never)
  }

  if (input.externalMessageId) {
    const { data: duplicate } = (await supabase
      .from('interactions')
      .select('id, conversation_id')
      .eq('external_message_id', input.externalMessageId)
      .maybeSingle()) as { data: Pick<Interaction, 'id' | 'conversation_id'> | null }

    if (duplicate) {
      await recordWebhookOutcome('duplicate_ignored')
      return { duplicate: true, conversationId: duplicate.conversation_id }
    }
  }

  const customer = await findOrCreateCustomer(input.phone, input.customerName)
  const conversation = await findOrCreateConversation(customer, input.body)
  const inbound = await createInboundInteraction({
    conversationId: conversation.id,
    customerId: customer.id,
    body: input.body,
    externalMessageId: input.externalMessageId,
    metadata: { source: input.source || 'diagnostic' },
  })
  const conversationHistory = await getConversationHistory(conversation.id)

  const classifyStart = Date.now()
  const classification = await classifyMessage(
    input.body,
    settings,
    knowledgeMatches,
    agentProfile,
    conversationHistory,
    workspaceId
  )
  const classifyLatencyMs = Date.now() - classifyStart

  const agentRun = await createAgentRun({
    conversation_id: conversation.id,
    interaction_id: inbound.id,
    task: 'classify_intent',
    model:
      classification.modelUsed ||
      (classification.source === 'heuristic' ? 'heuristic-router' : 'provider-router'),
    input: {
      message: input.body,
      conversation_history: conversationHistory.map((turn) => ({
        sender_type: turn.senderType,
        direction: turn.direction,
        body: turn.body,
        created_at: turn.createdAt,
      })) as unknown as Json,
      knowledge_document_ids: classification.knowledgeDocumentIds,
      knowledge_chunk_ids: classification.knowledgeChunkIds,
      knowledge_titles: knowledgeMatches.map((item) => item.title),
    },
    output: {
      ...(classification as unknown as Record<string, Json>),
      stage_latency_ms: {
        retrieval: retrievalLatencyMs,
        classify_and_generate: classifyLatencyMs,
      } as unknown as Json,
    },
    intent: classification.intent,
    status: 'success',
    error: null,
    latency_ms: retrievalLatencyMs + classifyLatencyMs,
    cost_estimate: null,
    route_reason: classification.routeReason,
    delegation_result: classification.shouldHandoff ? 'handoff_requested' : 'handled_by_crm_ai',
  })

  let lead: Lead | null = null
  let handoff: Handoff | null = null

  if (classification.shouldCreateLead) {
    const extractedFields =
      (classification.extractedData?.leadFields as ParsedLeadFields | undefined) || null

    // Score derived from how much structured data we already have. Reservation
    // interest with date+party is hot; bare interest without data stays warm.
    let derivedScore = classification.intent === 'reservation_interest' ? 70 : 50
    if (extractedFields?.desiredDate) derivedScore += 10
    if (extractedFields?.partySize) derivedScore += 10
    if (extractedFields?.occasion) derivedScore += 5
    derivedScore = Math.min(derivedScore, 95)

    lead = await createOrUpdateLead({
      customerId: customer.id,
      conversationId: conversation.id,
      intent: classification.intent,
      summary: classification.leadSummary,
      score: derivedScore,
      fields: extractedFields,
    })
  }

  if (classification.shouldHandoff || conversation.status === 'human_active') {
    handoff = await createOrUpdateHandoff({
      customerId: customer.id,
      conversationId: conversation.id,
      reason:
        classification.intent === 'complaint'
          ? 'Cliente reportou problema no atendimento'
          : 'Cliente pediu atendimento humano',
    })

    await updateConversation(conversation.id, {
      status: 'handoff_requested',
      current_intent: classification.intent,
      last_message_preview: input.body,
      unread_count: conversation.unread_count + 1,
      updated_at: nowIso(),
    })

    const shouldSendHandoffReply =
      settings.aiEnabled &&
      classification.shouldHandoff &&
      conversation.status !== 'human_active' &&
      conversation.status !== 'handoff_requested'

    if (shouldSendHandoffReply) {
      const handoffMaxChars = agentProfile?.max_response_chars ?? 420
      const formattedHandoffReply = formatAgentReplyBlocks(
        truncateReplyToLimit(
          classification.reply || settings.handoffMessage,
          handoffMaxChars
        )
      )

      const outbound = await createOutboundInteraction({
        conversationId: conversation.id,
        customerId: customer.id,
        body: formattedHandoffReply,
        senderType: 'ai',
        metadata: {
          mode: 'handoff',
          knowledge_document_ids: classification.knowledgeDocumentIds,
          knowledge_chunk_ids: classification.knowledgeChunkIds,
        },
      })

      const sendResult = await sendWhatsAppMessage({
        conversation,
        customer,
        interactionId: outbound.id,
        body: outbound.body || formattedHandoffReply,
        workspaceId,
      })

      await updateConversation(conversation.id, {
        last_outbound_at: nowIso(),
        last_message_preview: outbound.body,
      })

      await recordWebhookOutcome(
        sendResult.sendStatus === 'failed' ? 'handoff_reply_failed' : 'handoff_requested',
        sendResult.error
      )
    }

    if (conversation.status === 'human_active') {
      await updateConversation(conversation.id, {
        status: 'human_active',
        assigned_to: conversation.assigned_to || 'Operador',
        current_intent: classification.intent,
        last_message_preview: input.body,
        unread_count: conversation.unread_count + 1,
        updated_at: nowIso(),
      })
    }

    // Catch the no-send sub-branches (handoff already open, or human owns the
    // conversation) so the webhook_events row doesn't stay processed=false.
    if (!shouldSendHandoffReply) {
      await recordWebhookOutcome(
        conversation.status === 'human_active'
          ? 'suppressed_human_active'
          : 'handoff_already_open'
      )
    }

    return { customer, conversation, inbound, lead, handoff, agentRun }
  }

  if (settings.aiEnabled) {
    if (conversation.status === 'handoff_requested') {
      await syncOpenHandoffForConversation(conversation.id, 'release_to_ai')
    }

    const replyMaxChars = agentProfile?.max_response_chars ?? 420
    const formattedReply = formatAgentReplyBlocks(
      truncateReplyToLimit(classification.reply, replyMaxChars)
    )

    const outbound = await createOutboundInteraction({
      conversationId: conversation.id,
      customerId: customer.id,
      body: formattedReply,
      senderType: 'ai',
      metadata: {
        source: classification.source,
        knowledge_document_ids: classification.knowledgeDocumentIds,
        knowledge_chunk_ids: classification.knowledgeChunkIds,
      },
    })

    const sendResult = await sendWhatsAppMessage({
      conversation,
      customer,
      interactionId: outbound.id,
      body: formattedReply,
      workspaceId,
    })

    await updateConversation(conversation.id, {
      status: 'ai_active',
      current_intent: classification.intent,
      last_outbound_at: nowIso(),
      last_message_preview: formattedReply,
      updated_at: nowIso(),
    })

    await recordWebhookOutcome(
      sendResult.sendStatus === 'failed' ? 'reply_failed' : 'handled_by_crm_ai',
      sendResult.error
    )
  } else {
    // AI disabled globally — log the suppressed event so it isn't stuck pending.
    await recordWebhookOutcome('suppressed_ai_disabled')
  }

  return { customer, conversation, inbound, lead, handoff, agentRun }
}

export async function fetchDashboardData() {
  const supabase = getServerSupabaseClient()
  const [conversationsRes, runsRes, handoffRes, leadsRes, latenciesRes] = await Promise.all([
    supabase.from('conversations').select('*, customers(*)').order('updated_at', { ascending: false }).limit(8),
    supabase.from('agent_runs').select('*').order('created_at', { ascending: false }).limit(6),
    supabase.from('handoffs').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('leads').select('*').order('updated_at', { ascending: false }),
    supabase.from('agent_runs').select('latency_ms').not('latency_ms', 'is', null),
  ])

  const firstError =
    conversationsRes.error ||
    runsRes.error ||
    handoffRes.error ||
    leadsRes.error ||
    latenciesRes.error

  if (firstError) {
    throw new Error(firstError.message)
  }

  const conversations = (conversationsRes.data || []) as ConversationWithCustomer[]
  const runs = (runsRes.data || []) as AgentRun[]
  const leads = (leadsRes.data || []) as Lead[]
  const latencies = (latenciesRes.data || []) as Array<{ latency_ms: number | null }>
  const avgResponseTime = latencies.length
    ? Math.round(
        latencies.reduce((acc, item) => acc + (item.latency_ms || 0), 0) / latencies.length
      )
    : 0

  const stats: DashboardStats = {
    activeConversations: conversations.filter((item) => item.status !== 'closed').length,
    unreadMessages: conversations.reduce((acc, item) => acc + (item.unread_count || 0), 0),
    pendingHandoffs: handoffRes.count || 0,
    newLeads: leads.filter((item) => item.status === 'new').length,
    qualifyingLeads: leads.filter((item) => item.status === 'qualifying').length,
    aiResponseRate: runs.length
      ? Math.round((runs.filter((item) => item.status === 'success').length / runs.length) * 100)
      : 0,
    errorsLast24h: runs.filter((item) => item.status === 'error').length,
    avgResponseTime,
  }

  return { stats, conversations, runs }
}

export async function listConversations() {
  const supabase = getServerSupabaseClient()
  const { data } = await supabase
    .from('conversations')
    .select('*, customers(*)')
    .order('updated_at', { ascending: false })

  return (data || []) as ConversationWithCustomer[]
}

export async function getConversationDetail(conversationId: string) {
  const supabase = getServerSupabaseClient()
  const [{ data: conversation }, { data: messages }, { data: handoff }, { data: lead }] =
    await Promise.all([
      supabase.from('conversations').select('*, customers(*)').eq('id', conversationId).single(),
      supabase.from('interactions').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true }),
      supabase.from('handoffs').select('*').eq('conversation_id', conversationId).in('status', ['pending', 'in_progress']).maybeSingle(),
      supabase.from('leads').select('*').eq('conversation_id', conversationId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    ])

  if (!conversation) {
    throw new Error('Conversa não encontrada')
  }

  return {
    conversation: conversation as unknown as ConversationWithCustomer,
    messages: (messages || []) as Interaction[],
    handoff: (handoff as unknown as Handoff | null) || null,
    lead: (lead as unknown as Lead | null) || null,
  }
}

export async function sendManualReply(conversationId: string, body: string) {
  const detail = await getConversationDetail(conversationId)
  const conversation = detail.conversation
  const customer = conversation.customers
  if (!customer) throw new Error('Cliente não encontrado')

  // Detect whether the last outbound from the AI exists and the human is now
  // overriding it. We use this signal in telemetry to grade reply quality.
  const supabase = getServerSupabaseClient()
  const { data: lastAiOutbound } = (await supabase
    .from('interactions')
    .select('id, created_at')
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .eq('sender_type', 'ai')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()) as { data: { id: string; created_at: string } | null }

  const lastInboundAt = detail.messages
    .filter((m) => m.direction === 'inbound')
    .at(-1)?.created_at

  // Override = AI replied AFTER the last customer message AND a human is now
  // typing a different response. Without an inbound, the human is just
  // sending a proactive message.
  const overrodeAiReply = Boolean(
    lastAiOutbound && lastInboundAt && lastAiOutbound.created_at > lastInboundAt
  )

  const outbound = await createOutboundInteraction({
    conversationId,
    customerId: customer.id,
    body,
    senderType: 'human',
    metadata: {
      source: 'manual_reply',
      human_overrode_reply: overrodeAiReply,
      overridden_ai_interaction_id: overrodeAiReply ? lastAiOutbound?.id ?? null : null,
    },
  })

  const sendResult = await sendWhatsAppMessage({
    conversation,
    customer,
    interactionId: outbound.id,
    body,
  })

  await updateConversation(conversationId, {
    status: 'human_active',
    assigned_to: 'Operador',
    last_outbound_at: nowIso(),
    last_message_preview: body,
    unread_count: 0,
    updated_at: nowIso(),
  })

  await syncOpenHandoffForConversation(conversationId, 'claim')

  return { outbound, sendResult }
}

export async function requestConversationHandoff(conversationId: string, reason: string) {
  const detail = await getConversationDetail(conversationId)
  const customer = detail.conversation.customers
  if (!customer) throw new Error('Cliente não encontrado')

  const handoff = await createOrUpdateHandoff({
    customerId: customer.id,
    conversationId,
    reason,
  })

  await updateConversation(conversationId, {
    status: 'handoff_requested',
    assigned_to: null,
    updated_at: nowIso(),
  })

  return handoff
}

export async function updateConversationState(conversationId: string, status: Conversation['status']) {
  let closingMessagePreview: string | null = null

  if (status === 'closed') {
    const settings = await getCrmSettings()
    const detail = await getConversationDetail(conversationId)
    const customer = detail.conversation.customers

    if (customer) {
      const closingMessage = settings.closingMessage || DEFAULT_CLOSING_MESSAGE
      closingMessagePreview = closingMessage
      const outbound = await createOutboundInteraction({
        conversationId,
        customerId: customer.id,
        body: closingMessage,
        senderType: 'system',
        metadata: { source: 'closing_message' },
      })

      await sendWhatsAppMessage({
        conversation: detail.conversation,
        customer,
        interactionId: outbound.id,
        body: closingMessage,
      })
    }
  }

  if (status === 'human_active') {
    await syncOpenHandoffForConversation(conversationId, 'claim')
  }

  if (status === 'ai_active' || status === 'closed') {
    await syncOpenHandoffForConversation(conversationId, 'resolve')
  }

  const updates: Partial<Conversation> = {
    status,
    updated_at: nowIso(),
  }

  if (status === 'human_active') updates.assigned_to = 'Operador'
  if (status === 'ai_active') updates.assigned_to = null
  if (status === 'closed') {
    updates.unread_count = 0
    updates.assigned_to = null
    updates.last_outbound_at = nowIso()
    updates.last_message_preview = closingMessagePreview || 'Atendimento encerrado'
  }

  await updateConversation(conversationId, updates)
}

export async function claimHandoff(handoffId: string) {
  const supabase = getServerSupabaseClient()
  const { data } = await supabase
    .from('handoffs')
    .update({
      status: 'in_progress',
      metadata: { claimed_by: 'Operador', claimed_at: nowIso() },
    } as never)
    .eq('id', handoffId)
    .select('*')
    .single()

  if (!data) {
    throw new Error('Handoff não encontrado')
  }

  const handoff = data as unknown as Handoff
  await updateConversation(handoff.conversation_id, {
    status: 'human_active',
    assigned_to: 'Operador',
    updated_at: nowIso(),
  })
  return handoff
}

export async function resolveHandoff(handoffId: string) {
  const supabase = getServerSupabaseClient()
  const { data } = await supabase
    .from('handoffs')
    .update({
      status: 'resolved',
      resolved_at: nowIso(),
      resolved_by: 'Operador',
    } as never)
    .eq('id', handoffId)
    .select('*')
    .single()

  if (!data) {
    throw new Error('Handoff não encontrado')
  }

  const handoff = data as unknown as Handoff
  await updateConversation(handoff.conversation_id, {
    status: 'ai_active',
    assigned_to: null,
    updated_at: nowIso(),
  })
  return handoff
}

export async function listLeads() {
  const supabase = getServerSupabaseClient()
  const { data } = await supabase
    .from('leads')
    .select('*, customers(*), conversations(*)')
    .order('updated_at', { ascending: false })

  return (data || []) as LeadWithRelations[]
}

export async function listHandoffs() {
  const supabase = getServerSupabaseClient()
  const { data } = await supabase
    .from('handoffs')
    .select('*, customers(*), conversations(*)')
    .order('requested_at', { ascending: false })

  return (data || []) as HandoffWithRelations[]
}

export async function listLogs() {
  const supabase = getServerSupabaseClient()
  const [runsRes, webhooksRes, interactionsRes, sendsRes] = await Promise.all([
    supabase.from('agent_runs').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('webhook_events').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('interactions').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('whatsapp_sends').select('*').order('created_at', { ascending: false }).limit(100),
  ])

  return {
    runs: (runsRes.data || []) as AgentRun[],
    webhooks: (webhooksRes.data || []) as WebhookEvent[],
    interactions: (interactionsRes.data || []) as Interaction[],
    sends: sendsRes.data || [],
  }
}
