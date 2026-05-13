import { NextRequest, NextResponse } from 'next/server'
import { requireApiSession } from '@/lib/route-guards'
import { agentProfileSchema } from '@/lib/schemas'
import {
  deleteAgentProfile,
  defaultAgentProfileInput,
  getPrimaryAgentProfile,
  listAgentProfiles,
  saveAgentProfile,
} from '@/lib/workspace-admin'
import type { AgentProfile } from '@/types/database'

export const dynamic = 'force-dynamic'

function serializeProfile(profile: AgentProfile | null | undefined) {
  if (!profile) return null

  return {
    id: profile.id,
    name: profile.name,
    description: profile.description ?? '',
    assistantName: profile.assistant_name,
    tone: profile.tone,
    systemPrompt: profile.system_prompt,
    businessContext: profile.business_context,
    handoffMessage: profile.handoff_message,
    model: profile.model,
    temperature: profile.temperature,
    aiEnabled: profile.ai_enabled,
    handoffOnUnknown: profile.handoff_on_unknown,
    maxResponseChars: profile.max_response_chars,
    status: profile.status,
    updatedAt: profile.updated_at,
  }
}

export async function GET() {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const [profiles, primary] = await Promise.all([listAgentProfiles(), getPrimaryAgentProfile()])

  return NextResponse.json({
    profiles: profiles.map((profile) => serializeProfile(profile)).filter(Boolean),
    primary: serializeProfile(primary) || defaultAgentProfileInput,
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const payload = agentProfileSchema.safeParse(await request.json())
  if (!payload.success) {
    const firstIssue = payload.error.issues[0]
    return NextResponse.json(
      { error: firstIssue?.message || 'Perfil do agente invalido' },
      { status: 400 }
    )
  }

  const saved = await saveAgentProfile(payload.data)
  const profiles = await listAgentProfiles()

  return NextResponse.json({
    ok: true,
    profile: serializeProfile(saved),
    profiles: profiles.map((profile) => serializeProfile(profile)).filter(Boolean),
  })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiSession()
  if (!auth.ok) return auth.response

  const profileId = request.nextUrl.searchParams.get('id')?.trim()
  if (!profileId) {
    return NextResponse.json({ error: 'id do perfil e obrigatorio' }, { status: 400 })
  }

  await deleteAgentProfile(profileId)
  const [profiles, primary] = await Promise.all([listAgentProfiles(), getPrimaryAgentProfile()])

  return NextResponse.json({
    ok: true,
    deletedId: profileId,
    profiles: profiles.map((profile) => serializeProfile(profile)).filter(Boolean),
    primary: serializeProfile(primary) || defaultAgentProfileInput,
  })
}
