'use client'

import { useEffect, useState } from 'react'
import { BookOpen, FileUp, Loader2, Save, Sparkles } from 'lucide-react'
import { fetchJson } from '@/lib/client'

type KnowledgeDocument = {
  id?: string
  title: string
  category: string
  sourceType: 'faq' | 'policy' | 'menu' | 'pricing' | 'operations' | 'custom'
  content: string
  summary: string
  tags: string[]
  status: 'draft' | 'published' | 'archived'
  version?: number
  updated_at?: string
}

type ImportIndexingResult = {
  chunkCount: number
  embeddedCount: number
  embeddingModel: string | null
  extractedChars: number
  warnings: string[]
}

const emptyDocument: KnowledgeDocument = {
  title: '',
  category: 'geral',
  sourceType: 'faq',
  content: '',
  summary: '',
  tags: [],
  status: 'draft',
}

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [form, setForm] = useState<KnowledgeDocument>(emptyDocument)
  const [tagInput, setTagInput] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importTitle, setImportTitle] = useState('')
  const [importCategory, setImportCategory] = useState('operacoes')
  const [importTags, setImportTags] = useState('rag, pdf, llum')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportIndexingResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const run = async () => {
      try {
        const data = await fetchJson<{ documents: KnowledgeDocument[] }>('/api/knowledge')
        if (!active) return
        setDocuments(data.documents)
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

  async function save() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const data = await fetchJson<{
        documents: KnowledgeDocument[]
        document: KnowledgeDocument
        indexing?: ImportIndexingResult
      }>('/api/knowledge', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setDocuments(data.documents)
      setForm(data.document)
      setTagInput((data.document.tags || []).join(', '))
      setImportResult(data.indexing || null)
      setMessage(
        data.indexing
          ? `Documento salvo e indexado em ${data.indexing.chunkCount} chunks.`
          : 'Documento salvo na base de conhecimento.'
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function importPdf() {
    if (!importFile) {
      setError('Selecione um PDF para importar.')
      return
    }

    setImporting(true)
    setError(null)
    setMessage(null)
    setImportResult(null)

    try {
      const body = new FormData()
      body.append('file', importFile)
      body.append('title', importTitle)
      body.append('category', importCategory)
      body.append('sourceType', 'operations')
      body.append('tags', importTags)
      body.append('status', 'published')

      const response = await fetch('/api/knowledge/import', {
        method: 'POST',
        body,
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Falha ao importar PDF')
      }

      const data = (await response.json()) as {
        document: KnowledgeDocument
        documents: KnowledgeDocument[]
        indexing: ImportIndexingResult
      }

      setDocuments(data.documents)
      setForm(data.document)
      setTagInput((data.document.tags || []).join(', '))
      setImportResult(data.indexing)
      setImportFile(null)
      setImportTitle('')
      setMessage(
        `PDF importado com sucesso: ${data.indexing.chunkCount} chunks e ${data.indexing.embeddedCount} embeddings gerados.`
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setImporting(false)
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
          IA
        </span>
        <h1 className="mt-4 text-[34px] font-light tracking-[-0.04em] text-[#0d253d] md:text-[46px]">
          Base de Conhecimento
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#5e6d82]">
          Cadastre fatos operacionais confiaveis para a IA consultar e importe PDFs ja no fluxo de chunking + embeddings.
        </p>
      </section>

      {message ? <div className="mt-4 rounded-2xl border border-[#dcefe3] bg-[#f2fbf5] px-4 py-3 text-sm text-[#17884b]">{message}</div> : null}
      {error ? <div className="mt-4 rounded-2xl border border-[#fde5ee] bg-[#fff7fa] px-4 py-3 text-sm text-[#c7245d]">{error}</div> : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="space-y-6">
          <div className="surface-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#533afd]">
                <FileUp className="h-5 w-5" />
              </div>
              <div>
                <h2 className="heading-card">Importar PDF com RAG</h2>
                <p className="text-sm text-[#64748d]">Fluxo default pronto para extrair, chunkar e embedar.</p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-[#425466]">PDF da base</label>
                <input type="file" accept="application/pdf" onChange={(event) => setImportFile(event.target.files?.[0] || null)} className="block w-full rounded-2xl border border-[#cad6e4] bg-white px-4 py-3 text-sm text-[#0d253d]" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#425466]">Titulo opcional</label>
                <input value={importTitle} onChange={(event) => setImportTitle(event.target.value)} placeholder="Se vazio, usa o nome do arquivo" className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#425466]">Categoria</label>
                <input value={importCategory} onChange={(event) => setImportCategory(event.target.value)} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-[#425466]">Tags</label>
                <input value={importTags} onChange={(event) => setImportTags(event.target.value)} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-[#e6edf5] bg-[#f8fbff] px-4 py-3 text-sm leading-6 text-[#425466]">
              <p className="font-medium text-[#0d253d]">Defaults ativos</p>
              <p>- Embedding: text-embedding-3-small</p>
              <p>- Chunking: 280 palavras com overlap de 60</p>
              <p>- Retrieval: top 5 chunks</p>
              <p>- Status padrao do PDF: publicado</p>
            </div>

            <button onClick={importPdf} disabled={importing} className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0d253d] px-5 text-sm font-medium text-white transition hover:bg-[#1b3550] disabled:opacity-60">
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Importar PDF, chunkar e gerar embeddings
            </button>
          </div>

          <div className="surface-card p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#425466]">Titulo</label>
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#425466]">Categoria</label>
                <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#425466]">Tipo de fonte</label>
                <select value={form.sourceType} onChange={(event) => setForm({ ...form, sourceType: event.target.value as KnowledgeDocument['sourceType'] })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]">
                  <option value="faq">FAQ</option>
                  <option value="policy">Policy</option>
                  <option value="menu">Menu</option>
                  <option value="pricing">Pricing</option>
                  <option value="operations">Operations</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#425466]">Status</label>
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as KnowledgeDocument['status'] })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]">
                  <option value="draft">Draft</option>
                  <option value="published">Publicado</option>
                  <option value="archived">Arquivado</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Resumo</label>
              <input value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Tags</label>
              <input value={tagInput} onChange={(event) => { const value = event.target.value; setTagInput(value); setForm({ ...form, tags: value.split(',').map((item) => item.trim()).filter(Boolean) }) }} placeholder="ex: reserva, preco, infantil" className="h-11 w-full rounded-2xl border border-[#cad6e4] bg-white px-4 text-sm text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium text-[#425466]">Conteudo factual</label>
              <textarea rows={16} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} className="w-full rounded-2xl border border-[#cad6e4] bg-white px-4 py-3 text-sm leading-6 text-[#0d253d] outline-none transition focus:border-[#533afd]" />
            </div>

            <button onClick={save} disabled={saving} className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#533afd] px-5 text-sm font-medium text-white transition hover:bg-[#4434d4] disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar documento
            </button>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="surface-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#eef2ff] text-[#533afd]">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <h2 className="heading-card">Documentos publicados</h2>
                <p className="text-sm text-[#64748d]">Clique em um item para editar.</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {importResult ? (
                <div className="rounded-2xl border border-[#dce4ef] bg-[#f8fbff] px-4 py-3 text-sm text-[#425466]">
                  <p className="font-medium text-[#0d253d]">Ultima indexacao</p>
                  <p className="mt-1">Chunks: {importResult.chunkCount}</p>
                  <p>Embeddings: {importResult.embeddedCount}</p>
                  <p>Modelo: {importResult.embeddingModel || 'nao gerado'}</p>
                  <p>Texto extraido: {importResult.extractedChars} caracteres</p>
                  {importResult.warnings.length > 0 ? <p className="mt-1 text-[#c7245d]">{importResult.warnings[0]}</p> : null}
                </div>
              ) : null}

              {documents.length === 0 ? <p className="text-sm text-[#7a8ca2]">A base ainda esta vazia.</p> : null}
              {documents.map((document) => (
                <button key={document.id || document.title} onClick={() => { setForm(document); setTagInput((document.tags || []).join(', ')) }} className="w-full rounded-2xl border border-[#e6edf5] bg-[#f8fbff] px-4 py-3 text-left">
                  <p className="text-sm font-medium text-[#0d253d]">{document.title}</p>
                  <p className="mt-1 text-xs text-[#64748d]">{document.category} - {document.status}{document.version ? ` - v${document.version}` : ''}</p>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
