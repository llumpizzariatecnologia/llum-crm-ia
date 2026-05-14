export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Customer {
  id: string
  name: string | null
  phone: string
  wa_id: string | null
  source: string
  first_seen_at: string
  last_seen_at: string
  metadata: Record<string, Json>
  created_at: string
  updated_at: string
}

export interface Conversation {
  id: string
  customer_id: string
  channel: string
  status: 'ai_active' | 'human_active' | 'handoff_requested' | 'waiting_human' | 'closed' | 'error'
  assigned_to: string | null
  last_inbound_at: string | null
  last_outbound_at: string | null
  unread_count: number
  last_message_preview: string | null
  current_intent: string | null
  metadata: Record<string, Json>
  created_at: string
  updated_at: string
}

export interface Interaction {
  id: string
  conversation_id: string
  customer_id: string
  direction: 'inbound' | 'outbound'
  sender_type: 'customer' | 'ai' | 'human' | 'system'
  message_type: string
  body: string | null
  external_message_id: string | null
  status: string
  metadata: Record<string, Json>
  created_at: string
}

export interface Lead {
  id: string
  customer_id: string
  conversation_id: string
  status:
    | 'new'
    | 'qualifying'
    | 'waiting_customer'
    | 'handoff_requested'
    | 'converted_to_reservation'
    | 'lost'
    | 'archived'
  source: string
  intent: string | null
  score: number
  summary: string | null
  desired_date: string | null
  desired_time: string | null
  party_size: number | null
  customer_notes: string | null
  last_message_at: string | null
  metadata: Record<string, Json>
  created_at: string
  updated_at: string
}

export interface Handoff {
  id: string
  customer_id: string
  conversation_id: string
  reason: string | null
  status: 'pending' | 'in_progress' | 'resolved' | 'cancelled'
  requested_at: string
  resolved_at: string | null
  resolved_by: string | null
  metadata: Record<string, Json>
}

export interface AgentRun {
  id: string
  conversation_id: string
  interaction_id: string | null
  task: string
  model: string | null
  input: Record<string, Json>
  output: Record<string, Json>
  intent: string | null
  status: 'success' | 'error' | 'queued'
  error: string | null
  latency_ms: number | null
  cost_estimate: number | null
  route_reason: string | null
  delegation_result: string | null
  created_at: string
}

export interface WebhookEvent {
  id: string
  provider: string
  event_type: string | null
  external_message_id: string | null
  phone_number_id: string | null
  wa_id: string | null
  payload: Record<string, Json>
  signature_valid: boolean | null
  processed: boolean
  processing_result: string | null
  error: string | null
  created_at: string
}

export interface WhatsappSend {
  id: string
  conversation_id: string
  interaction_id: string | null
  customer_id: string
  to_phone: string | null
  message_body: string | null
  provider_message_id: string | null
  status: string
  error: string | null
  payload: Record<string, Json>
  response: Record<string, Json>
  created_at: string
}

export interface Integration {
  id: string
  workspace_id: string | null
  provider: string
  encrypted_credentials: string
  label?: string | null
  masked_preview?: string | null
  status: string
  last_validated_at: string | null
  validation_error?: string | null
  created_at: string
  updated_at: string
}

export interface AgentProfile {
  id: string
  workspace_id: string | null
  name: string
  description: string | null
  assistant_name: string
  tone: string
  system_prompt: string
  business_context: string
  handoff_message: string
  model: string
  temperature: number
  ai_enabled: boolean
  handoff_on_unknown: boolean
  max_response_chars: number
  status: 'draft' | 'active' | 'archived'
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface KnowledgeDocument {
  id: string
  workspace_id: string | null
  title: string
  category: string
  source_type: 'faq' | 'policy' | 'menu' | 'pricing' | 'operations' | 'custom'
  content: string
  summary: string | null
  tags: string[]
  status: 'draft' | 'published' | 'archived'
  version: number
  last_reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface KnowledgeChunk {
  id: string
  workspace_id: string | null
  document_id: string
  chunk_index: number
  section_title: string | null
  page_start: number | null
  page_end: number | null
  token_estimate: number
  content: string
  summary: string | null
  tags: string[]
  embedding: string | null
  status: 'draft' | 'published' | 'archived'
  created_at: string
  updated_at: string
}

export interface WhatsappChannelConfig {
  id: string
  workspace_id: string | null
  display_name: string
  phone_number_id: string
  waba_id: string
  webhook_url: string | null
  graph_api_version: string
  verified_name: string | null
  quality_rating: string | null
  split_long_messages: boolean
  max_message_chars: number
  split_message_delay_seconds: number
  status: 'draft' | 'connected' | 'attention' | 'disconnected'
  connected_at: string | null
  last_healthcheck_at: string | null
  created_at: string
  updated_at: string
}

export interface WhatsappTemplateButton {
  type: 'quick_reply' | 'url' | 'phone_number'
  label: string
  value: string | null
}

export interface WhatsappTemplate {
  id: string
  workspace_id: string | null
  name: string
  meta_name: string
  category: 'marketing' | 'utility' | 'authentication'
  language: string
  status: 'draft' | 'ready_for_review' | 'submitted' | 'approved' | 'rejected' | 'paused'
  header_type: 'none' | 'text'
  header_text: string | null
  body_text: string
  footer_text: string | null
  buttons: WhatsappTemplateButton[]
  variables: string[]
  sample_payload: Record<string, Json>
  compliance_notes: string | null
  last_submission_at: string | null
  last_review_result: string | null
  created_at: string
  updated_at: string
}

export interface ConversationWithCustomer extends Conversation {
  customers: Customer | null
}

export interface LeadWithRelations extends Lead {
  customers: Customer | null
  conversations?: Conversation | null
}

export interface HandoffWithRelations extends Handoff {
  customers: Customer | null
  conversations?: Conversation | null
}

export interface InteractionWithConversation extends Interaction {
  conversations?: Conversation | null
}

export interface DashboardStats {
  activeConversations: number
  unreadMessages: number
  pendingHandoffs: number
  newLeads: number
  qualifyingLeads: number
  aiResponseRate: number
  errorsLast24h: number
  avgResponseTime: number
}

export interface CrmSettings {
  assistantName: string
  tone: string
  aiEnabled: boolean
  handoffMessage: string
  businessContext: string
  closingMessage?: string
}

export type Database = {
  public: {
    Tables: {
      customers: {
        Row: Customer
        Insert: Omit<Customer, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Customer>
      }
      conversations: {
        Row: Conversation
        Insert: Omit<Conversation, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Conversation>
      }
      interactions: {
        Row: Interaction
        Insert: Omit<Interaction, 'id' | 'created_at'>
        Update: Partial<Interaction>
      }
      leads: {
        Row: Lead
        Insert: Omit<Lead, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Lead>
      }
      handoffs: {
        Row: Handoff
        Insert: Omit<Handoff, 'id'>
        Update: Partial<Handoff>
      }
      agent_runs: {
        Row: AgentRun
        Insert: Omit<AgentRun, 'id' | 'created_at'>
        Update: Partial<AgentRun>
      }
      webhook_events: {
        Row: WebhookEvent
        Insert: Omit<WebhookEvent, 'id' | 'created_at'>
        Update: Partial<WebhookEvent>
      }
      whatsapp_sends: {
        Row: WhatsappSend
        Insert: Omit<WhatsappSend, 'id' | 'created_at'>
        Update: Partial<WhatsappSend>
      }
      integrations: {
        Row: Integration
        Insert: Omit<Integration, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Integration>
      }
      agent_profiles: {
        Row: AgentProfile
        Insert: Omit<AgentProfile, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<AgentProfile>
      }
      knowledge_documents: {
        Row: KnowledgeDocument
        Insert: Omit<KnowledgeDocument, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<KnowledgeDocument>
      }
      knowledge_chunks: {
        Row: KnowledgeChunk
        Insert: Omit<KnowledgeChunk, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<KnowledgeChunk>
      }
      whatsapp_channel_configs: {
        Row: WhatsappChannelConfig
        Insert: Omit<WhatsappChannelConfig, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<WhatsappChannelConfig>
      }
      whatsapp_templates: {
        Row: WhatsappTemplate
        Insert: Omit<WhatsappTemplate, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<WhatsappTemplate>
      }
    }
    Functions: {
      match_knowledge_chunks: {
        Args: {
          query_embedding: string
          query_workspace_id: string
          match_count?: number
        }
        Returns: Array<{
          id: string
          document_id: string
          title: string
          category: string
          summary: string | null
          section_title: string | null
          content: string
          score: number
          tags: Json
        }>
      }
    }
  }
}
