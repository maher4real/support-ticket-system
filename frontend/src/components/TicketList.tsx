import type { Ticket, TicketStatus } from '../api'
import { FiltersBar, type TicketFilters } from './FiltersBar'

interface TicketListProps {
  tickets: Ticket[]
  loading: boolean
  error: string | null
  filters: TicketFilters
  onFiltersChange: (next: TicketFilters) => void
  updatingTicketIds: Set<number>
  onStatusChange: (ticketId: number, status: TicketStatus) => Promise<void> | void
}

const statusOptions: Array<{ label: string; value: TicketStatus }> = [
  { label: 'Open', value: 'open' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Closed', value: 'closed' },
]

function truncate(text: string): string {
  if (text.length <= 160) return text
  return `${text.slice(0, 157)}...`
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

export function TicketList({
  tickets,
  loading,
  error,
  filters,
  onFiltersChange,
  updatingTicketIds,
  onStatusChange,
}: TicketListProps) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>Tickets</h2>
      </div>

      <FiltersBar filters={filters} onChange={onFiltersChange} />

      {loading ? <p className="muted">Loading tickets...</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      {!loading && !error && tickets.length === 0 ? (
        <p className="empty-state">No tickets yet.</p>
      ) : null}

      <div className="tickets-list">
        {tickets.map((ticket) => {
          const isUpdating = updatingTicketIds.has(ticket.id)
          return (
            <article className="ticket-item" key={ticket.id}>
              <div className="ticket-item-head">
                <h3>{ticket.title}</h3>
                <span className="ticket-created">{formatDate(ticket.created_at)}</span>
              </div>

              <p className="ticket-description">{truncate(ticket.description)}</p>

              <div className="ticket-meta">
                <span className={`badge category-${ticket.category}`}>{ticket.category}</span>
                <span className={`badge priority-${ticket.priority}`}>{ticket.priority}</span>
                <span className={`badge status-${ticket.status}`}>{ticket.status}</span>
              </div>

              <label className="status-control">
                <span>Status</span>
                <select
                  value={ticket.status}
                  disabled={isUpdating}
                  onChange={(event) =>
                    void onStatusChange(ticket.id, event.target.value as TicketStatus)
                  }
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {isUpdating ? <small className="field-hint">Updating...</small> : null}
              </label>
            </article>
          )
        })}
      </div>
    </section>
  )
}
