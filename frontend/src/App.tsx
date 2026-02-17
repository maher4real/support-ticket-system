import { useCallback, useEffect, useRef, useState } from 'react'

import {
  fetchStats,
  fetchTickets,
  type Ticket,
  type TicketStatus,
  type TicketStats,
  updateTicket,
} from './api'
import { TicketForm } from './components/TicketForm'
import { TicketList } from './components/TicketList'
import { StatsCard } from './components/StatsCard'
import type { TicketFilters } from './components/FiltersBar'
import './App.css'

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
  const [ticketsError, setTicketsError] = useState<string | null>(null)

  const [isStatsLoading, setIsStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  const [updatingTicketIds, setUpdatingTicketIds] = useState<Set<number>>(new Set())
  const [now, setNow] = useState(() => new Date())

  const ticketsRequestIdRef = useRef(0)

  const loadTickets = useCallback(async () => {
    const requestId = ticketsRequestIdRef.current + 1
    ticketsRequestIdRef.current = requestId

    setIsTicketsLoading(true)
    setTicketsError(null)
    try {
      const nextTickets = await fetchTickets(filters)
      if (ticketsRequestIdRef.current === requestId) {
        setTickets(nextTickets)
      }
    } catch (error) {
      if (ticketsRequestIdRef.current === requestId) {
        setTicketsError(
          error instanceof Error ? error.message : 'Unable to load tickets right now.',
        )
      }
    } finally {
      if (ticketsRequestIdRef.current === requestId) {
        setIsTicketsLoading(false)
      }
    }
  }, [filters])

  const loadStats = useCallback(async () => {
    setIsStatsLoading(true)
    setStatsError(null)
    try {
      const nextStats = await fetchStats()
      setStats(nextStats)
    } catch (error) {
      setStatsError(error instanceof Error ? error.message : 'Unable to load stats.')
    } finally {
      setIsStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTickets()
  }, [loadTickets])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(intervalId)
  }, [])

  const handleTicketCreated = useCallback(async () => {
    setActionError(null)
    await Promise.all([loadTickets(), loadStats()])
  }, [loadStats, loadTickets])

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
    { label: 'Filtered view', value: String(tickets.length) },
  ]

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
        <div className="layout-grid">
          <div className="left-column">
            <TicketForm onTicketCreated={handleTicketCreated} />
          </div>

          <div className="right-column">
            <TicketList
              tickets={tickets}
              loading={isTicketsLoading}
              error={ticketsError}
              filters={filters}
              activeFilters={activeFilters}
              onFiltersChange={setFilters}
              onStatusChange={handleStatusChange}
              updatingTicketIds={updatingTicketIds}
            />
          </div>
        </div>

        <div className="stats-dock">
          <StatsCard stats={stats} loading={isStatsLoading} error={statsError} variant="bar" />
        </div>
      </main>
    </div>
  )
}

export default App
