import type { TicketStats } from '../api'

interface StatsCardProps {
  stats: TicketStats | null
  loading: boolean
  error: string | null
}

export function StatsCard({ stats, loading, error }: StatsCardProps) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>Ticket Stats</h2>
      </div>

      {loading ? <p className="muted">Loading stats...</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      {!loading && !error && stats ? (
        <div className="stats-content">
          <div className="stats-grid">
            <article className="stat-tile">
              <span>Total Tickets</span>
              <strong>{stats.total_tickets}</strong>
            </article>
            <article className="stat-tile">
              <span>Open Tickets</span>
              <strong>{stats.open_tickets}</strong>
            </article>
            <article className="stat-tile">
              <span>Average / Day</span>
              <strong>{stats.avg_tickets_per_day.toFixed(1)}</strong>
            </article>
          </div>

          <div className="breakdowns">
            <div>
              <h3>Priority</h3>
              <ul>
                <li>Low: {stats.priority_breakdown.low}</li>
                <li>Medium: {stats.priority_breakdown.medium}</li>
                <li>High: {stats.priority_breakdown.high}</li>
                <li>Critical: {stats.priority_breakdown.critical}</li>
              </ul>
            </div>

            <div>
              <h3>Category</h3>
              <ul>
                <li>Billing: {stats.category_breakdown.billing}</li>
                <li>Technical: {stats.category_breakdown.technical}</li>
                <li>Account: {stats.category_breakdown.account}</li>
                <li>General: {stats.category_breakdown.general}</li>
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
