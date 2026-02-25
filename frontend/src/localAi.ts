import type {
  TicketCategory,
  TicketClassification,
  TicketPriority,
  TicketSentiment,
} from './api'

const categoryKeywords: Record<TicketCategory, string[]> = {
  billing: [
    'billing',
    'invoice',
    'payment',
    'charged',
    'charge',
    'refund',
    'subscription',
    'card',
    'plan',
    'checkout',
  ],
  technical: [
    'error',
    'bug',
    'crash',
    'timeout',
    'latency',
    'down',
    'unavailable',
    'api',
    'server',
    '500',
    '502',
    '503',
    '504',
    'not working',
  ],
  account: [
    'login',
    'log in',
    'signin',
    'sign in',
    'password',
    'account',
    'locked',
    'verify',
    'verification',
    'profile',
    'otp',
    'auth',
  ],
  general: [],
}

function normalize(value: string): string {
  return value.toLowerCase().trim()
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword))
}

function scorePriority(text: string): number {
  let score = 10

  if (
    containsAny(text, [
      'critical',
      'sev1',
      'p1',
      'production down',
      'outage',
      'all users',
      'data loss',
      'security incident',
    ])
  ) {
    score += 50
  }

  if (containsAny(text, ['urgent', 'asap', 'immediately', 'blocking', 'blocked'])) {
    score += 25
  }

  if (
    containsAny(text, [
      'error',
      'failed',
      'failure',
      'timeout',
      'cannot',
      "can't",
      'unable',
    ])
  ) {
    score += 20
  }

  if (containsAny(text, ['500', '502', '503', '504', 'database', 'backend'])) {
    score += 15
  }

  return Math.max(0, Math.min(100, score))
}

function toPriority(score: number): TicketPriority {
  if (score >= 75) return 'critical'
  if (score >= 50) return 'high'
  if (score >= 30) return 'medium'
  return 'low'
}

function inferSentiment(text: string): TicketSentiment {
  if (
    containsAny(text, [
      'furious',
      'angry',
      'unacceptable',
      'terrible',
      'worst',
      'frustrating',
      'immediately fix',
    ])
  ) {
    return 'angry'
  }

  if (
    containsAny(text, [
      'frustrated',
      'annoyed',
      'still not working',
      'again',
      'stuck',
      'broken',
    ])
  ) {
    return 'frustrated'
  }

  if (containsAny(text, ['please', 'could you', 'help', 'when possible', 'thanks'])) {
    return 'calm'
  }

  return 'neutral'
}

export function classifyTicketLocally(description: string): TicketClassification {
  const text = normalize(description)
  const categoryScores: Record<TicketCategory, number> = {
    billing: 0,
    technical: 0,
    account: 0,
    general: 0,
  }

  for (const category of Object.keys(categoryKeywords) as TicketCategory[]) {
    const keywords = categoryKeywords[category]
    categoryScores[category] = keywords.filter((keyword) => text.includes(keyword)).length
  }

  const suggestedCategory =
    (Object.entries(categoryScores).sort((a, b) => b[1] - a[1])[0]?.[0] as TicketCategory) ||
    'general'
  const rawPriorityScore = scorePriority(text)

  return {
    suggested_category:
      suggestedCategory === 'general' && rawPriorityScore >= 45
        ? 'technical'
        : suggestedCategory,
    suggested_priority: toPriority(rawPriorityScore),
  }
}

export function scoreTicketLocally(title: string, description: string): {
  sentiment: TicketSentiment
  urgency_score: number
} {
  const text = normalize(`${title} ${description}`)
  const priorityScore = scorePriority(text)
  const sentiment = inferSentiment(text)

  const sentimentBoost: Record<TicketSentiment, number> = {
    calm: -8,
    neutral: 0,
    frustrated: 8,
    angry: 14,
  }

  const urgencyScore = Math.max(
    0,
    Math.min(100, priorityScore + sentimentBoost[sentiment]),
  )

  return { sentiment, urgency_score: urgencyScore }
}
