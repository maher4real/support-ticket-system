import { useEffect, useRef, useState } from 'react'

import type {
  TicketCategory,
  TicketPriority,
  TicketSentiment,
  TicketStats,
} from '../api'

interface StatsCardProps {
  stats: TicketStats | null
  loading: boolean
  error: string | null
  variant?: 'card' | 'bar'
}

function useAnimatedNumber(target: number, precision = 0): number {
  const [displayValue, setDisplayValue] = useState(target)
  const previousRef = useRef(target)

  useEffect(() => {
    const startValue = previousRef.current
    const duration = 500
    const startTime = performance.now()
    let animationFrameId = 0

    const animate = (timestamp: number) => {
      const elapsed = Math.min((timestamp - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - elapsed, 3)
      const nextValue = startValue + (target - startValue) * eased
      const rounded =
        precision === 0 ? Math.round(nextValue) : Number(nextValue.toFixed(precision))
      setDisplayValue(rounded)

      if (elapsed < 1) {
        animationFrameId = window.requestAnimationFrame(animate)
      }
    }

    animationFrameId = window.requestAnimationFrame(animate)
    previousRef.current = target

    return () => window.cancelAnimationFrame(animationFrameId)
  }, [target, precision])

  return displayValue
}

const priorityLabels: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

const categoryLabels: Record<TicketCategory, string> = {
  billing: 'Billing',
  technical: 'Technical',
  account: 'Account',
  general: 'General',
}

const sentimentLabels: Record<TicketSentiment, string> = {
  calm: 'Calm',
  neutral: 'Neutral',
  frustrated: 'Frustrated',
  angry: 'Angry',
}

export function StatsCard({
  stats,
  loading,
  error,
  variant = 'card',
}: StatsCardProps) {
  const totalTickets = useAnimatedNumber(stats?.total_tickets ?? 0)
  const openTickets = useAnimatedNumber(stats?.open_tickets ?? 0)
  const averagePerDay = useAnimatedNumber(stats?.avg_tickets_per_day ?? 0, 1)
  const averageUrgencyScore = useAnimatedNumber(stats?.avg_urgency_score ?? 0, 1)

  const priorityEntries = stats
    ? (Object.entries(stats.priority_breakdown) as Array<[TicketPriority, number]>)
    : []
  const categoryEntries = stats
    ? (Object.entries(stats.category_breakdown) as Array<[TicketCategory, number]>)
    : []
  const sentimentEntries = stats?.sentiment_breakdown
    ? (Object.entries(stats.sentiment_breakdown) as Array<[TicketSentiment, number]>)
    : []

  const priorityTotal = priorityEntries.reduce((total, [, value]) => total + value, 0)
  const categoryTotal = categoryEntries.reduce((total, [, value]) => total + value, 0)
  const sentimentTotal = sentimentEntries.reduce((total, [, value]) => total + value, 0)
  const hasUrgencyScore = typeof stats?.avg_urgency_score === 'number'
  const hasSentimentBreakdown = sentimentEntries.length > 0
  const isBar = variant === 'bar'

  return (
    <section className={`card reveal ${isBar ? 'stats-bar' : ''}`}>
      <div className="card-header">
        <div>
          <h2>Ticket Stats</h2>
          <p className="card-subtitle">
            {isBar ? 'Bottom live bar' : 'Live workload breakdown'}
          </p>
        </div>
      </div>

      {loading ? <p className="muted">Loading stats...</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      {loading ? (
        <div className="stats-skeleton">
          <div className="stats-grid">
            <div className="stat-tile stats-tile-skeleton" />
            <div className="stat-tile stats-tile-skeleton" />
            <div className="stat-tile stats-tile-skeleton" />
          </div>
          {!isBar ? (
            <div className="breakdowns">
              <div className="breakdown-skeleton" />
              <div className="breakdown-skeleton" />
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && stats ? (
        <div className="stats-content">
          <div className={`stats-grid ${isBar ? 'stats-grid-bar' : ''}`}>
            <article className="stat-tile">
              <span>Total Tickets</span>
              <strong>{totalTickets}</strong>
            </article>
            <article className="stat-tile">
              <span>Open Tickets</span>
              <strong>{openTickets}</strong>
            </article>
            <article className="stat-tile">
              <span>Average / Day</span>
              <strong>{averagePerDay.toFixed(1)}</strong>
            </article>
            {hasUrgencyScore ? (
              <article className="stat-tile">
                <span>Avg Urgency</span>
                <strong>{averageUrgencyScore.toFixed(1)}</strong>
              </article>
            ) : null}
          </div>

          {isBar ? (
            <div className="stats-bar-breakdowns">
              <div className="mini-row">
                <span className="mini-label">Priority</span>
                {priorityEntries.map(([key, value]) => (
                  <span className="mini-chip" key={key}>
                    {priorityLabels[key]}: {value}
                  </span>
                ))}
              </div>
              <div className="mini-row">
                <span className="mini-label">Category</span>
                {categoryEntries.map(([key, value]) => (
                  <span className="mini-chip" key={key}>
                    {categoryLabels[key]}: {value}
                  </span>
                ))}
              </div>
              {hasSentimentBreakdown ? (
                <div className="mini-row">
                  <span className="mini-label">Sentiment</span>
                  {sentimentEntries.map(([key, value]) => (
                    <span className="mini-chip" key={key}>
                      {sentimentLabels[key]}: {value}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="breakdowns">
              <div className="breakdown-panel">
                <h3>Priority</h3>
                <div className="breakdown-list">
                  {priorityEntries.map(([key, value]) => {
                    const ratio = priorityTotal > 0 ? (value / priorityTotal) * 100 : 0
                    return (
                      <article className="breakdown-row" key={key}>
                        <div className="breakdown-meta">
                          <span>{priorityLabels[key]}</span>
                          <strong>{value}</strong>
                        </div>
                        <div className="meter-track">
                          <div className="meter-fill" style={{ width: `${ratio}%` }} />
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>

              <div className="breakdown-panel">
                <h3>Category</h3>
                <div className="breakdown-list">
                  {categoryEntries.map(([key, value]) => {
                    const ratio = categoryTotal > 0 ? (value / categoryTotal) * 100 : 0
                    return (
                      <article className="breakdown-row" key={key}>
                        <div className="breakdown-meta">
                          <span>{categoryLabels[key]}</span>
                          <strong>{value}</strong>
                        </div>
                        <div className="meter-track">
                          <div className="meter-fill" style={{ width: `${ratio}%` }} />
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>

              {hasSentimentBreakdown ? (
                <div className="breakdown-panel">
                  <h3>Sentiment</h3>
                  <div className="breakdown-list">
                    {sentimentEntries.map(([key, value]) => {
                      const ratio = sentimentTotal > 0 ? (value / sentimentTotal) * 100 : 0
                      return (
                        <article className="breakdown-row" key={key}>
                          <div className="breakdown-meta">
                            <span>{sentimentLabels[key]}</span>
                            <strong>{value}</strong>
                          </div>
                          <div className="meter-track">
                            <div className="meter-fill" style={{ width: `${ratio}%` }} />
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
