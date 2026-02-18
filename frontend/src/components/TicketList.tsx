import type { Ticket, TicketStatus } from '../api'
import { FiltersBar, type TicketFilters } from './FiltersBar'

interface TicketListProps {
  tickets: Ticket[]
  loading: boolean
  error: string | null
  filters: TicketFilters
  activeFilters: number
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
  if (text.length <= 220) return text
  return `${text.slice(0, 217)}...`
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

function formatRelativeTime(value: string): string {
  const now = Date.now()
  const then = new Date(value).getTime()
  const diffMinutes = Math.floor((now - then) / 60000)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

export function TicketList({
  tickets,
  loading,
  error,
  filters,
  activeFilters,
  onFiltersChange,
  updatingTicketIds,
  onStatusChange,
}: TicketListProps) {
  return (
    <section className="card reveal">
      <div className="card-header">
        <div>
          <h2>Tickets</h2>
          <p className="card-subtitle">
            {tickets.length} shown {activeFilters > 0 ? `with ${activeFilters} active filters` : ''}
          </p>
        </div>
      </div>

      <FiltersBar filters={filters} onChange={onFiltersChange} />

      {loading ? <p className="muted">Loading tickets...</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      <div className="tickets-list">
        {loading
          ? Array.from({ length: 3 }, (_, index) => (
              <article className="ticket-item ticket-skeleton" key={index}>
                <div className="skeleton-line skeleton-title" />
                <div className="skeleton-line" />
                <div className="skeleton-line skeleton-short" />
                <div className="skeleton-pills">
                  <span />
                  <span />
                  <span />
                </div>
              </article>
            ))
          : null}

        {!loading && !error && tickets.length === 0 ? (
          <p className="empty-state">No tickets yet. Create your first issue on the left.</p>
        ) : null}

        {tickets.map((ticket) => {
          const isUpdating = updatingTicketIds.has(ticket.id)
          return (
            <article
              className="ticket-item ticket-animated"
              key={ticket.id}
              style={{ animationDelay: `${ticket.id % 7}00ms` }}
            >
              <div className="ticket-item-head">
                <h3>{ticket.title}</h3>
                <time className="ticket-created" title={formatDate(ticket.created_at)}>
                  {formatRelativeTime(ticket.created_at)}
                </time>
              </div>

              <p className="ticket-description">{truncate(ticket.description)}</p>

              <div className="ticket-meta">
                <span className={`badge category-${ticket.category}`}>{ticket.category}</span>
                <span className={`badge priority-${ticket.priority}`}>{ticket.priority}</span>
                <span className={`badge status-${ticket.status}`}>{ticket.status}</span>
                <span className={`badge sentiment-${ticket.sentiment}`}>{ticket.sentiment}</span>
                <span className="badge urgency-badge">Urgency {ticket.urgency_score}</span>
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
