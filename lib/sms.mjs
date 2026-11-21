// Sends texts through Twilio's REST API. With no Twilio keys set, it only logs (handy for testing).
const SID = () => process.env.TWILIO_ACCOUNT_SID
const TOKEN = () => process.env.TWILIO_AUTH_TOKEN
const FROM = () => process.env.TWILIO_FROM

export const smsConfigured = () => Boolean(SID() && TOKEN() && FROM())

export async function sendSms(to, body) {
  if (!smsConfigured()) {
    console.log(`[dry run] text to ${to}: ${body}`)
    return { ok: true, dryRun: true }
  }
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID()}/Messages.json`, {
    method: 'POST',
    headers: {
      authorization: 'Basic ' + Buffer.from(`${SID()}:${TOKEN()}`).toString('base64'),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: FROM(), Body: body }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) return { ok: false, error: j.message || `Twilio ${r.status}` }
  return { ok: true, sid: j.sid }
}

// Texts the whole list one by one (about 1 a second, which a normal Twilio number can handle).
export async function sendToAll(guests, body, onProgress = () => {}) {
  let sent = 0, failed = 0
  for (const g of guests) {
    const res = await sendSms(g.phone, body)
    res.ok ? sent++ : failed++
    onProgress({ sent, failed, total: guests.length })
    if (smsConfigured()) await new Promise((r) => setTimeout(r, 1100))
  }
  return { sent, failed }
}

// Hours when marketing texts may go out, in the restaurant's time zone (US rules: not before 8 am or after 9 pm).
export function insideQuietHours(now = new Date(), tz = process.env.TIMEZONE || 'America/New_York') {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(now))
  return hour < 9 || hour >= 20             // we keep a margin: only 9 am to 8 pm
}
