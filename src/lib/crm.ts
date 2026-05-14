import 'server-only'

import { randomUUID } from 'node:crypto'
import { decrypt, encrypt, maskCredential } from '@/lib/encryption'
import {
  CRM_CONFIG_PROVIDER,
  DEFAULT_CLOSING_MESSAGE,
  DEFAULT_WORKSPACE_ID,
  FALLBACK_REPLY,
  KNOWN_INTEGRATION_PROVIDERS,
} from '@/lib/constants'
import { getServerSupabaseClient } from '@/lib/server/supabase'
import {
  getPrimaryAgentProfile,
  getWhatsappChannelConfig,
} from '@/lib/workspace-admin'
import { searchKnowledgeMatches, type KnowledgeMatch } from '@/lib/knowledge-rag'
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

function formatAgentReplyBlocks(value: string) {
  const normalized = value
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()

  if (!normalized) return value
  if (normalized.includes('\n\n')) {
    return normalized
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .join('\n\n')
  }

  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((item) => item.trim()) || [
    normalized,
  ]

  const blocks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence
    const shouldBreak =
      current.length > 0 && (next.length > 180 || current.split(/[.!?]+/).filter(Boolean).length >= 2)

    if (shouldBreak) {
      blocks.push(current.trim())
      current = sentence
      continue
    }

    current = next
  }

  if (current.trim()) blocks.push(current.trim())
  return blocks.join('\n\n')
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
  let query = supabase.from('integrations').select('encrypted_credentials').eq('provider', provider)
  query = workspace ? query.eq('workspace_id', workspace) : query.is('workspace_id', null)
  const { data } = (await query.maybeSingle()) as {
    data: { encrypted_credentials: string | null } | null
  }

  if (!data?.encrypted_credentials) return null
  const decrypted = await decrypt(data.encrypted_credentials)
  return JSON.parse(decrypted) as StoredIntegrationPayload
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

export async function resolveWhatsAppRuntime(
  workspaceId?: string
): Promise<ResolvedWhatsAppRuntime> {
  const integration = await getDecryptedIntegration('whatsapp', workspaceId)
  const savedCredentials = integration?.credentials || {}
  const channelConfig = await getWhatsappChannelConfig(workspaceId)

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
    source,
  }
}

async function callOpenAiCompatibleProvider(input: {
  provider: Exclude<AiProvider, 'anthropic'>
  apiKey: string
  model: string
  temperature: number
  settings: CrmSettings
  knowledgeMatches: KnowledgeMatch[]
  agentProfile: AgentProfile | null
  message: string
  conversationHistory: ConversationContextTurn[]
}) {
  const endpointByProvider: Record<Exclude<AiProvider, 'anthropic'>, string> = {
    openai: 'https://api.openai.com/v1/chat/completions',
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    deepseek: 'https://api.deepseek.com/chat/completions',
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${input.apiKey}`,
  }

  if (input.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://llum.local'
    headers['X-Title'] = 'LLUM CRM IA'
  }

  const response = await fetch(endpointByProvider[input.provider], {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: input.model,
      temperature: input.temperature,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `VocÃª Ã© ${input.settings.assistantName}, assistente da LLUM Pizzaria. Responda em JSON com as chaves: intent, confidence, shouldCreateLead, shouldHandoff, reply, routeReason, leadSummary. Contexto: ${input.settings.businessContext}. Nunca invente preÃ§o ou disponibilidade.`,
        },
        {
          role: 'system',
          content: `Use a base publicada abaixo como fonte factual prioritÃ¡ria e nunca invente informaÃ§Ãµes:\n${buildKnowledgePrompt(
            input.knowledgeMatches
          )}`,
        },
        {
          role: 'system',
          content: `Considere o historico recente antes de responder. Preserve o contexto da conversa, inclusive o que ja foi respondido por humano ou IA, e responda de forma coerente com esse historico:\n${buildConversationContextPrompt(input.conversationHistory)}`,
        },
        ...(input.agentProfile?.system_prompt
          ? [{ role: 'system' as const, content: input.agentProfile.system_prompt }]
          : []),
        { role: 'user', content: input.message },
      ],
    }),
  })

  if (!response.ok) return null
  const data = await response.json()
  return data.choices?.[0]?.message?.content || null
}

async function callAnthropicProvider(input: {
  apiKey: string
  model: string
  temperature: number
  settings: CrmSettings
  knowledgeMatches: KnowledgeMatch[]
  agentProfile: AgentProfile | null
  message: string
  conversationHistory: ConversationContextTurn[]
}) {
  const systemParts = [
    `VocÃª Ã© ${input.settings.assistantName}, assistente da LLUM Pizzaria. Responda em JSON com as chaves: intent, confidence, shouldCreateLead, shouldHandoff, reply, routeReason, leadSummary. Contexto: ${input.settings.businessContext}. Nunca invente preÃ§o ou disponibilidade.`,
    `Use a base publicada abaixo como fonte factual prioritÃ¡ria e nunca invente informaÃ§Ãµes:\n${buildKnowledgePrompt(
      input.knowledgeMatches
    )}`,
    `Considere o historico recente antes de responder. Preserve o contexto da conversa, inclusive o que ja foi respondido por humano ou IA, e responda de forma coerente com esse historico:\n${buildConversationContextPrompt(input.conversationHistory)}`,
  ]

  if (input.agentProfile?.system_prompt) {
    systemParts.push(input.agentProfile.system_prompt)
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 700,
      temperature: input.temperature,
      system: systemParts.join('\n\n'),
      messages: [{ role: 'user', content: input.message }],
    }),
  })

  if (!response.ok) return null
  const data = await response.json()
  const textBlock = Array.isArray(data.content)
    ? data.content.find((item: { type?: string; text?: string }) => item?.type === 'text')
    : null
  return textBlock?.text || null
}

// Legacy classifier kept temporarily while the provider runtime is being migrated.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function classifyWithOpenAI(
  message: string,
  settings: CrmSettings,
  knowledgeMatches: KnowledgeMatch[],
  agentProfile: AgentProfile | null,
  conversationHistory: ConversationContextTurn[],
  workspaceId?: string
): Promise<ClassificationResult | null> {
  const resolvedProvider = await resolveAiProvider(workspaceId, agentProfile?.model)
  if (!resolvedProvider) return null

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolvedProvider.apiKey}`,
      },
      body: JSON.stringify({
        model: resolvedProvider.model,
        temperature: agentProfile?.temperature ?? 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Você é ${settings.assistantName}, assistente da LLUM Pizzaria. Responda em JSON com as chaves: intent, confidence, shouldCreateLead, shouldHandoff, reply, routeReason, leadSummary. Contexto: ${settings.businessContext}. Nunca invente preço ou disponibilidade.`,
          },
          {
            role: 'system',
            content: `Use a base publicada abaixo como fonte factual prioritária e nunca invente informações:\n${buildKnowledgePrompt(
              knowledgeMatches
            )}`,
          },
          {
            role: 'system',
            content: `Considere o historico recente antes de responder. Preserve o contexto da conversa, inclusive o que ja foi respondido por humano ou IA, e responda de forma coerente com esse historico:\n${buildConversationContextPrompt(conversationHistory)}`,
          },
          ...(agentProfile?.system_prompt
            ? [{ role: 'system' as const, content: agentProfile.system_prompt }]
            : []),
          { role: 'user', content: message },
        ],
      }),
    })

    if (!response.ok) return null
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return null

    const parsed = JSON.parse(content)
    return {
      intent: parsed.intent || 'other',
      confidence: Number(parsed.confidence || 0.7),
      shouldCreateLead: Boolean(parsed.shouldCreateLead),
      shouldHandoff: Boolean(parsed.shouldHandoff),
      reply: parsed.reply || FALLBACK_REPLY,
      routeReason: parsed.routeReason || 'openai_classification',
      leadSummary: parsed.leadSummary || undefined,
      extractedData: parsed.extractedData || {},
      source: 'openai',
      knowledgeDocumentIds: knowledgeMatches.map((item) => item.id),
      modelUsed: resolvedProvider.model,
    }
  } catch {
    return null
  }
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

  try {
    const content =
      resolvedProvider.provider === 'anthropic'
        ? await callAnthropicProvider({
            apiKey: resolvedProvider.apiKey,
            model: resolvedProvider.model,
            temperature: agentProfile?.temperature ?? 0.2,
            settings,
            knowledgeMatches,
            agentProfile,
            message,
            conversationHistory,
          })
        : await callOpenAiCompatibleProvider({
            provider: resolvedProvider.provider,
            apiKey: resolvedProvider.apiKey,
            model: resolvedProvider.model,
            temperature: agentProfile?.temperature ?? 0.2,
            settings,
            knowledgeMatches,
            agentProfile,
            message,
            conversationHistory,
          })

    if (!content) return null

    const parsed = JSON.parse(content)
    return {
      intent: parsed.intent || 'other',
      confidence: Number(parsed.confidence || 0.7),
      shouldCreateLead: Boolean(parsed.shouldCreateLead),
      shouldHandoff: Boolean(parsed.shouldHandoff),
      reply: parsed.reply || FALLBACK_REPLY,
      routeReason:
        parsed.routeReason ||
        `${resolvedProvider.provider}_classification_${resolvedProvider.credentialSource}`,
      leadSummary: parsed.leadSummary || undefined,
      extractedData: parsed.extractedData || {},
      source: 'provider',
      knowledgeDocumentIds: knowledgeMatches.map((item) => item.id),
      modelUsed: resolvedProvider.model,
      providerUsed: resolvedProvider.provider,
    }
  } catch {
    return null
  }
}

function classifyHeuristically(
  message: string,
  settings: CrmSettings,
  conversationHistory: ConversationContextTurn[] = []
): Omit<ClassificationResult, 'knowledgeDocumentIds' | 'modelUsed'> {
  const text = buildHeuristicSignalText(message, conversationHistory)
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

async function classifyMessage(
  message: string,
  settings: CrmSettings,
  knowledgeMatches: KnowledgeMatch[],
  agentProfile: AgentProfile | null,
  conversationHistory: ConversationContextTurn[],
  workspaceId?: string
) {
  const openAiResult = await classifyWithConfiguredProvider(
    message,
    settings,
    knowledgeMatches,
    agentProfile,
    conversationHistory,
    workspaceId
  )
  if (openAiResult) return openAiResult
  const heuristicResult = classifyHeuristically(message, settings, conversationHistory)
  return {
    ...heuristicResult,
    reply: buildKnowledgeAwareReply(heuristicResult.intent, knowledgeMatches) || heuristicResult.reply,
    knowledgeDocumentIds: knowledgeMatches.map((item) => item.id),
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
  action: 'claim' | 'resolve'
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
      : {
          status: 'resolved',
          resolved_at: nowIso(),
          resolved_by: 'Operador',
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

  if (existing) {
    await supabase
      .from('leads')
      .update({
        intent: params.intent,
        summary: params.summary || existing.summary,
        score: params.score ?? existing.score,
        last_message_at: nowIso(),
        updated_at: nowIso(),
      } as never)
      .eq('id', existing.id)

    return { ...existing, intent: params.intent } as Lead
  }

  const payload = {
    customer_id: params.customerId,
    conversation_id: params.conversationId,
    status: params.intent === 'reservation_interest' ? 'qualifying' : 'new',
    source: 'whatsapp',
    intent: params.intent,
    score: params.score ?? 50,
    summary: params.summary || null,
    desired_date: null,
    desired_time: null,
    party_size: null,
    customer_notes: null,
    last_message_at: nowIso(),
    metadata: {},
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
  let providerMessageId = `simulated-${randomUUID()}`
  let sendStatus = 'simulated'
  let responsePayload: WhatsAppSendApiResponse = { mode: 'simulated' }
  let error: string | null = null

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
            text: { body: params.body },
          }),
        }
      )

      responsePayload = (await response.json().catch(() => ({}))) as WhatsAppSendApiResponse
      if (response.ok) {
        providerMessageId = responsePayload.messages?.[0]?.id || providerMessageId
        sendStatus = 'sent'
      } else {
        sendStatus = 'failed'
        error = (responsePayload as { error?: { message?: string } }).error?.message || 'Falha no envio'
      }
    } catch (sendError) {
      sendStatus = 'failed'
      error = (sendError as Error).message
      responsePayload = { mode: 'real_failed' }
    }
  }

  await supabase.from('whatsapp_sends').insert({
    conversation_id: params.conversation.id,
    interaction_id: params.interactionId,
    customer_id: params.customer.id,
    to_phone: params.customer.phone,
    message_body: params.body,
    provider_message_id: providerMessageId,
    status: sendStatus,
    error,
    payload: {
      body: params.body,
      phone_number_id: runtime.phoneNumberId,
      config_source: runtime.source,
    },
    response: responsePayload,
  } as never)

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
}) {
  const supabase = getServerSupabaseClient()
  const workspaceId = getWorkspaceId(input.workspaceId)
  const [settings, agentProfile, knowledgeMatches, whatsappRuntime] = await Promise.all([
    getCrmSettings(workspaceId),
    getPrimaryAgentProfile(workspaceId),
    getKnowledgeMatches(input.body, workspaceId),
    resolveWhatsAppRuntime(workspaceId),
  ])

  if (input.externalMessageId) {
    const { data: duplicate } = (await supabase
      .from('interactions')
      .select('id, conversation_id')
      .eq('external_message_id', input.externalMessageId)
      .maybeSingle()) as { data: Pick<Interaction, 'id' | 'conversation_id'> | null }

    if (duplicate) {
      await supabase.from('webhook_events').insert({
        provider: 'meta',
        event_type: 'message',
        external_message_id: input.externalMessageId,
        phone_number_id: whatsappRuntime.phoneNumberId,
        wa_id: input.phone,
        payload: input.payload || {},
        signature_valid: true,
        processed: true,
        processing_result: 'duplicate_ignored',
        error: null,
      } as never)

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

  const classification = await classifyMessage(
    input.body,
    settings,
    knowledgeMatches,
    agentProfile,
    conversationHistory,
    workspaceId
  )

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
      knowledge_titles: knowledgeMatches.map((item) => item.title),
    },
    output: classification as unknown as Record<string, Json>,
    intent: classification.intent,
    status: 'success',
    error: null,
    latency_ms: classification.source === 'heuristic' ? 50 : 900,
    cost_estimate: null,
    route_reason: classification.routeReason,
    delegation_result: classification.shouldHandoff ? 'handoff_requested' : 'handled_by_crm_ai',
  })

  let lead: Lead | null = null
  let handoff: Handoff | null = null

  if (classification.shouldCreateLead) {
    lead = await createOrUpdateLead({
      customerId: customer.id,
      conversationId: conversation.id,
      intent: classification.intent,
      summary: classification.leadSummary,
      score: classification.intent === 'reservation_interest' ? 85 : 55,
    })
  }

  if (
    classification.shouldHandoff ||
    conversation.status === 'human_active' ||
    conversation.status === 'handoff_requested'
  ) {
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
      const outbound = await createOutboundInteraction({
        conversationId: conversation.id,
        customerId: customer.id,
        body: settings.handoffMessage,
        senderType: 'ai',
        metadata: {
          mode: 'handoff',
          knowledge_document_ids: classification.knowledgeDocumentIds,
        },
      })

      const sendResult = await sendWhatsAppMessage({
        conversation,
        customer,
        interactionId: outbound.id,
        body: outbound.body || settings.handoffMessage,
        workspaceId,
      })

      await updateConversation(conversation.id, {
        last_outbound_at: nowIso(),
        last_message_preview: outbound.body,
      })

      await supabase.from('webhook_events').insert({
        provider: 'meta',
        event_type: 'message',
        external_message_id: input.externalMessageId || `local-${randomUUID()}`,
        phone_number_id: whatsappRuntime.phoneNumberId,
        wa_id: customer.phone,
        payload: input.payload || {},
        signature_valid: true,
        processed: true,
        processing_result: sendResult.sendStatus === 'failed' ? 'handoff_reply_failed' : 'handoff_requested',
        error: sendResult.error,
      } as never)
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

    return { customer, conversation, inbound, lead, handoff, agentRun }
  }

  if (settings.aiEnabled) {
    const formattedReply = formatAgentReplyBlocks(classification.reply)

    const outbound = await createOutboundInteraction({
      conversationId: conversation.id,
      customerId: customer.id,
      body: formattedReply,
      senderType: 'ai',
      metadata: {
        source: classification.source,
        knowledge_document_ids: classification.knowledgeDocumentIds,
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

    await supabase.from('webhook_events').insert({
      provider: 'meta',
      event_type: 'message',
      external_message_id: input.externalMessageId || `local-${randomUUID()}`,
      phone_number_id: whatsappRuntime.phoneNumberId,
      wa_id: customer.phone,
      payload: input.payload || {},
      signature_valid: true,
      processed: true,
      processing_result: sendResult.sendStatus === 'failed' ? 'reply_failed' : 'handled_by_crm_ai',
      error: sendResult.error,
    } as never)
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

  const outbound = await createOutboundInteraction({
    conversationId,
    customerId: customer.id,
    body,
    senderType: 'human',
    metadata: { source: 'manual_reply' },
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
