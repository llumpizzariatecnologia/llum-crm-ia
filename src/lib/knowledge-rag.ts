import 'server-only'

import PDFParser from 'pdf2json'
import { DEFAULT_WORKSPACE_ID } from '@/lib/constants'
import { decrypt } from '@/lib/encryption'
import { getServerSupabaseClient } from '@/lib/server/supabase'
import { listKnowledgeDocuments, saveKnowledgeDocument } from '@/lib/workspace-admin'
import type { KnowledgeDocument } from '@/types/database'

export const KNOWLEDGE_EMBEDDING_MODEL = 'text-embedding-3-small'
export const KNOWLEDGE_CHUNK_MAX_WORDS = 280
export const KNOWLEDGE_CHUNK_OVERLAP_WORDS = 60
export const KNOWLEDGE_RETRIEVAL_LIMIT = 5
// Cosine-similarity floor for semantic matches. `match_knowledge_chunks` returns
// `1 - (embedding <=> query)`, so values < 0.55 mean "weak match" with text-embedding-3-small.
export const KNOWLEDGE_SEMANTIC_MIN_SCORE = 0.55
// Minimum token-overlap for the lexical fallback to be trustworthy.
export const KNOWLEDGE_LEXICAL_MIN_HITS = 2

export type KnowledgeMatch = {
  /** chunk-level ID when sourced from semantic search; document-level ID for lexical */
  id: string
  documentId: string
  chunkId: string | null
  title: string
  category: string
  summary: string | null
  excerpt: string
  score: number
}

type KnowledgeChunkDraft = {
  chunkIndex: number
  sectionTitle: string
  content: string
  summary: string
  tokenEstimate: number
}

type SemanticChunkRow = {
  id: string
  document_id: string
  title: string
  category: string
  summary: string | null
  section_title: string | null
  content: string
  score: number
  tags: string[] | string | null
}

type MatchKnowledgeChunksRpc = {
  rpc: (
    fn: 'match_knowledge_chunks',
    args: {
      query_embedding: string
      query_workspace_id: string
      match_count: number
    }
  ) => Promise<{
    data: SemanticChunkRow[] | null
    error: { message?: string } | null
  }>
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

function clipText(value: string, maxLength = 280) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3).trim()}...`
}

function normalizeKnowledgeText(value: string) {
  return value
    .replace(/\r/g, '')
    .replace(/\u0000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ ]{2,}/g, ' ')
    .trim()
}

function normalizeSectionTitle(value: string) {
  return value
    .replace(/[•●]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function estimateTokenCount(text: string) {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3)
}

function summarizeChunk(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const sentence = normalized.split(/(?<=[.!?])\s+/)[0]?.trim() || normalized
  return clipText(sentence, 220)
}

function isLikelyHeading(line: string) {
  const normalized = normalizeSectionTitle(line)
  if (!normalized) return false
  if (normalized.length > 90) return false

  const withoutPunctuation = normalized.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, '')
  const letters = withoutPunctuation.replace(/[^A-Za-zÀ-ÿ]/g, '')
  const upperLetters = letters.replace(/[^A-ZÀ-Ý]/g, '')
  const upperRatio = letters.length > 0 ? upperLetters.length / letters.length : 0

  return (
    upperRatio >= 0.65 ||
    normalized.endsWith(':') ||
    /^[0-9]+\./.test(normalized) ||
    /^(identidade|tom de voz|estrutura|valores|anivers[aá]rios|restri[cç][aã]o|reserva|funcionamento|regras|gatilhos)/i.test(
      normalized
    )
  )
}

function splitIntoSections(text: string) {
  const lines = normalizeKnowledgeText(text)
    .split('\n')
    .map((line) => normalizeSectionTitle(line))
    .filter(Boolean)

  const sections: Array<{ title: string; lines: string[] }> = []
  let currentTitle = 'Base geral'
  let currentLines: string[] = []

  for (const line of lines) {
    if (isLikelyHeading(line) && currentLines.length > 0) {
      sections.push({ title: currentTitle, lines: currentLines })
      currentTitle = line
      currentLines = []
      continue
    }

    if (isLikelyHeading(line) && currentLines.length === 0) {
      currentTitle = line
      continue
    }

    currentLines.push(line)
  }

  if (currentLines.length > 0) {
    sections.push({ title: currentTitle, lines: currentLines })
  }

  if (sections.length === 0) {
    sections.push({ title: 'Base geral', lines: [normalizeKnowledgeText(text)] })
  }

  return sections
}

function buildKnowledgeChunks(text: string) {
  const sections = splitIntoSections(text)
  const chunks: KnowledgeChunkDraft[] = []
  let chunkIndex = 0

  for (const section of sections) {
    // Group lines into paragraphs (split on blank lines), then pack paragraphs
    // into chunks respecting KNOWLEDGE_CHUNK_MAX_WORDS. This avoids cutting
    // mid-sentence at an arbitrary word boundary.
    const paragraphs = section.lines
      .join('\n')
      .split(/\n{2,}/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length >= 20)

    if (!paragraphs.length) continue

    let currentWords: string[] = []

    const flushChunk = () => {
      if (!currentWords.length) return
      const content = currentWords.join(' ').trim()
      if (content.length >= 40) {
        chunks.push({
          chunkIndex,
          sectionTitle: section.title,
          content,
          summary: summarizeChunk(content),
          tokenEstimate: estimateTokenCount(content),
        })
        chunkIndex += 1
      }
    }

    for (const para of paragraphs) {
      const paraWords = para.split(/\s+/).filter(Boolean)

      // If adding this paragraph would exceed the max, flush first with overlap.
      if (currentWords.length + paraWords.length > KNOWLEDGE_CHUNK_MAX_WORDS && currentWords.length > 0) {
        flushChunk()
        // Carry overlap from the tail of the flushed chunk.
        currentWords = currentWords.slice(-KNOWLEDGE_CHUNK_OVERLAP_WORDS)
      }

      currentWords.push(...paraWords)
    }

    flushChunk()
  }

  return chunks
}

async function resolveOpenAIEmbeddingApiKey(workspaceId?: string) {
  const supabase = getServerSupabaseClient()
  const workspace = getIntegrationWorkspaceId(workspaceId)
  let query = supabase
    .from('integrations')
    .select('encrypted_credentials')
    .eq('provider', 'openai')

  query = workspace ? query.eq('workspace_id', workspace) : query.is('workspace_id', null)

  const { data } = (await query.maybeSingle()) as {
    data: { encrypted_credentials: string | null } | null
  }

  if (data?.encrypted_credentials) {
    try {
      const raw = await decrypt(data.encrypted_credentials)
      const parsed = JSON.parse(raw) as { credentials?: Record<string, string> }
      const integrationKey = parsed.credentials?.api_key?.trim()
      if (integrationKey) return integrationKey
    } catch {}
  }

  return process.env.OPENAI_API_KEY?.trim() || null
}

async function createEmbeddings(texts: string[], workspaceId?: string) {
  const apiKey = await resolveOpenAIEmbeddingApiKey(workspaceId)
  if (!apiKey) {
    return {
      vectors: Array.from({ length: texts.length }, () => null),
      model: null,
      warnings: ['OpenAI nao configurado para gerar embeddings.'],
    }
  }

  const vectors: Array<number[] | null> = []
  for (let index = 0; index < texts.length; index += 64) {
    const batch = texts.slice(index, index + 64)
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: KNOWLEDGE_EMBEDDING_MODEL,
        input: batch,
      }),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body?.error?.message || `Falha ao gerar embeddings (${response.status})`)
    }

    const body = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>
    }
    const batchVectors = (body.data || []).map((item) => item.embedding || null)
    vectors.push(...batchVectors)
  }

  return {
    vectors,
    model: KNOWLEDGE_EMBEDDING_MODEL,
    warnings: [] as string[],
  }
}

function vectorToSql(value: number[] | null) {
  if (!value) return null
  return `[${value.join(',')}]`
}

export async function indexKnowledgeDocument(input: {
  document: KnowledgeDocument
  workspaceId?: string
}) {
  const supabase = getServerSupabaseClient()
  const workspace = getWorkspaceId(input.workspaceId)
  const text = normalizeKnowledgeText(input.document.content)
  const chunks = buildKnowledgeChunks(text)

  const embeddingResult = await createEmbeddings(
    chunks.map((chunk) => chunk.content),
    input.workspaceId
  )

  await supabase.from('knowledge_chunks').delete().eq('document_id', input.document.id)

  if (chunks.length > 0) {
    const rows = chunks.map((chunk, index) => ({
      workspace_id: workspace,
      document_id: input.document.id,
      chunk_index: chunk.chunkIndex,
      section_title: chunk.sectionTitle,
      page_start: null,
      page_end: null,
      token_estimate: chunk.tokenEstimate,
      content: chunk.content,
      summary: chunk.summary,
      tags: input.document.tags,
      embedding: vectorToSql(embeddingResult.vectors[index]),
      status: input.document.status,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase.from('knowledge_chunks').insert(rows as never)
    if (error) throw new Error(error.message)
  }

  return {
    chunkCount: chunks.length,
    embeddedCount: embeddingResult.vectors.filter(Boolean).length,
    embeddingModel: embeddingResult.model,
    warnings: embeddingResult.warnings,
  }
}

async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParser(null, true)

  const text = await new Promise<string>((resolve, reject) => {
    parser.on('pdfParser_dataError', (error) => {
      const parserError =
        error instanceof Error
          ? error
          : error?.parserError || new Error('Falha ao extrair texto do PDF.')
      reject(parserError)
    })
    parser.on('pdfParser_dataReady', () => {
      try {
        resolve(parser.getRawTextContent() || '')
      } catch (error) {
        reject(error)
      }
    })
    parser.parseBuffer(buffer)
  })

  return normalizeKnowledgeText(text)
}

function buildImportedDocumentTitle(fileName: string) {
  return fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim()
}

export async function importKnowledgePdf(input: {
  buffer: Buffer
  fileName: string
  title?: string
  category?: string
  sourceType?: KnowledgeDocument['source_type']
  summary?: string
  tags?: string[]
  status?: KnowledgeDocument['status']
  workspaceId?: string
}) {
  const extractedText = await extractPdfText(input.buffer)
  if (extractedText.length < 40) {
    throw new Error('Nao foi possivel extrair texto util do PDF.')
  }

  const title = input.title?.trim() || buildImportedDocumentTitle(input.fileName)
  const summary = input.summary?.trim() || summarizeChunk(extractedText)

  const document = await saveKnowledgeDocument(
    {
      title,
      category: input.category?.trim() || 'operacoes',
      sourceType: input.sourceType || 'operations',
      content: extractedText,
      summary,
      tags: (input.tags || []).filter(Boolean),
      status: input.status || 'published',
    },
    input.workspaceId
  )

  const indexed = await indexKnowledgeDocument({
    document,
    workspaceId: input.workspaceId,
  })

  return {
    document,
    extractedChars: extractedText.length,
    ...indexed,
  }
}

function extractMarkdownText(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, '')          // fenced code blocks
    .replace(/`[^`]+`/g, '')                  // inline code
    .replace(/!\[.*?\]\(.*?\)/g, '')          // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → keep label
    .replace(/^#{1,6}\s+/gm, '')             // headings — keep text
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1') // bold/italic
    .replace(/^\s*[-*+]\s+/gm, '')           // list bullets
    .replace(/^\s*\d+\.\s+/gm, '')           // numbered lists
    .replace(/^\s*>\s+/gm, '')               // blockquotes
    .replace(/\|/g, ' ')                     // table cells
    .replace(/[-]{3,}/g, '')                 // horizontal rules
    .trim()
}

export async function importKnowledgeMarkdown(input: {
  buffer: Buffer
  fileName: string
  title?: string
  category?: string
  sourceType?: KnowledgeDocument['source_type']
  summary?: string
  tags?: string[]
  status?: KnowledgeDocument['status']
  workspaceId?: string
}) {
  const raw = input.buffer.toString('utf-8')
  const extractedText = normalizeKnowledgeText(extractMarkdownText(raw))
  if (extractedText.length < 40) {
    throw new Error('Nao foi possivel extrair texto util do arquivo Markdown.')
  }

  const title =
    input.title?.trim() ||
    raw.match(/^#\s+(.+)/m)?.[1]?.trim() ||
    buildImportedDocumentTitle(input.fileName.replace(/\.md$/i, ''))
  const summary = input.summary?.trim() || summarizeChunk(extractedText)

  const document = await saveKnowledgeDocument(
    {
      title,
      category: input.category?.trim() || 'operacoes',
      sourceType: input.sourceType || 'operations',
      content: extractedText,
      summary,
      tags: (input.tags || []).filter(Boolean),
      status: input.status || 'published',
    },
    input.workspaceId
  )

  const indexed = await indexKnowledgeDocument({ document, workspaceId: input.workspaceId })
  return { document, extractedChars: extractedText.length, ...indexed }
}

function csvToText(raw: string): string {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return ''
  const separator = lines[0].includes('\t') ? '\t' : ','
  const headers = lines[0].split(separator).map((h) => h.replace(/^["']|["']$/g, '').trim())
  const rows = lines.slice(1)
  return rows
    .map((row) => {
      const values = row.split(separator).map((v) => v.replace(/^["']|["']$/g, '').trim())
      return headers.map((h, i) => `${h}: ${values[i] ?? ''}`).join(' | ')
    })
    .filter((row) => row.length > 10)
    .join('\n')
}

export async function importKnowledgeCsv(input: {
  buffer: Buffer
  fileName: string
  title?: string
  category?: string
  sourceType?: KnowledgeDocument['source_type']
  summary?: string
  tags?: string[]
  status?: KnowledgeDocument['status']
  workspaceId?: string
}) {
  const raw = input.buffer.toString('utf-8')
  const extractedText = normalizeKnowledgeText(csvToText(raw))
  if (extractedText.length < 40) {
    throw new Error('Nao foi possivel extrair texto util do arquivo CSV.')
  }

  const title = input.title?.trim() || buildImportedDocumentTitle(input.fileName.replace(/\.csv$/i, ''))
  const summary = input.summary?.trim() || summarizeChunk(extractedText)

  const document = await saveKnowledgeDocument(
    {
      title,
      category: input.category?.trim() || 'operacoes',
      sourceType: input.sourceType || 'operations',
      content: extractedText,
      summary,
      tags: (input.tags || []).filter(Boolean),
      status: input.status || 'published',
    },
    input.workspaceId
  )

  const indexed = await indexKnowledgeDocument({ document, workspaceId: input.workspaceId })
  return { document, extractedChars: extractedText.length, ...indexed }
}

async function getLexicalDocumentMatches(
  message: string,
  workspaceId?: string
): Promise<KnowledgeMatch[]> {
  const documents = await listKnowledgeDocuments(workspaceId)
  const published = documents.filter((item) => item.status === 'published')
  if (!published.length) return []

  const queryTokens = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)

  return published
    .map((document) => {
      const haystack = `${document.title} ${document.category} ${document.summary || ''} ${document.content} ${(document.tags || []).join(' ')}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()

      const score = queryTokens.reduce(
        (acc, token) => acc + (haystack.includes(token) ? 1 : 0),
        0
      )

      return {
        id: document.id,
        documentId: document.id,
        chunkId: null,
        title: document.title,
        category: document.category,
        summary: document.summary,
        excerpt: clipText((document.summary || document.content).replace(/\s+/g, ' '), 240),
        score,
      }
    })
    .filter((item) => item.score >= KNOWLEDGE_LEXICAL_MIN_HITS)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

export async function searchKnowledgeMatches(
  message: string,
  workspaceId?: string
): Promise<KnowledgeMatch[]> {
  const workspace = getWorkspaceId(workspaceId)
  const lexicalMatches = await getLexicalDocumentMatches(message, workspaceId)
  const embeddingResult = await createEmbeddings([message], workspaceId)
  const queryEmbedding = embeddingResult.vectors[0]

  if (!queryEmbedding) {
    return lexicalMatches
  }

  const queryVector = vectorToSql(queryEmbedding)
  if (!queryVector) {
    return lexicalMatches
  }

  const supabase = getServerSupabaseClient()
  const rpcClient = supabase as unknown as MatchKnowledgeChunksRpc
  const { data, error } = await rpcClient.rpc('match_knowledge_chunks', {
    query_embedding: queryVector,
    query_workspace_id: workspace,
    match_count: KNOWLEDGE_RETRIEVAL_LIMIT,
  })

  if (error || !data || data.length === 0) {
    return lexicalMatches
  }

  const semanticMatches = (data as SemanticChunkRow[])
    .filter((item) => item.score >= KNOWLEDGE_SEMANTIC_MIN_SCORE)
    .map((item): KnowledgeMatch => ({
      id: item.id,
      documentId: item.document_id,
      chunkId: item.id,
      title: item.section_title ? `${item.title} - ${item.section_title}` : item.title,
      category: item.category,
      summary: item.summary,
      excerpt: clipText(item.content.replace(/\s+/g, ' '), 280),
      score: item.score,
    }))

  // RRF blends lexical and semantic rankings without comparing incompatible scales.
  const RRF_K = 60
  const fused = new Map<string, KnowledgeMatch & { rrfScore: number }>()

  const indexRanking = (matches: KnowledgeMatch[]) => {
    matches.forEach((match, index) => {
      const contribution = 1 / (RRF_K + index + 1)
      const existing = fused.get(match.id)
      if (existing) {
        existing.rrfScore += contribution
        return
      }
      fused.set(match.id, { ...match, rrfScore: contribution })
    })
  }

  indexRanking(semanticMatches)
  indexRanking(lexicalMatches)

  // Query-aware reranker: boost chunks that contain query tokens densely in the excerpt.
  // Tokens near the start of the excerpt get higher weight (positional decay).
  const queryTokens = message
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)

  const rerankBoost = (entry: KnowledgeMatch): number => {
    if (!queryTokens.length) return 0
    const text = entry.excerpt
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
    const words = text.split(/\s+/)
    let boost = 0
    for (const token of queryTokens) {
      const pos = words.findIndex((w) => w.startsWith(token))
      if (pos >= 0) {
        boost += 1 / (1 + pos * 0.05)
      }
    }
    return boost / queryTokens.length
  }

  return Array.from(fused.values())
    .map((entry) => ({ entry, finalScore: entry.rrfScore + rerankBoost(entry) * 0.3 }))
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, KNOWLEDGE_RETRIEVAL_LIMIT)
    .map(
      ({ entry }): KnowledgeMatch => ({
        id: entry.id,
        documentId: entry.documentId,
        chunkId: entry.chunkId,
        title: entry.title,
        category: entry.category,
        summary: entry.summary,
        excerpt: entry.excerpt,
        score: entry.score,
      })
    )
}
