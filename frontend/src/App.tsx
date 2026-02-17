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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="container">
          <h1>Support Ticket System</h1>
        </div>
      </header>

      <main className="container app-main">
        {actionError ? <p className="notice error global-error">{actionError}</p> : null}
        <div className="layout-grid">
          <div className="left-column">
            <TicketForm onTicketCreated={handleTicketCreated} />
            <StatsCard stats={stats} loading={isStatsLoading} error={statsError} />
          </div>

          <div className="right-column">
            <TicketList
              tickets={tickets}
              loading={isTicketsLoading}
              error={ticketsError}
              filters={filters}
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
