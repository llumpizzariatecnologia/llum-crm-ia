export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  if (!response.ok) {
    let message = 'Erro inesperado'
    try {
      const body = await response.json()
      message = body.error || body.message || message
    } catch {}
    throw new Error(message)
  }

  return response.json() as Promise<T>
}
