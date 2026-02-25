import { useEffect, useRef, useState, type FormEvent } from 'react'

import {
  classifyTicket,
  suggestTitle,
  type CreateTicketPayload,
  type TicketCategory,
  type TicketPriority,
} from '../api'
import { classifyTicketLocally } from '../localAi'

interface TicketFormProps {
  onCreateTicket: (
    payload: CreateTicketPayload,
  ) => Promise<{ queued: boolean }>
}

const categoryOptions: Array<{ label: string; value: TicketCategory }> = [
  { label: 'Billing', value: 'billing' },
  { label: 'Technical', value: 'technical' },
  { label: 'Account', value: 'account' },
  { label: 'General', value: 'general' },
]

const priorityOptions: Array<{ label: string; value: TicketPriority }> = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Critical', value: 'critical' },
]

const QUICK_TITLE_MAX_LENGTH = 60

function buildQuickTitle(description: string): string {
  const compact = description.replace(/\s+/g, ' ').trim()
  if (!compact) return 'Support request'

  const firstSentence = compact.split(/[.!?]/, 1)[0]?.trim() || compact
  const candidate = firstSentence.replace(/["'`]+/g, '').trim()
  if (!candidate) return 'Support request'

  if (candidate.length <= QUICK_TITLE_MAX_LENGTH) return candidate
  return candidate.slice(0, QUICK_TITLE_MAX_LENGTH).trimEnd()
}

export function TicketForm({ onCreateTicket }: TicketFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TicketCategory>('general')
  const [priority, setPriority] = useState<TicketPriority>('low')

  const [categoryManuallyEdited, setCategoryManuallyEdited] = useState(false)
  const [priorityManuallyEdited, setPriorityManuallyEdited] = useState(false)
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [isTitleSuggesting, setIsTitleSuggesting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [classifyNotice, setClassifyNotice] = useState<string | null>(null)
  const [titleSuggestionNotice, setTitleSuggestionNotice] = useState<string | null>(null)
  const [pendingSuggestedTitle, setPendingSuggestedTitle] = useState<string | null>(null)

  const classifyRequestIdRef = useRef(0)
  const titleSuggestionCacheRef = useRef<Map<string, string>>(new Map())
  const titleRatio = Math.min((title.length / 200) * 100, 100)

  useEffect(() => {
    const trimmed = description.trim()
    if (!trimmed) {
      setIsSuggesting(false)
      return
    }

    const requestId = classifyRequestIdRef.current + 1
    classifyRequestIdRef.current = requestId

    const timeoutId = window.setTimeout(() => {
      const run = async () => {
        setIsSuggesting(true)
        try {
          const suggestion = await classifyTicket(trimmed)

          if (classifyRequestIdRef.current !== requestId) return

          if (!categoryManuallyEdited) {
            setCategory(suggestion.suggested_category)
          }
          if (!priorityManuallyEdited) {
            setPriority(suggestion.suggested_priority)
          }
          setClassifyNotice(null)
        } catch {
          if (classifyRequestIdRef.current === requestId) {
            const localSuggestion = classifyTicketLocally(trimmed)
            if (!categoryManuallyEdited) {
              setCategory(localSuggestion.suggested_category)
            }
            if (!priorityManuallyEdited) {
              setPriority(localSuggestion.suggested_priority)
            }
            setClassifyNotice(
              'Backend unavailable. Applied offline smart suggestion.',
            )
          }
        } finally {
          if (classifyRequestIdRef.current === requestId) {
            setIsSuggesting(false)
          }
        }
      }

      void run()
    }, 500)

    return () => window.clearTimeout(timeoutId)
  }, [description, categoryManuallyEdited, priorityManuallyEdited])

  const applySuggestedTitle = (nextTitle: string) => {
    setTitle(nextTitle)
    setTitleManuallyEdited(false)
    setPendingSuggestedTitle(null)
    setTitleSuggestionNotice(null)
  }

  const handleSuggestedTitleResult = (nextTitle: string) => {
    if (!title.trim() || !titleManuallyEdited) {
      applySuggestedTitle(nextTitle)
      return
    }
    setPendingSuggestedTitle(nextTitle)
  }

  const handleTitleSuggestion = async () => {
    const trimmedDescription = description.trim()
    if (!trimmedDescription) {
      setTitleSuggestionNotice('Add a description first to generate a title.')
      return
    }
    if (isTitleSuggesting) {
      return
    }

    const cachedTitle = titleSuggestionCacheRef.current.get(trimmedDescription)
    if (cachedTitle) {
      handleSuggestedTitleResult(cachedTitle)
      return
    }

    setTitleSuggestionNotice(null)

    const quickTitle = buildQuickTitle(trimmedDescription)
    handleSuggestedTitleResult(quickTitle)

    setIsTitleSuggesting(true)
    try {
      const suggestion = await suggestTitle(trimmedDescription, 4500)
      const nextTitle = suggestion.suggested_title.trim()
      if (!nextTitle) {
        throw new Error('Empty title')
      }

      titleSuggestionCacheRef.current.set(trimmedDescription, nextTitle)
      handleSuggestedTitleResult(nextTitle)
    } catch {
      setTitleSuggestionNotice('Applied quick title. AI refinement unavailable right now.')
    } finally {
      setIsTitleSuggesting(false)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)

    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()

    if (!trimmedTitle || !trimmedDescription) {
      setErrorMessage('Title and description are required.')
      return
    }

    try {
      setIsSaving(true)
      const result = await onCreateTicket({
        title: trimmedTitle,
        description: trimmedDescription,
        category,
        priority,
      })

      setTitle('')
      setDescription('')
      setCategory('general')
      setPriority('low')
      setTitleManuallyEdited(false)
      setCategoryManuallyEdited(false)
      setPriorityManuallyEdited(false)
      setClassifyNotice(null)
      setTitleSuggestionNotice(null)
      setPendingSuggestedTitle(null)
      if (result.queued) {
        setTitleSuggestionNotice(
          'Saved locally. It will sync automatically when backend is online.',
        )
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to create ticket right now.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="card reveal">
      <div className="card-header">
        <div>
          <h2>Create Ticket</h2>
          <p className="card-subtitle">Add clear details for faster resolution</p>
        </div>
        <div className={`assistant-chip ${isSuggesting || isTitleSuggesting ? 'is-busy' : ''}`}>
          <span className="assistant-dot" />
          <span>
            {isTitleSuggesting
              ? 'Processing title'
              : isSuggesting
                ? 'AI classifying'
                : 'AI ready'}
          </span>
        </div>
      </div>

      <form className="ticket-form" onSubmit={handleSubmit}>
        <div className="field">
          <div className="field-label-row">
            <label className="field-label" htmlFor="ticket-title">
              Title
            </label>
            <button
              type="button"
              className="secondary-button compact-button"
              disabled={isSaving || !description.trim()}
              onClick={() => void handleTitleSuggestion()}
              title={
                isTitleSuggesting
                  ? 'AI is refining the generated title'
                  : 'Generate a title from the description'
              }
            >
              Generate Title
            </button>
          </div>
          {isTitleSuggesting ? (
            <small className="field-hint">Processing...</small>
          ) : null}
          <input
            id="ticket-title"
            type="text"
            maxLength={200}
            required
            value={title}
            onChange={(event) => {
              const nextTitle = event.target.value
              setTitle(nextTitle)
              setTitleManuallyEdited(nextTitle.trim().length > 0)
              setPendingSuggestedTitle(null)
            }}
            placeholder="Short summary"
          />
          <div className="meter-track title-track">
            <div className="meter-fill title-fill" style={{ width: `${titleRatio}%` }} />
          </div>
          <small className="field-hint">{title.length}/200 characters</small>
        </div>

        {pendingSuggestedTitle ? (
          <p className="notice info">
            Suggested title: {pendingSuggestedTitle}
            <button
              type="button"
              className="text-button"
              onClick={() => applySuggestedTitle(pendingSuggestedTitle)}
            >
              Apply suggestion
            </button>
          </p>
        ) : null}
        {titleSuggestionNotice ? <p className="notice warning">{titleSuggestionNotice}</p> : null}

        <label className="field">
          <span>Description</span>
          <textarea
            rows={5}
            required
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe the issue"
          />
          <small className="field-hint">
            AI suggestions update automatically while you type.
          </small>
        </label>

        <div className="field-grid">
          <label className="field">
            <span>Category</span>
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as TicketCategory)
                setCategoryManuallyEdited(true)
              }}
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Priority</span>
            <select
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value as TicketPriority)
                setPriorityManuallyEdited(true)
              }}
            >
              {priorityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {classifyNotice ? <p className="notice warning">{classifyNotice}</p> : null}
        {errorMessage ? <p className="notice error">{errorMessage}</p> : null}

        <button type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Submit Ticket'}
        </button>
      </form>
    </section>
  )
}
