export const APP_NAME = 'LLUM CRM IA'
export const APP_DESCRIPTION = 'CRM de WhatsApp com IA, leads, handoff e auditoria operacional.'

export const AUTH_COOKIE_NAME = 'llum_crm_session'
export const DEFAULT_WORKSPACE_ID = 'llum-default'
export const CRM_CONFIG_PROVIDER = 'workspace_config'
export const DEFAULT_CLOSING_MESSAGE =
  'Encerramos este atendimento por aqui. Se precisar de algo novo, pode me chamar neste mesmo WhatsApp que seguimos com voce.'

export const KNOWN_INTEGRATION_PROVIDERS = [
  'openai',
  'anthropic',
  'groq',
  'openrouter',
  'deepseek',
  'whatsapp',
] as const

export const CONVERSATION_STATUS_LABELS: Record<string, string> = {
  ai_active: 'IA ativa',
  human_active: 'Humano',
  handoff_requested: 'Handoff',
  waiting_human: 'Aguardando humano',
  closed: 'Fechada',
  error: 'Erro',
}

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: 'Novo',
  qualifying: 'Qualificando',
  waiting_customer: 'Aguardando cliente',
  handoff_requested: 'Handoff',
  converted_to_reservation: 'Convertido',
  lost: 'Perdido',
  archived: 'Arquivado',
}

export const FALLBACK_REPLY =
  'Entendi. Vou chamar uma pessoa da equipe da LLUM para te ajudar melhor. Enquanto isso, pode me adiantar mais detalhes por aqui.'
