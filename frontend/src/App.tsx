import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  createTicket,
  fetchStats,
  fetchTickets,
  isTransientApiError,
  type Ticket,
  type CreateTicketPayload,
  type TicketStatus,
  type TicketStats,
  updateTicket,
} from './api'
import {
  enqueueTicket,
  listQueuedTickets,
  queuedTicketToLocalTicket,
  removeQueuedTicket,
} from './offlineQueue'
import { TicketForm } from './components/TicketForm'
import { TicketList } from './components/TicketList'
import { StatsCard } from './components/StatsCard'
import type { TicketFilters } from './components/FiltersBar'
import './App.css'

const MAX_RECOVERY_DELAY_MS = 15000

function nextRecoveryDelayMs(attempt: number): number {
  return Math.min(2500 + attempt * 1500, MAX_RECOVERY_DELAY_MS)
}

function buildRecoveryMessage(scope: 'tickets' | 'stats', attempt: number): string {
  const target = scope === 'tickets' ? 'saved tickets' : 'dashboard stats'

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return `You are offline. Waiting to reconnect and load ${target}.`
  }

  if (attempt <= 1) return `Connecting to backend and loading ${target}...`
  if (attempt <= 3) {
    return `Backend is waking up on Render free tier. Retrying ${target} automatically...`
  }
  return `Still waiting for backend startup. Retrying ${target} in the background...`
}

function buildQueueNotice(queueLength: number, isOffline: boolean): string {
  if (queueLength <= 0) return ''
  if (isOffline) {
    return `${queueLength} ticket(s) saved locally. Sync resumes when internet is back.`
  }
  return `${queueLength} ticket(s) saved locally while backend wakes. Sync runs automatically.`
}

function matchesActiveFilters(ticket: Ticket, filters: TicketFilters): boolean {
  if (filters.category && ticket.category !== filters.category) return false
  if (filters.priority && ticket.priority !== filters.priority) return false
  if (filters.status && ticket.status !== filters.status) return false

  const search = filters.search.trim().toLowerCase()
  if (!search) return true

  return (
    ticket.title.toLowerCase().includes(search) ||
    ticket.description.toLowerCase().includes(search)
  )
}

function App() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [stats, setStats] = useState<TicketStats | null>(null)
  const [filters, setFilters] = useState<TicketFilters>({
    category: '',
    priority: '',
    status: '',
    search: '',
  })

  const [isTicketsLoading, setIsTicketsLoading] = useState(true)
  const [ticketsNotice, setTicketsNotice] = useState<string | null>(null)

  const [isStatsLoading, setIsStatsLoading] = useState(true)
  const [statsNotice, setStatsNotice] = useState<string | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const [pendingQueue, setPendingQueue] = useState(() => listQueuedTickets())
  const [isSyncingQueue, setIsSyncingQueue] = useState(false)
  const [updatingTicketIds, setUpdatingTicketIds] = useState<Set<number>>(new Set())
  const [now, setNow] = useState(() => new Date())

  const ticketsRequestIdRef = useRef(0)
  const statsRequestIdRef = useRef(0)
  const ticketsRetryTimerRef = useRef<number | null>(null)
  const statsRetryTimerRef = useRef<number | null>(null)
  const ticketsRetryAttemptRef = useRef(0)
  const statsRetryAttemptRef = useRef(0)
  const hasLoadedTicketsRef = useRef(false)
  const hasLoadedStatsRef = useRef(false)
  const loadTicketsRef = useRef<() => Promise<void>>(async () => undefined)
  const loadStatsRef = useRef<() => Promise<void>>(async () => undefined)
  const syncQueueRef = useRef<() => Promise<void>>(async () => undefined)
  const isSyncQueueInFlightRef = useRef(false)

  const loadTickets = useCallback(async () => {
    const requestId = ticketsRequestIdRef.current + 1
    ticketsRequestIdRef.current = requestId

    if (ticketsRetryTimerRef.current !== null) {
      window.clearTimeout(ticketsRetryTimerRef.current)
      ticketsRetryTimerRef.current = null
    }

    setIsTicketsLoading(!hasLoadedTicketsRef.current)

    try {
      const nextTickets = await fetchTickets(filters)
      if (ticketsRequestIdRef.current !== requestId) return

      hasLoadedTicketsRef.current = true
      ticketsRetryAttemptRef.current = 0
      setTickets(nextTickets)
      setTicketsNotice(null)
      setIsTicketsLoading(false)
    } catch (error) {
      if (ticketsRequestIdRef.current !== requestId) return

      ticketsRetryAttemptRef.current += 1
      const attempt = ticketsRetryAttemptRef.current
      const delayMs = nextRecoveryDelayMs(attempt)

      const message = isTransientApiError(error)
        ? buildRecoveryMessage('tickets', attempt)
        : 'Delayed response while loading tickets. Retrying automatically...'
      setTicketsNotice(`${message} Next retry in ${Math.ceil(delayMs / 1000)}s.`)
      setIsTicketsLoading(!hasLoadedTicketsRef.current)

      ticketsRetryTimerRef.current = window.setTimeout(() => {
        if (ticketsRequestIdRef.current === requestId) {
          void loadTicketsRef.current()
        }
      }, delayMs)
    }
  }, [filters])

  const loadStats = useCallback(async () => {
    const requestId = statsRequestIdRef.current + 1
    statsRequestIdRef.current = requestId

    if (statsRetryTimerRef.current !== null) {
      window.clearTimeout(statsRetryTimerRef.current)
      statsRetryTimerRef.current = null
    }

    setIsStatsLoading(!hasLoadedStatsRef.current)

    try {
      const nextStats = await fetchStats()
      if (statsRequestIdRef.current !== requestId) return

      hasLoadedStatsRef.current = true
      statsRetryAttemptRef.current = 0
      setStats(nextStats)
      setStatsNotice(null)
      setIsStatsLoading(false)
    } catch (error) {
      if (statsRequestIdRef.current !== requestId) return

      statsRetryAttemptRef.current += 1
      const attempt = statsRetryAttemptRef.current
      const delayMs = nextRecoveryDelayMs(attempt)
      const message = isTransientApiError(error)
        ? buildRecoveryMessage('stats', attempt)
        : 'Delayed response while loading stats. Retrying automatically...'
      setStatsNotice(`${message} Next retry in ${Math.ceil(delayMs / 1000)}s.`)
      setIsStatsLoading(!hasLoadedStatsRef.current)

      statsRetryTimerRef.current = window.setTimeout(() => {
        if (statsRequestIdRef.current === requestId) {
          void loadStatsRef.current()
        }
      }, delayMs)
    }
  }, [])

  const syncQueuedTickets = useCallback(async () => {
    if (isSyncQueueInFlightRef.current) return

    const initialQueue = listQueuedTickets()
    setPendingQueue(initialQueue)
    if (initialQueue.length === 0) {
      setSyncNotice(null)
      setIsSyncingQueue(false)
      return
    }

    const offline = typeof navigator !== 'undefined' && !navigator.onLine
    if (offline) {
      setSyncNotice(buildQueueNotice(initialQueue.length, true))
      return
    }

    isSyncQueueInFlightRef.current = true
    setIsSyncingQueue(true)
    let syncedAny = false

    try {
      let remainingQueue = listQueuedTickets()
      while (remainingQueue.length > 0) {
        const nextQueuedTicket = remainingQueue[0]

        try {
          await createTicket(nextQueuedTicket.payload)
          removeQueuedTicket(nextQueuedTicket.queue_id)
          syncedAny = true
          remainingQueue = listQueuedTickets()
          setPendingQueue(remainingQueue)
        } catch (error) {
          if (isTransientApiError(error)) {
            setSyncNotice(buildQueueNotice(remainingQueue.length, false))
          } else {
            setActionError(
              error instanceof Error
                ? `Queued ticket failed to sync: ${error.message}`
                : 'Queued ticket failed to sync.',
            )
          }
          break
        }
      }

      const remaining = listQueuedTickets()
      setPendingQueue(remaining)
      setSyncNotice(remaining.length > 0 ? buildQueueNotice(remaining.length, false) : null)

      if (syncedAny) {
        await Promise.all([loadTickets(), loadStats()])
      }
    } finally {
      isSyncQueueInFlightRef.current = false
      setIsSyncingQueue(false)
    }
  }, [loadStats, loadTickets])

  const handleCreateTicket = useCallback(
    async (payload: CreateTicketPayload): Promise<{ queued: boolean }> => {
      setActionError(null)
      try {
        await createTicket(payload)
        await Promise.all([loadTickets(), loadStats()])
        return { queued: false }
      } catch (error) {
        if (!isTransientApiError(error)) {
          throw error
        }

        enqueueTicket(payload)
        const queue = listQueuedTickets()
        setPendingQueue(queue)
        setSyncNotice(
          buildQueueNotice(
            queue.length,
            typeof navigator !== 'undefined' && !navigator.onLine,
          ),
        )
        void syncQueueRef.current()
        return { queued: true }
      }
    },
    [loadStats, loadTickets],
  )

  useEffect(() => {
    loadTicketsRef.current = loadTickets
  }, [loadTickets])

  useEffect(() => {
    loadStatsRef.current = loadStats
  }, [loadStats])

  useEffect(() => {
    syncQueueRef.current = syncQueuedTickets
  }, [syncQueuedTickets])

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  useEffect(() => {
    void syncQueueRef.current()
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void syncQueueRef.current()
    }, 12000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const handleOnline = () => {
      void Promise.all([loadTickets(), loadStats(), syncQueueRef.current()])
    }
    const handleOffline = () => {
      setTicketsNotice('You are offline. Waiting to reconnect and load saved tickets.')
      setStatsNotice('You are offline. Waiting to reconnect and load dashboard stats.')
      const queueLength = listQueuedTickets().length
      if (queueLength > 0) {
        setSyncNotice(buildQueueNotice(queueLength, true))
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [loadStats, loadTickets])

  useEffect(() => {
    return () => {
      if (ticketsRetryTimerRef.current !== null) {
        window.clearTimeout(ticketsRetryTimerRef.current)
      }
      if (statsRetryTimerRef.current !== null) {
        window.clearTimeout(statsRetryTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  const markTicketUpdating = useCallback((ticketId: number, isUpdating: boolean) => {
    setUpdatingTicketIds((previous) => {
      const next = new Set(previous)
      if (isUpdating) {
        next.add(ticketId)
      } else {
        next.delete(ticketId)
      }
      return next
    })
  }, [])

  const handleStatusChange = useCallback(
    async (ticketId: number, status: TicketStatus) => {
      if (ticketId < 0) {
        setActionError('Local queued tickets can be updated after backend sync completes.')
        return
      }
      setActionError(null)
      markTicketUpdating(ticketId, true)
      try {
        await updateTicket(ticketId, { status })
        await Promise.all([loadTickets(), loadStats()])
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : 'Unable to update ticket status.',
        )
      } finally {
        markTicketUpdating(ticketId, false)
      }
    },
    [loadStats, loadTickets, markTicketUpdating],
  )

  const liveTime = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const queuedLocalTickets = useMemo(
    () =>
      pendingQueue
        .map((item) => queuedTicketToLocalTicket(item))
        .filter((ticket) => matchesActiveFilters(ticket, filters)),
    [filters, pendingQueue],
  )
  const visibleTickets = useMemo(
    () =>
      [...queuedLocalTickets, ...tickets].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [queuedLocalTickets, tickets],
  )
  const activeFilters =
    [filters.category, filters.priority, filters.status].filter(Boolean).length +
    (filters.search.trim() ? 1 : 0)
  const quickStats = [
    { label: 'Total tickets', value: stats ? String(stats.total_tickets) : '--' },
    { label: 'Open now', value: stats ? String(stats.open_tickets) : '--' },
    {
      label: 'Avg/day',
      value: stats ? stats.avg_tickets_per_day.toFixed(1) : '--',
    },
    { label: 'Filtered view', value: String(visibleTickets.length) },
  ]
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
  const queueStatusNotice =
    syncNotice ||
    (pendingQueue.length > 0 ? buildQueueNotice(pendingQueue.length, isOffline) : null)
  const showTicketsLoading = isTicketsLoading && visibleTickets.length === 0
  const recoveryNotice =
    isOffline
      ? 'You are offline. Waiting to reconnect and sync tickets and stats.'
      : ticketsNotice && statsNotice
        ? 'Backend is waking up on Render free tier. Retrying tickets and stats automatically.'
        : ticketsNotice ?? statsNotice

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="container header-row">
          <div className="brand-block">
            <p className="eyebrow">Support Desk</p>
            <h1>Ticket Command Center</h1>
          </div>
          <div className="live-pill">
            <span className="live-dot" />
            <span>Live {liveTime}</span>
          </div>
        </div>
      </header>

      <main className="container app-main">
        <section className="hero-strip reveal">
          <div className="hero-copy">
            <h2>Capture, classify, and close issues faster</h2>
            <p>
              Real-time prioritization with AI-assisted suggestions and instant status
              updates.
            </p>
          </div>
          <div className="hero-metrics">
            {quickStats.map((item) => (
              <article className="metric-chip" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
        </section>

        {actionError ? <p className="notice error global-error">{actionError}</p> : null}
        {recoveryNotice ? <p className="notice info global-info">{recoveryNotice}</p> : null}
        {queueStatusNotice ? (
          <p className="notice info global-info">
            {queueStatusNotice}
            {isSyncingQueue ? ' Syncing now...' : ''}
          </p>
        ) : null}
        <div className="layout-grid">
          <div className="left-column">
            <TicketForm onCreateTicket={handleCreateTicket} />
            <StatsCard stats={stats} loading={isStatsLoading} notice={statsNotice} />
          </div>

          <div className="right-column">
            <TicketList
              tickets={visibleTickets}
              loading={showTicketsLoading}
              notice={ticketsNotice}
              filters={filters}
              activeFilters={activeFilters}
              onFiltersChange={setFilters}
              onStatusChange={handleStatusChange}
              updatingTicketIds={updatingTicketIds}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
