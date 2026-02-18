TITLE_SUGGEST_PROMPT = (
    "Generate a concise support ticket title from the description. "
    "No quotes, no markdown, no trailing punctuation. "
    "Keep it informative and short."
)

SENTIMENT_URGENCY_PROMPT = (
    "Analyze ticket tone and urgency using title and description. "
    "Pick sentiment from calm, neutral, frustrated, angry. "
    "Set urgency_score from 0 to 100 based on business impact, outages, "
    "deadlines, and urgency cues. Do not infer urgency from category alone."
)
