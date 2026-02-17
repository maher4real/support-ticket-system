import type { TicketCategory, TicketPriority, TicketStatus } from '../api'

export interface TicketFilters {
  category: TicketCategory | ''
  priority: TicketPriority | ''
  status: TicketStatus | ''
  search: string
}

interface FiltersBarProps {
  filters: TicketFilters
  onChange: (next: TicketFilters) => void
}

export function FiltersBar({ filters, onChange }: FiltersBarProps) {
  return (
    <div className="filters-grid">
      <label className="field">
        <span>Search</span>
        <input
          type="text"
          value={filters.search}
          onChange={(event) =>
            onChange({
              ...filters,
              search: event.target.value,
            })
          }
          placeholder="Title or description"
        />
      </label>

      <label className="field">
        <span>Category</span>
        <select
          value={filters.category}
          onChange={(event) =>
            onChange({
              ...filters,
              category: event.target.value as TicketCategory | '',
            })
          }
        >
          <option value="">All</option>
          <option value="billing">Billing</option>
          <option value="technical">Technical</option>
          <option value="account">Account</option>
          <option value="general">General</option>
        </select>
      </label>

      <label className="field">
        <span>Priority</span>
        <select
          value={filters.priority}
          onChange={(event) =>
            onChange({
              ...filters,
              priority: event.target.value as TicketPriority | '',
            })
          }
        >
          <option value="">All</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </label>

      <label className="field">
        <span>Status</span>
        <select
          value={filters.status}
          onChange={(event) =>
            onChange({
              ...filters,
              status: event.target.value as TicketStatus | '',
            })
          }
        >
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </label>
    </div>
  )
}
