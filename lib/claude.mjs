// Claude writes the slow-night text: one short offer, under 160 characters, ending with the opt-out line.
import Anthropic from '@anthropic-ai/sdk'

const OPT_OUT = 'Reply STOP to opt out.'

export async function writeText({ restaurant, offer, when }) {
  const client = new Anthropic()
  // Server-side fallback: if the request is ever declined, the API retries it on a fallback model in the same call.
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 2000,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system:
      'You write one SMS for a restaurant to send to guests who signed up for its text list. ' +
      'Rules: under 140 characters, friendly, one clear offer, say when it is valid, no hashtags, at most one emoji. ' +
      'Reply with the text only, nothing else.',
    messages: [{ role: 'user', content: `Restaurant: ${restaurant}\nOffer: ${offer}\nValid: ${when}` }],
  })
  if (response.stop_reason === 'refusal') throw new Error('Claude declined to write this text. Try a different offer.')
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
  return withOptOut(text.replace(/^"|"$/g, ''))
}

export function withOptOut(text) {
  const clean = text.replace(/\s*reply stop to (opt out|unsubscribe)\.?\s*$/i, '').trim()
  return `${clean} ${OPT_OUT}`
}
