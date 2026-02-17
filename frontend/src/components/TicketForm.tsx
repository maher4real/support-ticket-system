import { useEffect, useRef, useState, type FormEvent } from 'react'

import {
  classifyTicket,
  createTicket,
  type TicketCategory,
  type TicketPriority,
} from '../api'

interface TicketFormProps {
  onTicketCreated: () => Promise<void> | void
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

export function TicketForm({ onTicketCreated }: TicketFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TicketCategory>('general')
  const [priority, setPriority] = useState<TicketPriority>('low')

  const [categoryManuallyEdited, setCategoryManuallyEdited] = useState(false)
  const [priorityManuallyEdited, setPriorityManuallyEdited] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [classifyNotice, setClassifyNotice] = useState<string | null>(null)

  const classifyRequestIdRef = useRef(0)
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
            setClassifyNotice('Suggestion unavailable. You can continue manually.')
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
      await createTicket({
        title: trimmedTitle,
        description: trimmedDescription,
        category,
        priority,
      })

      setTitle('')
      setDescription('')
      setCategory('general')
      setPriority('low')
      setCategoryManuallyEdited(false)
      setPriorityManuallyEdited(false)
      setClassifyNotice(null)
      await onTicketCreated()
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
        <div className={`assistant-chip ${isSuggesting ? 'is-busy' : ''}`}>
          <span className="assistant-dot" />
          <span>{isSuggesting ? 'AI suggesting' : 'AI ready'}</span>
        </div>
      </div>

      <form className="ticket-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Title</span>
          <input
            type="text"
            maxLength={200}
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Short summary"
          />
          <div className="meter-track title-track">
            <div className="meter-fill title-fill" style={{ width: `${titleRatio}%` }} />
          </div>
          <small className="field-hint">{title.length}/200 characters</small>
        </label>

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
