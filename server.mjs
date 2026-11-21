// Restaurant text list: one small Node server.
//   /join        the page the table QR code opens: name, phone, consent -> free appetizer code
//   /admin       the owner's page: the list, Claude writes a slow-night text, send it to everyone
//   /sms         Twilio webhook: STOP / START replies
// Run: cp .env.example .env, fill it in, npm install, npm start
import http from 'node:http'
import fs from 'node:fs'
import { normalizePhone, addGuest, allGuests, activeGuests, setOptOut } from './lib/store.mjs'
import { sendSms, sendToAll, smsConfigured, insideQuietHours } from './lib/sms.mjs'
import { writeText, withOptOut } from './lib/claude.mjs'

// .env without a dependency
try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

const NAME = process.env.RESTAURANT_NAME || 'Our restaurant'
const OFFER = process.env.OFFER || 'Free appetizer tonight'
const PORT = Number(process.env.PORT || 3000)
const CONSENT = `I agree to get marketing texts from ${NAME} (up to 4 a month). Msg & data rates may apply. Reply STOP anytime to opt out. Consent is not a condition of any purchase.`

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>
*{box-sizing:border-box}body{margin:0;font:17px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f3ec;color:#1d2b22}
main{max-width:560px;margin:0 auto;padding:28px 18px 60px}h1{font-size:30px;line-height:1.15;margin:0 0 6px}
.card{background:#fff;border-radius:16px;padding:22px;box-shadow:0 6px 24px rgba(0,0,0,.07);margin-top:18px}
label{display:block;font-weight:600;margin:14px 0 6px}input,textarea{width:100%;padding:13px 14px;border:2px solid #d9dfd9;border-radius:12px;font:inherit}
textarea{min-height:110px}button{margin-top:18px;width:100%;padding:15px;border:0;border-radius:12px;background:#1a8a4f;color:#fff;font:700 18px system-ui;cursor:pointer}
button.alt{background:#2f80ed}.fine{font-size:13px;color:#5b6b60}.check{display:flex;gap:10px;align-items:flex-start;font-weight:400;font-size:14px}
.check input{width:22px;height:22px;flex:none;margin-top:2px}.code{font:800 44px ui-monospace,monospace;letter-spacing:.12em;text-align:center;background:#f7d33c;border-radius:12px;padding:12px}
table{width:100%;border-collapse:collapse;font-size:15px}td,th{text-align:left;padding:8px 6px;border-bottom:1px solid #eee}.muted{color:#8a958d}.err{color:#c63d2f;font-weight:600}
.stat{display:flex;gap:12px}.stat div{flex:1;background:#eef6f0;border-radius:12px;padding:12px;text-align:center}.stat b{display:block;font-size:28px}
</style></head><body><main>${body}</main></body></html>`

function send(res, status, html, headers = {}) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers })
  res.end(html)
}
async function readForm(req) {
  let raw = ''
  for await (const chunk of req) { raw += chunk; if (raw.length > 1e5) break }
  return Object.fromEntries(new URLSearchParams(raw))
}
function isOwner(req) {
  const pass = process.env.ADMIN_PASSWORD
  if (!pass || pass === 'change-me') return false
  const [, b64] = (req.headers.authorization || '').split(' ')
  const [, given] = Buffer.from(b64 || '', 'base64').toString().split(':')
  return given === pass
}

// ── guest side ──────────────────────────────────────────────────────────────────────────
function joinPage(error = '', values = {}) {
  return page(NAME, `<h1>🎉 ${esc(OFFER)}</h1><p>Leave your number and we'll send your code right now.</p>
  <form class="card" method="post" action="/join">
    ${error ? `<p class="err">${esc(error)}</p>` : ''}
    <label for="name">First name</label><input id="name" name="name" autocomplete="given-name" value="${esc(values.name)}" required>
    <label for="phone">Mobile number</label><input id="phone" name="phone" type="tel" autocomplete="tel" value="${esc(values.phone)}" required>
    <label class="check"><input type="checkbox" name="consent" value="yes" required><span>${esc(CONSENT)}</span></label>
    <button>Get my appetizer</button>
  </form>`)
}

async function join(req, res) {
  const f = await readForm(req)
  const phone = normalizePhone(f.phone)
  if (!phone) return send(res, 400, joinPage('That number doesn’t look right. Try again with the area code.', f))
  if (f.consent !== 'yes') return send(res, 400, joinPage('Please tick the box to get texts.', f))
  const { guest } = addGuest({ name: String(f.name || '').slice(0, 60), phone, consentText: CONSENT })
  await sendSms(phone, withOptOut(`Welcome to ${NAME}, ${guest.name}! Your code: ${guest.code}. Show it to your server for your ${OFFER.toLowerCase()}.`))
  send(res, 200, page(NAME, `<h1>You're in, ${esc(guest.name)}! 🙌</h1><div class="card"><p>Show this to your server:</p>
    <div class="code">${esc(guest.code)}</div><p class="fine">We also texted it to you. Reply STOP anytime to stop texts.</p></div>`))
}

// ── owner side ──────────────────────────────────────────────────────────────────────────
function adminPage({ draft = '', notice = '', offer = '', when = '' } = {}) {
  const guests = allGuests()
  const active = guests.filter((g) => !g.optedOut).length
  const rows = guests.slice(-50).reverse().map((g) => `<tr><td>${esc(g.name)}</td><td>${esc(g.phone)}</td><td class="muted">${esc(g.joinedAt.slice(0, 10))}</td><td>${g.optedOut ? 'stopped' : '✓'}</td></tr>`).join('')
  return page(`${NAME} · list`, `<h1>${esc(NAME)}</h1>
  <div class="stat"><div><b>${active}</b>on the list</div><div><b>${guests.length - active}</b>stopped</div></div>
  ${notice ? `<p class="card">${notice}</p>` : ''}
  ${smsConfigured() ? '' : '<p class="fine">Twilio isn’t set up yet, so texts are only logged (dry run).</p>'}
  <form class="card" method="post" action="/admin/draft">
    <h2>1. What's the offer?</h2>
    <label for="offer">Offer</label><input id="offer" name="offer" placeholder="2-for-1 burgers" value="${esc(offer)}" required>
    <label for="when">When</label><input id="when" name="when" placeholder="Tonight, 5 to 8 pm" value="${esc(when)}" required>
    <button>✳ Claude, write the text</button>
  </form>
  <form class="card" method="post" action="/admin/send">
    <h2>2. Check it and send</h2>
    <textarea name="body" required>${esc(draft)}</textarea>
    <p class="fine">Goes to ${active} people. "Reply STOP to opt out." is always added at the end.</p>
    <button class="alt">Send to the whole list</button>
  </form>
  <div class="card"><h2>Latest sign-ups</h2><table><tr><th>Name</th><th>Phone</th><th>Joined</th><th>Texts</th></tr>${rows || '<tr><td colspan="4" class="muted">Nobody yet. Put the QR cards on the tables!</td></tr>'}</table>
  <p><a href="/admin/export.csv">Download the list (CSV)</a></p></div>`)
}

async function admin(req, res, url) {
  if (!isOwner(req)) return send(res, 401, 'Owner login needed (set ADMIN_PASSWORD in .env).', { 'www-authenticate': 'Basic realm="owner"' })
  if (req.method === 'GET' && url.pathname === '/admin/export.csv') {
    const csv = ['name,phone,joined,opted_out', ...allGuests().map((g) => [g.name, g.phone, g.joinedAt, g.optedOut].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n')
    res.writeHead(200, { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="guests.csv"' })
    return res.end(csv)
  }
  if (req.method === 'POST' && url.pathname === '/admin/draft') {
    const f = await readForm(req)
    try {
      const draft = await writeText({ restaurant: NAME, offer: f.offer, when: f.when })
      return send(res, 200, adminPage({ draft, offer: f.offer, when: f.when }))
    } catch (e) {
      return send(res, 200, adminPage({ notice: `<span class="err">${esc(e.message)}</span>`, offer: f.offer, when: f.when }))
    }
  }
  if (req.method === 'POST' && url.pathname === '/admin/send') {
    const f = await readForm(req)
    if (insideQuietHours()) return send(res, 200, adminPage({ draft: f.body, notice: '<span class="err">It’s outside 9 am to 8 pm for your guests. Send it later.</span>' }))
    const { sent, failed } = await sendToAll(activeGuests(), withOptOut(String(f.body || '').slice(0, 300)))
    return send(res, 200, adminPage({ notice: `✓ Sent to ${sent} people${failed ? `, ${failed} failed` : ''}.` }))
  }
  return send(res, 200, adminPage())
}

// Twilio calls this when a guest replies. Twilio also blocks STOPped numbers on its side; we mirror it in the list.
async function inbound(req, res) {
  const f = await readForm(req)
  const phone = normalizePhone(f.From)
  const word = String(f.Body || '').trim().toUpperCase()
  if (phone && /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)$/.test(word)) setOptOut(phone, true)
  if (phone && /^(START|UNSTOP|YES)$/.test(word)) setOptOut(phone, false)
  res.writeHead(200, { 'content-type': 'text/xml' })
  res.end('<Response></Response>')
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x')
    if (url.pathname === '/' || (url.pathname === '/join' && req.method === 'GET')) return send(res, 200, joinPage())
    if (url.pathname === '/join' && req.method === 'POST') return join(req, res)
    if (url.pathname.startsWith('/admin')) return admin(req, res, url)
    if (url.pathname === '/sms' && req.method === 'POST') return inbound(req, res)
    send(res, 404, page('Not found', '<h1>Not found</h1>'))
  } catch (e) {
    console.error(e)
    send(res, 500, page('Error', '<h1>Something went wrong</h1>'))
  }
})
server.listen(PORT, () => console.log(`${NAME}: guests -> http://localhost:${PORT}/join   owner -> http://localhost:${PORT}/admin`))
