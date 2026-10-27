// Starts a rebuild and redeploy of the site when the internal panel asks for it.
//
// The panel calls it after an article dated today (or in the past) was saved
// or deleted, so nobody has to wait for the next morning's build. The function
// checks the staff session, then sends GitHub a `repository_dispatch` event of
// type `publica-blog`, which the `deploy-production.yml` workflow listens to.
//
// Runs on Supabase Edge Functions (Deno). It can be deployed without JWT
// verification because it checks the session by itself, via /auth/v1/user.
//
// Secrets it needs (Dashboard > Edge Functions > Secrets):
//   GITHUB_REPO   owner/repo of the private site repository
//   GITHUB_TOKEN  GitHub token with write access to `Contents` on that repo
// SUPABASE_URL and SUPABASE_ANON_KEY are set automatically by Supabase.

const ALLOWED_ORIGINS = new Set([
  'https://mirimodo.ro',
  'http://localhost:4321',
  'http://localhost:4329',
])

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://mirimodo.ro'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

/** Email of the logged in staff member, or `null`. */
async function userEmail(token: string): Promise<string | null> {
  if (!token) return null
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const user = (await res.json()) as { email?: string }
  return user.email ?? null
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method' }, 405, origin)
  }

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const email = await userEmail(token)
  if (!email) return json({ error: 'neautentificat' }, 401, origin)

  const repo = Deno.env.get('GITHUB_REPO')
  const ghToken = Deno.env.get('GITHUB_TOKEN')
  if (!repo || !ghToken) return json({ error: 'neconfigurat' }, 500, origin)

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'mirimodo-publica',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event_type: 'publica-blog',
      client_payload: { de: email, la: new Date().toISOString() },
    }),
  })

  if (res.status !== 204) {
    console.error('GitHub dispatch a esuat:', res.status, await res.text())
    return json({ error: 'github', status: res.status }, 502, origin)
  }
  return json({ ok: true }, 200, origin)
})
