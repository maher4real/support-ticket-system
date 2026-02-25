import type { CreateTicketPayload, Ticket, TicketSentiment } from './api'
import { scoreTicketLocally } from './localAi'

const STORAGE_KEY = 'support_ticket_offline_queue_v1'

export interface QueuedTicket {
  queue_id: string
  created_at: string
  payload: CreateTicketPayload
  sentiment: TicketSentiment
  urgency_score: number
}

function supportsLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function safeParse(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

function isQueuedTicket(value: unknown): value is QueuedTicket {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  const payload = record.payload as Record<string, unknown> | undefined

  return (
    typeof record.queue_id === 'string' &&
    typeof record.created_at === 'string' &&
    typeof record.sentiment === 'string' &&
    typeof record.urgency_score === 'number' &&
    !!payload &&
    typeof payload.title === 'string' &&
    typeof payload.description === 'string' &&
    typeof payload.category === 'string' &&
    typeof payload.priority === 'string'
  )
}

function readQueue(): QueuedTicket[] {
  if (!supportsLocalStorage()) return []

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return []

  const parsed = safeParse(raw)
  if (!Array.isArray(parsed)) return []

  return parsed.filter(isQueuedTicket)
}

function writeQueue(queue: QueuedTicket[]): void {
  if (!supportsLocalStorage()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
}

function generateQueueId(): string {
  return `queue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function listQueuedTickets(): QueuedTicket[] {
  return readQueue()
}

export function enqueueTicket(payload: CreateTicketPayload): QueuedTicket {
  const queue = readQueue()
  const localSignals = scoreTicketLocally(payload.title, payload.description)
  const queuedTicket: QueuedTicket = {
    queue_id: generateQueueId(),
    created_at: new Date().toISOString(),
    payload,
    sentiment: localSignals.sentiment,
    urgency_score: localSignals.urgency_score,
  }

  queue.push(queuedTicket)
  writeQueue(queue)
  return queuedTicket
}

export function removeQueuedTicket(queueId: string): void {
  const queue = readQueue().filter((item) => item.queue_id !== queueId)
  writeQueue(queue)
}

function queueIdToLocalTicketId(queueId: string): number {
  let hash = 0
  for (let i = 0; i < queueId.length; i += 1) {
    hash = (hash * 31 + queueId.charCodeAt(i)) | 0
  }
  const positive = Math.abs(hash) || 1
  return -positive
}

export function queuedTicketToLocalTicket(item: QueuedTicket): Ticket {
  return {
    id: queueIdToLocalTicketId(item.queue_id),
    title: item.payload.title,
    description: item.payload.description,
    category: item.payload.category,
    priority: item.payload.priority,
    status: 'open',
    sentiment: item.sentiment,
    urgency_score: item.urgency_score,
    created_at: item.created_at,
    is_local_only: true,
    local_queue_id: item.queue_id,
  }
}
