# Restaurant Text List

**Sell this to restaurants for $1,000 a month.** A QR code on every table builds the restaurant its own customer
list, and on a slow night Claude writes one text that brings people back.

Here's the whole idea as a story:

1. **Sam** sits down at a restaurant. On his table there's a card: *"Free appetizer. Just scan this."*
2. He scans it, types his name and number, ticks the box, and gets a code for free wings. Sam's happy.
3. But now the restaurant has Sam's number. And it's theirs. No app owns it.
4. Next Monday, when the place is dead, the owner opens this app, types *"2-for-1 burgers, tonight 5–8 pm"*, and
   Claude writes the text. One click, and it goes to everyone on the list.
5. Sam comes back with two friends.

Ten tables of three at about $40 each is roughly **$1,200 on a night that was empty**. Two slow nights a week and
that's **over $10,000 a month in extra sales**. You charge $1,000 a month. That's why it's an easy yes.

> The maths is an example, not a promise. Average check ≈ $42 a guest (Maple, 1.2M restaurant calls). How many people
> come back depends on the restaurant and the offer. Sell the list and the texts; let the numbers show up.

The plan for finding restaurants, the pitch, pricing and your first client is in **[MARKETING.md](MARKETING.md)**.

---

## What's inside

| Page | Who uses it | What it does |
|---|---|---|
| `/join` | Guests (the QR code opens it) | Name, mobile number and a consent box, then a free-appetizer code on screen and by text |
| `/admin` | The owner (password) | How many people are on the list, **Claude writes the text**, send it to everyone, download the list as CSV |
| `/sms` | Twilio | When someone replies STOP, they're taken off the list (START puts them back) |
| `npm run qr` | You | A printable table card with the QR code, two per page |

It's one small Node server with no database to set up. The list lives in `data/guests.json`.

## Set it up (about 15 minutes)

You need [Node.js 20+](https://nodejs.org), a [Claude API key](https://console.anthropic.com) and a
[Twilio](https://www.twilio.com) number for the texts.

```bash
git clone https://github.com/yar-malik/restaurant-text-list.git
cd restaurant-text-list
npm install
cp .env.example .env      # then fill in the restaurant name, offer, keys and an owner password
npm start
```

- Guest page: http://localhost:3000/join
- Owner page: http://localhost:3000/admin (any username, the `ADMIN_PASSWORD` from `.env`)

Without Twilio keys it runs in **dry-run mode**: every text is printed in the terminal instead of sent. That's a good
way to show the owner a demo first.

### Put it online

Any host that runs Node works (Render, Railway, Fly.io, a small VPS). Set the same values from `.env` as
environment variables, keep `data/` on a persistent disk, then:

1. Set `PUBLIC_URL` to your app's address and run `npm run qr`. Print `table-tent.html`.
2. In Twilio, under your number's **Messaging** settings, set "A message comes in" to `https://YOUR-APP/sms` (POST).
3. Put a card on every table.

### Claude

The text is written by `claude-opus-5-5` in [`lib/claude.mjs`](lib/claude.mjs). It uses the server-side fallback
setting, so if a request is ever declined, the API retries it on a fallback model in the same call. Each text costs a
fraction of a cent. Every message ends with "Reply STOP to opt out." no matter what.

## The rules (please don't skip)

This is text marketing, and in the US it's covered by the **TCPA** (other countries have their own rules, like GDPR
in Europe).

- **Consent first.** Only text people who ticked the box. The sign-up page already says what they agree to, how
  often, that rates may apply and that they can reply STOP. Don't remove that.
- **Never buy or scrape numbers.** Only people who signed up at the table.
- **Every text has the opt-out line.** The app adds it for you.
- **No texts late at night.** The app won't send outside 9 am to 8 pm in the restaurant's time zone.
- In the US, business texting from a normal number needs **A2P 10DLC registration** in Twilio. Do it before the first
  real send; it takes a few days.

This isn't legal advice. If the restaurant has a lawyer, show them the sign-up page.

## Tests

```bash
npm test
```

---

Made by [Yar Malik](https://github.com/yar-malik) for the "Meet Sam" video. Free to use, MIT license.
