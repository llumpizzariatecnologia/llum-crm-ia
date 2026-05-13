'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Save, Send } from 'lucide-react'
import { fetchJson } from '@/lib/client'

type TemplateButton = {
  type: 'quick_reply' | 'url' | 'phone_number'
  label: string
  value: string
}

type TemplateForm = {
  id?: string
  name: string
  metaName: string
  category: 'marketing' | 'utility' | 'authentication'
  language: string
  status: 'draft' | 'ready_for_review' | 'submitted' | 'approved' | 'rejected' | 'paused'
  headerType: 'none' | 'text'
  headerText: string
  bodyText: string
  footerText: string
  buttons: TemplateButton[]
  variables: string[]
  complianceNotes: string
  last_review_result?: string | null
}

const emptyTemplate: TemplateForm = {
  name: '',
  metaName: '',
  category: 'utility',
  language: 'pt_BR',
  status: 'draft',
  headerType: 'none',
  headerText: '',
  bodyText: '',
  footerText: '',
  buttons: [],
  variables: [],
  complianceNotes: '',
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateForm[]>([])
  const [form, setForm] = useState<TemplateForm>(emptyTemplate)
  const [variablesInput, setVariablesInput] = useState('')
  const [buttonsInput, setButtonsInput] = useState('')
  const [lint, setLint] = useState<{ summary: string; warnings: string[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const run = async () => {
      try {
        const data = await fetchJson<{ templates: TemplateForm[] }>('/api/whatsapp/templates')
        if (!active) return
        setTemplates(data.templates)
      } catch (err) {
        if (active) setError((err as Error).message)
      } finally {
        if (active) setLoading(false)
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [])

  function parseButtons(input: string) {
    return input
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [type = 'quick_reply', label = '', value = ''] = line.split('|').map((item) => item.trim())
        return { type: type as TemplateButton['type'], label, value }
      })
  }

  async function save() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        ...form,
        variables: variablesInput.split(',').map((item) => item.trim()).filter(Boolean),
        buttons: parseButtons(buttonsInput),
      }
      const data = await fetchJson<{ templates: TemplateForm[]; template: TemplateForm; lint: { summary: string; warnings: string[] } }>('/api/whatsapp/templates', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setTemplates(data.templates)
      setForm(data.template)
      setVariablesInput((data.template.variables || []).join(', '))
      setButtonsInput((data.template.buttons || []).map((button) => `${button.type}|${button.label}|${button.value || ''}`).join('\n'))
      setLint(data.lint)
      setMessage('Template salvo com checklist local atualizado.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#533afd] border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1240px] px-6 py-8 xl:px-10">
      <section className="surface-card p-6 md:p-8">
        <span className="inline-flex rounded-full border border-[#dce4ef] bg-[#f6f9fc] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[#533afd]">
          Canais
        </span>
        <h1 className="mt-4 text-[34px] font-light tracking-[-0.04em] text-[#0d253d] md:text-[46px]">
          Templates Meta
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#5e6d82]">
          Crie templates já pensando em aprovação: categoria, variáveis, preview textual e checklist local de compliance.
        </p>
      </section>

      {message ? <div className="mt-4 rounded-2xl border border-[#dcefe3] bg-[#f2fbf5] px-4 py-3 text-sm text-[#17884b]">{message}</div> : null}
      {error ? <div className="mt-4 rounded-2xl border border-[#fde5ee] bg-[#fff7fa] px-4 py-3 text-sm text-[#c7245d]">{error}</div> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="surface-card p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Nome interno</label>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Nome Meta</label>
              <input value={form.metaName} onChange={(event) => setForm({ ...form, metaName: event.target.value.toLowerCase().replace(/\s+/g, '_') })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Categoria</label>
              <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as TemplateForm['category'] })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]">
                <option value="utility">Utility</option>
                <option value="marketing">Marketing</option>
                <option value="authentication">Authentication</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Status</label>
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as TemplateForm['status'] })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]">
                <option value="draft">Draft</option>
                <option value="ready_for_review">Ready for review</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="paused">Paused</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Idioma</label>
              <input value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Header</label>
              <select value={form.headerType} onChange={(event) => setForm({ ...form, headerType: event.target.value as TemplateForm['headerType'] })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]">
                <option value="none">Sem header</option>
                <option value="text">Header de texto</option>
              </select>
            </div>
          </div>

          {form.headerType === 'text' ? (
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Texto do header</label>
              <input value={form.headerText} onChange={(event) => setForm({ ...form, headerText: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>
          ) : null}

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-[#425466]">Body</label>
            <textarea rows={8} value={form.bodyText} onChange={(event) => setForm({ ...form, bodyText: event.target.value })} className="w-full rounded-2xl border border-[#cad6e4] bg-white px-4 py-3 text-sm leading-6 text-[#0d253d] outline-none transition focus:border-[#533afd]" />
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-[#425466]">Footer</label>
            <input value={form.footerText} onChange={(event) => setForm({ ...form, footerText: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-[#425466]">Variáveis</label>
            <input value={variablesInput} onChange={(event) => setVariablesInput(event.target.value)} placeholder="ex: customer_name, reservation_day" className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-[#425466]">Botões</label>
            <textarea rows={4} value={buttonsInput} onChange={(event) => setButtonsInput(event.target.value)} placeholder={'quick_reply|Confirmar|\nurl|Ver cardápio|https://...'} className="w-full rounded-2xl border border-[#cad6e4] bg-white px-4 py-3 text-sm leading-6 text-[#0d253d] outline-none transition focus:border-[#533afd]" />
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-[#425466]">Notas de compliance</label>
            <textarea rows={4} value={form.complianceNotes} onChange={(event) => setForm({ ...form, complianceNotes: event.target.value })} className="w-full rounded-2xl border border-[#cad6e4] bg-white px-4 py-3 text-sm leading-6 text-[#0d253d] outline-none transition focus:border-[#533afd]" />
          </div>

          <button onClick={save} disabled={saving} className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#533afd] px-5 text-sm font-medium text-white transition hover:bg-[#4434d4] disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar template
          </button>
        </section>

        <aside className="space-y-6">
          <div className="surface-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#533afd]">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="heading-card">Checklist local</h2>
                <p className="text-sm text-[#64748d]">Pré-validação antes da Meta.</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[#e6edf5] bg-[#f8fbff] px-4 py-3">
              <p className="text-sm font-medium text-[#0d253d]">{lint?.summary || form.last_review_result || 'Salve o template para gerar checklist.'}</p>
              {lint?.warnings?.length ? (
                <div className="mt-3 space-y-2 text-xs leading-5 text-[#64748d]">
                  {lint.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="surface-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#533afd]">
                <Send className="h-5 w-5" />
              </div>
              <div>
                <h2 className="heading-card">Templates salvos</h2>
                <p className="text-sm text-[#64748d]">Reaproveite drafts e aprovados.</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {templates.length === 0 ? <p className="text-sm text-[#7a8ca2]">Nenhum template ainda.</p> : null}
              {templates.map((template) => (
                <button key={template.id || template.metaName} onClick={() => { setForm(template); setVariablesInput((template.variables || []).join(', ')); setButtonsInput((template.buttons || []).map((button) => `${button.type}|${button.label}|${button.value || ''}`).join('\n')); setLint(template.last_review_result ? { summary: template.last_review_result, warnings: [] } : null) }} className="w-full rounded-2xl border border-[#e6edf5] bg-[#f8fbff] px-4 py-3 text-left">
                  <p className="text-sm font-medium text-[#0d253d]">{template.name}</p>
                  <p className="mt-1 text-xs text-[#64748d]">{template.metaName} · {template.status}</p>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
