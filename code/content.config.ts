import { defineCollection } from 'astro:content'
import { z } from 'astro/zod'
import { blogCategorySlugs } from './data/blog'
import { descriptionFrom } from './lib/articleText'

/**
 * The blog collection, read from Supabase at build time.
 *
 * Articles are written and scheduled from the internal panel (`/cereri`, the
 * "Calendar editorial" tab) and saved in the `articole` table. Here I only take
 * the ones with `stare` realizat or publicat and whose `data_publicare` has
 * arrived (Romanian time). The RLS policy for `anon` allows exactly these rows,
 * so the public key is enough. Without the Supabase variables the blog is built
 * empty and the build does not fail.
 *
 * The text (Markdown) goes through the Astro processor, same as a `.md` file:
 * headings get ids and the table of contents reads them from `headings`.
 */

interface ArticleRow {
  slug: string
  data_publicare: string
  actualizat_la: string
  nume: string
  categorie: string
  cuvinte_cheie: string | null
  cta_servicii: boolean
  coperta_url: string | null
  continut: string
}

/** `YYYY-MM-DD` in Romanian time. */
function bucharestToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date())
}

/** 07:00 on the publishing day, Romanian time, with the right UTC offset. */
function publishMoment(day: string): Date {
  const probe = new Date(`${day}T07:00:00Z`)
  const offset = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Bucharest',
    timeZoneName: 'longOffset',
  })
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')?.value // "GMT+02:00"
  const iso = offset?.replace('GMT', '') || '+02:00'
  return new Date(`${day}T07:00:00${iso}`)
}

const blog = defineCollection({
  loader: {
    name: 'articole-supabase',
    load: async ({ store, parseData, renderMarkdown, generateDigest, logger }) => {
      const url = import.meta.env.VITE_SUPABASE_URL
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY
      store.clear()
      if (!url || !key) {
        logger.warn('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY lipsesc: blogul se construieste fara articole.')
        return
      }

      const today = bucharestToday()
      const query = new URLSearchParams({
        select: 'slug,data_publicare,actualizat_la,nume,categorie,cuvinte_cheie,cta_servicii,coperta_url,continut',
        stare: 'in.(realizat,publicat)',
        data_publicare: `lte.${today}`,
        order: 'data_publicare.desc',
      })
      const res = await fetch(`${url}/rest/v1/articole?${query}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      })
      // The table does not exist yet (404): the blog is built empty but the
      // build goes on, so the site can be published before the blog is set up.
      // Any other error stops the build. Otherwise a Supabase outage would
      // publish a site with no articles and the FTP mirror would delete them
      // from the server.
      if (res.status === 404) {
        logger.warn('Tabelul "articole" nu exista inca in Supabase: blogul se construieste fara articole.')
        return
      }
      if (!res.ok) {
        throw new Error(`Nu am putut citi articolele din Supabase (${res.status}): ${await res.text()}`)
      }
      const rows = (await res.json()) as ArticleRow[]

      const buildTime = new Date()
      for (const row of rows) {
        if (!row.coperta_url || !row.continut?.trim()) {
          logger.warn(`Articolul "${row.slug}" nu are coperta sau text si a fost sarit.`)
          continue
        }
        // The day has come, so the article goes on the site now. If someone
        // pressed "Publica acum" before 07:00, the publish time would be in the
        // future and `isPublished` would hide it until the next build.
        const scheduled = publishMoment(row.data_publicare)
        const publishDate = scheduled.getTime() > buildTime.getTime() ? buildTime : scheduled
        const updated = new Date(row.actualizat_la)
        const data = await parseData({
          id: row.slug,
          data: {
            title: row.nume,
            description: descriptionFrom(row.continut, row.nume),
            publishDate,
            updatedDate: updated.getTime() > publishDate.getTime() ? updated : undefined,
            category: row.categorie,
            tags: (row.cuvinte_cheie ?? '')
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
            cover: row.coperta_url,
            coverAlt: row.nume,
            author: 'echipa',
            cta: row.cta_servicii
              ? { href: '/servicii', label: 'Vezi ce rezervăm' }
              : { href: '/vacante', label: 'Cere o ofertă' },
          },
        })
        store.set({
          id: row.slug,
          data,
          body: row.continut,
          rendered: await renderMarkdown(row.continut),
          digest: generateDigest(JSON.stringify(row)),
        })
      }
      logger.info(`${store.keys().length} articole publicate.`)
    },
  },
  schema: z.object({
    title: z.string().min(3).max(160),
    description: z.string().min(1).max(160),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.enum(blogCategorySlugs),
    tags: z.array(z.string()).default([]),
    /** Public URL of the cover image (Supabase Storage). */
    cover: z.string().regex(/^https:\/\/\S+$/),
    coverAlt: z.string().min(3),
    author: z.enum(['echipa', 'marinela', 'diana']).default('echipa'),
    cta: z.object({
      href: z.string().startsWith('/'),
      label: z.string().min(3).max(40),
      text: z.string().max(200).optional(),
    }),
  }),
})

export const collections = { blog }
