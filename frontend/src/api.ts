export type TicketCategory = 'billing' | 'technical' | 'account' | 'general'
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketSentiment = 'calm' | 'neutral' | 'frustrated' | 'angry'

export interface Ticket {
  id: number
  title: string
  description: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  sentiment: TicketSentiment
  urgency_score: number
  created_at: string
  is_local_only?: boolean
  local_queue_id?: string
}

export interface CreateTicketPayload {
  title: string
  description: string
  category: TicketCategory
  priority: TicketPriority
}

export interface TicketQueryParams {
  category?: TicketCategory | ''
  priority?: TicketPriority | ''
  status?: TicketStatus | ''
  search?: string
}

export interface TicketStats {
  total_tickets: number
  open_tickets: number
  avg_tickets_per_day: number
  priority_breakdown: Record<TicketPriority, number>
  category_breakdown: Record<TicketCategory, number>
  sentiment_breakdown?: Record<TicketSentiment, number>
  avg_urgency_score?: number
}

export interface TicketClassification {
  suggested_category: TicketCategory
  suggested_priority: TicketPriority
}

export interface TicketTitleSuggestion {
  suggested_title: string
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(
  /\/$/,
  '',
)
const defaultTimeoutMs = (() => {
  const raw = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? 15000)
  if (!Number.isFinite(raw) || raw < 1000) {
    return 15000
  }
  return Math.floor(raw)
})()
const defaultReadRetryAttempts = (() => {
  const raw = Number(import.meta.env.VITE_API_READ_RETRY_ATTEMPTS ?? 3)
  if (!Number.isFinite(raw) || raw < 1 || raw > 5) {
    return 3
  }
  return Math.floor(raw)
})()
const retriableHttpStatuses = new Set([408, 425, 429, 500, 502, 503, 504])

export class ApiRequestError extends Error {
  status: number | null
  transient: boolean
  timeout: boolean

  constructor(
    message: string,
    options: { status?: number | null; transient?: boolean; timeout?: boolean } = {},
  ) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = options.status ?? null
    this.transient = options.transient ?? false
    this.timeout = options.timeout ?? false
  }
}

export function isTransientApiError(error: unknown): boolean {
  if (error instanceof ApiRequestError) {
    return error.transient || error.timeout
  }
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  return (
    message.includes('timed out') ||
    message.includes('failed to fetch') ||
    message.includes('network error') ||
    message.includes('network request failed')
  )
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms)
  })
}

function retryDelayMs(attempt: number): number {
  return Math.min(750 * attempt, 3000)
}

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = defaultTimeoutMs,
): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const maxAttempts = method === 'GET' ? defaultReadRetryAttempts : 1
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)

    let response: Response
    try {
      response = await fetch(`${baseUrl}/api/${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
        ...init,
        signal: controller.signal,
      })
    } catch (error) {
      const normalizedError =
        error instanceof DOMException && error.name === 'AbortError'
          ? new ApiRequestError('Request timed out. Please try again.', {
              transient: true,
              timeout: true,
            })
          : error instanceof ApiRequestError
            ? error
            : new ApiRequestError(
                error instanceof Error ? error.message : 'Request failed.',
                { transient: true },
              )

      lastError = normalizedError
      if (attempt < maxAttempts) {
        await wait(retryDelayMs(attempt))
        continue
      }
      throw normalizedError
    } finally {
      globalThis.clearTimeout(timeoutId)
    }

    if (!response.ok) {
      if (attempt < maxAttempts && retriableHttpStatuses.has(response.status)) {
        await wait(retryDelayMs(attempt))
        continue
      }

      const contentType = response.headers.get('content-type') ?? ''
      const payload = contentType.includes('application/json')
        ? await response.json()
        : await response.text()
      throw new ApiRequestError(extractErrorMessage(payload) ?? 'Request failed.', {
        status: response.status,
        transient: retriableHttpStatuses.has(response.status),
      })
    }

    const contentType = response.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text()

    return payload as T
  }

  throw lastError ?? new Error('Request failed.')
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload) return null

  if (typeof payload === 'string') return payload

  if (typeof payload === 'object') {
    const entries = Object.entries(payload as Record<string, unknown>)
    const first = entries[0]
    if (!first) return null

    const [field, value] = first
    if (Array.isArray(value) && value.length > 0) {
      return `${field}: ${String(value[0])}`
    }
    if (typeof value === 'string') {
      return `${field}: ${value}`
    }
  }

  return null
}

export async function classifyTicket(description: string): Promise<TicketClassification> {
  return request<TicketClassification>('tickets/classify/', {
    method: 'POST',
    body: JSON.stringify({ description }),
  })
}

export async function suggestTitle(
  description: string,
  timeoutMs = 4500,
): Promise<TicketTitleSuggestion> {
  return request<TicketTitleSuggestion>(
    'tickets/suggest-title/',
    {
      method: 'POST',
      body: JSON.stringify({ description }),
    },
    timeoutMs,
  )
}

export async function createTicket(payload: CreateTicketPayload): Promise<Ticket> {
  return request<Ticket>('tickets/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchTickets(params: TicketQueryParams): Promise<Ticket[]> {
  const query = new URLSearchParams()

  if (params.category) query.set('category', params.category)
  if (params.priority) query.set('priority', params.priority)
  if (params.status) query.set('status', params.status)
  if (params.search?.trim()) query.set('search', params.search.trim())

  const path = query.toString() ? `tickets/?${query.toString()}` : 'tickets/'
  return request<Ticket[]>(path)
}

export async function updateTicket(
  id: number,
  patch: Partial<
    Pick<Ticket, 'title' | 'description' | 'category' | 'priority' | 'status'>
  >,
): Promise<Ticket> {
  return request<Ticket>(`tickets/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function fetchStats(): Promise<TicketStats> {
  return request<TicketStats>('tickets/stats/')
}
