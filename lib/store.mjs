// The restaurant's customer list, kept in one JSON file (data/guests.json). Fine for a few thousand guests per
// restaurant; swap in a database if you run this for many restaurants from one server.
import fs from 'node:fs'
import path from 'node:path'

const FILE = path.resolve(process.env.DATA_FILE || 'data/guests.json')

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { return [] }
}
function save(list) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  const tmp = FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2))
  fs.renameSync(tmp, FILE)               // write-then-rename, so a crash never leaves half a file
}

// Turns "(555) 201-4477" or "555.201.4477" into "+15552014477". Returns null if it isn't a usable number.
export function normalizePhone(raw, countryCode = process.env.DEFAULT_COUNTRY_CODE || '1') {
  if (!raw) return null
  const trimmed = String(raw).trim()
  let digits = trimmed.replace(/\D/g, '')
  if (trimmed.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? '+' + digits : null
  if (digits.startsWith('00')) digits = digits.slice(2)
  else if (digits.length === 10 && countryCode === '1') digits = '1' + digits
  else if (!digits.startsWith(countryCode)) digits = countryCode + digits.replace(/^0/, '')
  return digits.length >= 8 && digits.length <= 15 ? '+' + digits : null
}

export function allGuests() { return load() }

export function activeGuests() { return load().filter((g) => !g.optedOut) }

// Adds a guest who agreed to get texts. Signing up again with the same number just turns texts back on.
export function addGuest({ name, phone, consentText }) {
  const list = load()
  const existing = list.find((g) => g.phone === phone)
  const now = new Date().toISOString()
  if (existing) {
    Object.assign(existing, { name: name || existing.name, optedOut: false, consentAt: now, consentText })
    save(list)
    return { guest: existing, isNew: false }
  }
  const guest = { name, phone, joinedAt: now, consentAt: now, consentText, optedOut: false, code: makeCode() }
  list.push(guest)
  save(list)
  return { guest, isNew: true }
}

export function setOptOut(phone, optedOut) {
  const list = load()
  const g = list.find((x) => x.phone === phone)
  if (!g) return false
  g.optedOut = optedOut
  g[optedOut ? 'optedOutAt' : 'optedInAt'] = new Date().toISOString()
  save(list)
  return true
}

function makeCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 5 }, () => abc[Math.floor(Math.random() * abc.length)]).join('')
}
