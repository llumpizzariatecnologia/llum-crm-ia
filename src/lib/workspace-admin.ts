import 'server-only'

import { DEFAULT_WORKSPACE_ID } from '@/lib/constants'
import { getServerSupabaseClient } from '@/lib/server/supabase'
import type {
  AgentProfile,
  Json,
  KnowledgeDocument,
  WhatsappChannelConfig,
  WhatsappTemplate,
  WhatsappTemplateButton,
} from '@/types/database'

function getWorkspaceId(workspaceId?: string) {
  return workspaceId || DEFAULT_WORKSPACE_ID
}

function nowIso() {
  return new Date().toISOString()
}

export const defaultAgentProfileInput = {
  name: 'LLUM Atendimento Principal',
  description: 'Perfil operacional padrão para atendimento inbound da LLUM.',
  assistantName: 'Marcos',
  tone: 'acolhedor, simpático, claro e objetivo',
  systemPrompt:
    'Você é o agente principal da LLUM Pizzaria. Responda com clareza, naturalidade e sem inventar preços, promoções, disponibilidade ou políticas. Quando faltar segurança, faça handoff.',
  businessContext:
    'Atendimento da LLUM Pizzaria via WhatsApp com foco em cardápio, reservas, horários, preços, espaço kids e suporte humano.',
  handoffMessage:
    'Perfeito! Vou chamar um atendente da LLUM pra te ajudar melhor. Enquanto isso, se quiser, já pode me mandar mais detalhes por aqui.',
  model: 'gpt-4.1-mini',
  temperature: 0.2,
  aiEnabled: true,
  handoffOnUnknown: true,
  maxResponseChars: 420,
  status: 'active' as const,
}

export const defaultWhatsappChannelInput = {
  displayName: 'LLUM WhatsApp Oficial',
  phoneNumberId: '',
  wabaId: '',
  webhookUrl: '',
  graphApiVersion: 'v20.0',
  verifiedName: '',
  qualityRating: '',
  status: 'draft' as const,
}

type AgentProfileInput = {
  id?: string
  name: string
  description: string
  assistantName: string
  tone: string
  systemPrompt: string
  businessContext: string
  handoffMessage: string
  model: string
  temperature: number
  aiEnabled: boolean
  handoffOnUnknown: boolean
  maxResponseChars: number
  status: AgentProfile['status']
}

type WhatsappChannelConfigInput = {
  id?: string
  displayName: string
  phoneNumberId: string
  wabaId: string
  webhookUrl: string
  graphApiVersion: string
  verifiedName: string
  qualityRating: string
  status: WhatsappChannelConfig['status']
}

export function evaluateTemplateCompliance(input: {
  category: string
  bodyText: string
  footerText?: string
  variables: string[]
  buttons: WhatsappTemplateButton[]
}) {
  const warnings: string[] = []

  if (input.bodyText.length > 900) {
    warnings.push('Body longo demais. A Meta tende a aprovar melhor textos mais objetivos.')
  }

  if (/promoção imperdível|garantido|100%|clique já/i.test(input.bodyText)) {
    warnings.push('Evite claims agressivos ou promessas absolutas no texto.')
  }

  if (input.variables.length === 0 && /\{\{.+\}\}/.test(input.bodyText)) {
    warnings.push('Foram encontrados placeholders no body sem variável cadastrada.')
  }

  if (input.category === 'authentication' && input.buttons.some((button) => button.type !== 'quick_reply')) {
    warnings.push('Templates de autenticação costumam exigir estrutura bem mais restrita.')
  }

  if ((input.footerText || '').length > 60) {
    warnings.push('Footer acima do limite recomendado para template da Meta.')
  }

  return {
    warnings,
    summary:
      warnings.length === 0
        ? 'Checklist inicial ok para submissão.'
        : `Checklist com ${warnings.length} alerta(s): ${warnings.join(' ')}`,
  }
}

export async function listAgentProfiles(workspaceId?: string) {
  const supabase = getServerSupabaseClient()
  const { data, error } = await supabase
    .from('agent_profiles')
    .select('*')
    .eq('workspace_id', getWorkspaceId(workspaceId))
    .order('updated_at', { ascending: false })

  if (error) return [] as AgentProfile[]
  return (data || []) as AgentProfile[]
}

export async function getPrimaryAgentProfile(workspaceId?: string) {
  const profiles = await listAgentProfiles(workspaceId)
  return profiles.find((profile) => profile.status === 'active') || profiles[0] || null
}

async function demoteOtherAgentProfiles(workspace: string, currentProfileId?: string) {
  const supabase = getServerSupabaseClient()
  let query = supabase
    .from('agent_profiles')
    .update({ status: 'draft', is_default: false } as never)
    .eq('workspace_id', workspace)
    .eq('status', 'active')

  if (currentProfileId) {
    query = query.neq('id', currentProfileId)
  }

  await query
}

export async function saveAgentProfile(input: AgentProfileInput, workspaceId?: string) {
  const supabase = getServerSupabaseClient()
  const workspace = getWorkspaceId(workspaceId)

  const row = {
    workspace_id: workspace,
    name: input.name,
    description: input.description || null,
    assistant_name: input.assistantName,
    tone: input.tone,
    system_prompt: input.systemPrompt,
    business_context: input.businessContext,
    handoff_message: input.handoffMessage,
    model: input.model,
    temperature: input.temperature,
    ai_enabled: input.aiEnabled,
    handoff_on_unknown: input.handoffOnUnknown,
    max_response_chars: input.maxResponseChars,
    status: input.status,
    is_default: input.status === 'active',
    updated_at: nowIso(),
  }

  if (input.status === 'active') {
    await demoteOtherAgentProfiles(workspace, input.id)
  }

  if (input.id) {
    const { data, error } = await supabase
      .from('agent_profiles')
      .update(row as never)
      .eq('id', input.id)
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return data as AgentProfile
  }

  const { data, error } = await supabase
    .from('agent_profiles')
    .insert({
      ...row,
      created_at: nowIso(),
    } as never)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as AgentProfile
}

export async function deleteAgentProfile(profileId: string, workspaceId?: string) {
  const supabase = getServerSupabaseClient()
  const workspace = getWorkspaceId(workspaceId)

  const { data: existing, error: existingError } = await supabase
    .from('agent_profiles')
    .select('*')
    .eq('id', profileId)
    .eq('workspace_id', workspace)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)
  if (!existing) throw new Error('Perfil nao encontrado')

  const { error: deleteError } = await supabase
    .from('agent_profiles')
    .delete()
    .eq('id', profileId)
    .eq('workspace_id', workspace)

  if (deleteError) throw new Error(deleteError.message)

  const remainingProfiles = await listAgentProfiles(workspace)
  const hasActiveProfile = remainingProfiles.some((profile) => profile.status === 'active')

  if (!hasActiveProfile && remainingProfiles[0]) {
    const { error: promoteError } = await supabase
      .from('agent_profiles')
      .update({
        status: 'active',
        is_default: true,
        updated_at: nowIso(),
      } as never)
      .eq('id', remainingProfiles[0].id)

    if (promoteError) throw new Error(promoteError.message)
  }
}

export async function listKnowledgeDocuments(workspaceId?: string) {
  const supabase = getServerSupabaseClient()
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('*')
    .eq('workspace_id', getWorkspaceId(workspaceId))
    .order('updated_at', { ascending: false })

  if (error) return [] as KnowledgeDocument[]
  return (data || []) as KnowledgeDocument[]
}

export async function saveKnowledgeDocument(
  input: {
    id?: string
    title: string
    category: string
    sourceType: KnowledgeDocument['source_type']
    content: string
    summary: string
    tags: string[]
    status: KnowledgeDocument['status']
  },
  workspaceId?: string
) {
  const supabase = getServerSupabaseClient()
  const workspace = getWorkspaceId(workspaceId)

  if (input.id) {
    const existing = (await supabase
      .from('knowledge_documents')
      .select('version')
      .eq('id', input.id)
      .single()) as { data: { version: number } | null }

    const version = (existing.data?.version || 1) + 1
    const { data, error } = await supabase
      .from('knowledge_documents')
      .update({
        workspace_id: workspace,
        title: input.title,
        category: input.category,
        source_type: input.sourceType,
        content: input.content,
        summary: input.summary || null,
        tags: input.tags,
        status: input.status,
        version,
        last_reviewed_at: input.status === 'published' ? nowIso() : null,
        updated_at: nowIso(),
      } as never)
      .eq('id', input.id)
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return data as KnowledgeDocument
  }

  const { data, error } = await supabase
    .from('knowledge_documents')
    .insert({
      workspace_id: workspace,
      title: input.title,
      category: input.category,
      source_type: input.sourceType,
      content: input.content,
      summary: input.summary || null,
      tags: input.tags,
      status: input.status,
      version: 1,
      last_reviewed_at: input.status === 'published' ? nowIso() : null,
      created_at: nowIso(),
      updated_at: nowIso(),
    } as never)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as KnowledgeDocument
}

export async function deleteKnowledgeDocument(documentId: string, workspaceId?: string) {
  const supabase = getServerSupabaseClient()
  const workspace = getWorkspaceId(workspaceId)

  const { data: existing, error: existingError } = await supabase
    .from('knowledge_documents')
    .select('id')
    .eq('id', documentId)
    .eq('workspace_id', workspace)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)
  if (!existing) throw new Error('Documento nao encontrado')

  const { error: chunkDeleteError } = await supabase
    .from('knowledge_chunks')
    .delete()
    .eq('document_id', documentId)

  if (chunkDeleteError) throw new Error(chunkDeleteError.message)

  const { error: documentDeleteError } = await supabase
    .from('knowledge_documents')
    .delete()
    .eq('id', documentId)
    .eq('workspace_id', workspace)

  if (documentDeleteError) throw new Error(documentDeleteError.message)
}

export async function getWhatsappChannelConfig(workspaceId?: string) {
  const supabase = getServerSupabaseClient()
  const { data, error } = await supabase
    .from('whatsapp_channel_configs')
    .select('*')
    .eq('workspace_id', getWorkspaceId(workspaceId))
    .maybeSingle()

  if (error) return null
  return (data as WhatsappChannelConfig | null) || null
}

export async function saveWhatsappChannelConfig(
  input: WhatsappChannelConfigInput,
  workspaceId?: string
) {
  const supabase = getServerSupabaseClient()
  const workspace = getWorkspaceId(workspaceId)
  const existingConfig =
    input.id ? null : await getWhatsappChannelConfig(workspace)

  const row = {
    workspace_id: workspace,
    display_name: input.displayName,
    phone_number_id: input.phoneNumberId,
    waba_id: input.wabaId,
    webhook_url: input.webhookUrl || null,
    graph_api_version: input.graphApiVersion,
    verified_name: input.verifiedName || null,
    quality_rating: input.qualityRating || null,
    status: input.status,
    connected_at: input.status === 'connected' ? nowIso() : null,
    last_healthcheck_at: nowIso(),
    updated_at: nowIso(),
  }

  if (input.id || existingConfig?.id) {
    const { data, error } = await supabase
      .from('whatsapp_channel_configs')
      .update(row as never)
      .eq('id', input.id || existingConfig?.id || '')
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return data as WhatsappChannelConfig
  }

  const { data, error } = await supabase
    .from('whatsapp_channel_configs')
    .insert({
      ...row,
      created_at: nowIso(),
    } as never)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as WhatsappChannelConfig
}

export async function listWhatsappTemplates(workspaceId?: string) {
  const supabase = getServerSupabaseClient()
  const { data, error } = await supabase
    .from('whatsapp_templates')
    .select('*')
    .eq('workspace_id', getWorkspaceId(workspaceId))
    .order('updated_at', { ascending: false })

  if (error) return [] as WhatsappTemplate[]
  const items = (data || []) as unknown as WhatsappTemplate[]
  return items.map((item) => ({
    ...item,
    buttons: Array.isArray(item.buttons) ? (item.buttons as unknown as WhatsappTemplateButton[]) : [],
    variables: Array.isArray(item.variables) ? (item.variables as unknown as string[]) : [],
    sample_payload:
      item.sample_payload && typeof item.sample_payload === 'object'
        ? (item.sample_payload as Record<string, Json>)
        : {},
  })) as WhatsappTemplate[]
}

export async function saveWhatsappTemplate(
  input: {
    id?: string
    name: string
    metaName: string
    category: WhatsappTemplate['category']
    language: string
    status: WhatsappTemplate['status']
    headerType: WhatsappTemplate['header_type']
    headerText: string
    bodyText: string
    footerText: string
    buttons: WhatsappTemplateButton[]
    variables: string[]
    complianceNotes: string
  },
  workspaceId?: string
) {
  const supabase = getServerSupabaseClient()
  const workspace = getWorkspaceId(workspaceId)
  const lint = evaluateTemplateCompliance({
    category: input.category,
    bodyText: input.bodyText,
    footerText: input.footerText,
    buttons: input.buttons,
    variables: input.variables,
  })

  const row = {
    workspace_id: workspace,
    name: input.name,
    meta_name: input.metaName,
    category: input.category,
    language: input.language,
    status: input.status,
    header_type: input.headerType,
    header_text: input.headerType === 'text' ? input.headerText || null : null,
    body_text: input.bodyText,
    footer_text: input.footerText || null,
    buttons: input.buttons,
    variables: input.variables,
    sample_payload: Object.fromEntries(input.variables.map((item, index) => [item, `exemplo_${index + 1}`])),
    compliance_notes: input.complianceNotes || null,
    last_submission_at: input.status === 'submitted' ? nowIso() : null,
    last_review_result: lint.summary,
    updated_at: nowIso(),
  }

  if (input.id) {
    const { data, error } = await supabase
      .from('whatsapp_templates')
      .update(row as never)
      .eq('id', input.id)
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return { template: data as WhatsappTemplate, lint }
  }

  const { data, error } = await supabase
    .from('whatsapp_templates')
    .insert({
      ...row,
      created_at: nowIso(),
    } as never)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return { template: data as WhatsappTemplate, lint }
}
