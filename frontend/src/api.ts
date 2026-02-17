export type TicketCategory = 'billing' | 'technical' | 'account' | 'general'
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface Ticket {
  id: number
  title: string
  description: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  created_at: string
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
}

export interface TicketClassification {
  suggested_category: TicketCategory
  suggested_priority: TicketPriority
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(
  /\/$/,
  '',
)

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}/api/${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload) ?? 'Request failed.')
  }

  return payload as T
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
