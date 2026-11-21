// Makes table-tent.html: a printable card with the QR code that opens your /join page.
// Print it, fold it, put one on every table.   npm run qr
import fs from 'node:fs'
import QRCode from 'qrcode'

try {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch {}

const url = (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '') + '/join'
const name = process.env.RESTAURANT_NAME || 'Our restaurant'
const offer = process.env.OFFER || 'Free appetizer tonight'
const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const card = `<div class="card"><div class="top">${esc(name)}</div><h1>${esc(offer)}</h1>${svg}<p>Scan with your camera 📱</p></div>`
fs.writeFileSync('table-tent.html', `<!doctype html><meta charset="utf-8"><title>Table card</title><style>
@page{size:A4 landscape;margin:12mm}body{margin:0;font-family:system-ui,sans-serif;display:flex;gap:10mm}
.card{flex:1;border:2px dashed #bbb;border-radius:8mm;padding:10mm;text-align:center;height:170mm;display:flex;flex-direction:column;justify-content:center}
.top{font-weight:700;color:#1a8a4f;letter-spacing:.08em;text-transform:uppercase}h1{font-size:30pt;line-height:1.05;margin:4mm 0}
svg{width:75mm;height:75mm;margin:0 auto}p{font-size:14pt;font-weight:600}
</style>${card}${card}`)
console.log('wrote table-tent.html for', url, '(open it in a browser and print; two cards per page)')
