// EXCERPT from `supabase/functions/contact/index.ts` (238 lines in the real
// file). Kept here: the limits, the row counter and the start of the request
// handler, up to the insert. The email templates and the SMTP sending are left
// out. Lines marked `// ...` are elided.
//
// The contact form on mirimodo.ro/contact.
//
// Receives { nume, email, mesaj }, saves the message in `public.mesaje` and
// sends two emails from the agency address through the hosting's SMTP server:
// a confirmation to the visitor and a notification to the agency.
//
// Runs on Supabase Edge Functions (Deno). Deployed without JWT verification:
// the public `sb_publishable_...` key is not a JWT. The protection comes from
// validation, the honeypot field and the limits below.
//
// Secrets it needs (Dashboard > Edge Functions > Secrets):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set automatically by Supabase.

const LIMITS = { nameMin: 2, nameMax: 100, emailMax: 254, messageMin: 10, messageMax: 3000 }
const PER_EMAIL_PER_HOUR = 3
const GLOBAL_PER_10_MIN = 30
// A human doesn't fill in three fields in under 3 seconds.
const MIN_FILL_MS = 3000

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Removes control characters (keeps the line breaks in the message). */
function clean(value: unknown, keepNewlines = false): string {
  if (typeof value !== 'string') return ''
  const pattern = keepNewlines ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g
  return value.replace(pattern, '').trim()
}

const DB_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

async function db(path: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(`${DB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

/** How many messages match the filter, read from the Content-Range header. */
async function countMessages(filter: string): Promise<number> {
  const res = await db(`mesaje?select=id&${filter}`, {
    method: 'HEAD',
    headers: { Prefer: 'count=exact' },
  })
  const range = res.headers.get('content-range') ?? '*/0'
  return Number.parseInt(range.split('/')[1] ?? '0', 10) || 0
}

// ... corsHeaders, json, escapeHtml, the SMTP transport and the email templates ...

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405, origin)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid' }, 400, origin)
  }

  // The honeypot field and instant filling: we answer "ok" so the bot doesn't
  // find out it was stopped, but nothing is saved or sent.
  const elapsed = Number(body.elapsedMs)
  if (clean(body.website) !== '' || (Number.isFinite(elapsed) && elapsed < MIN_FILL_MS)) {
    return json({ ok: true }, 200, origin)
  }

  const nume = clean(body.nume)
  const email = clean(body.email).toLowerCase()
  const mesaj = clean(body.mesaj, true)

  if (
    nume.length < LIMITS.nameMin || nume.length > LIMITS.nameMax ||
    email.length > LIMITS.emailMax || !EMAIL_RE.test(email) ||
    mesaj.length < LIMITS.messageMin || mesaj.length > LIMITS.messageMax
  ) {
    return json({ ok: false, error: 'invalid' }, 400, origin)
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const [sameEmail, recent] = await Promise.all([
    countMessages(`email=eq.${encodeURIComponent(email)}&creat_la=gte.${hourAgo}`),
    countMessages(`creat_la=gte.${tenMinAgo}`),
  ])
  if (sameEmail >= PER_EMAIL_PER_HOUR || recent >= GLOBAL_PER_10_MIN) {
    return json({ ok: false, error: 'rate' }, 429, origin)
  }

  const insert = await db('mesaje', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ nume, email, mesaj }),
  })
  if (!insert.ok) {
    console.error('insert failed', insert.status, await insert.text())
    return json({ ok: false, error: 'server' }, 500, origin)
  }

  // ... confirmation and notification emails. The message is already saved,
  // so a problem with the email doesn't lose it, it only gets logged ...
})
