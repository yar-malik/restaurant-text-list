import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-')), 'guests.json')
const { normalizePhone, addGuest, activeGuests, setOptOut } = await import('../lib/store.mjs')
const { withOptOut } = await import('../lib/claude.mjs')
const { insideQuietHours } = await import('../lib/sms.mjs')

test('phone numbers become +E.164', () => {
  assert.equal(normalizePhone('(555) 201-4477'), '+15552014477')
  assert.equal(normalizePhone('+44 7700 900123'), '+447700900123')
  assert.equal(normalizePhone('0049 151 23456789'), '+4915123456789')
  assert.equal(normalizePhone('12'), null)
})

test('every text ends with one opt-out line', () => {
  assert.equal(withOptOut('2-for-1 burgers tonight!'), '2-for-1 burgers tonight! Reply STOP to opt out.')
  assert.equal(withOptOut('Hi! Reply STOP to unsubscribe.'), 'Hi! Reply STOP to opt out.')
})

test('the list: join, stop, join again', () => {
  const { guest } = addGuest({ name: 'Sam', phone: '+15552014477', consentText: 'x' })
  assert.match(guest.code, /^[A-Z2-9]{5}$/)
  assert.equal(activeGuests().length, 1)
  setOptOut('+15552014477', true)
  assert.equal(activeGuests().length, 0)
  addGuest({ name: 'Sam', phone: '+15552014477', consentText: 'x' })
  assert.equal(activeGuests().length, 1)
})

test('no texts late at night', () => {
  assert.equal(insideQuietHours(new Date('2026-11-23T03:00:00Z'), 'America/New_York'), true)   // 10 pm
  assert.equal(insideQuietHours(new Date('2026-11-23T17:00:00Z'), 'America/New_York'), false)  // noon
})
