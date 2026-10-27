/**
 * EXCERPT from `src/components/admin/ArticlesCalendar.tsx` (886 lines in the
 * real file). Kept here: the cover resize, the call that starts a deploy, the
 * message shown after saving and the part of `submit` where the article state
 * is worked out. The calendar grid, the form markup and the preview are left
 * out. Lines marked `// ...` are elided.
 */
import type { FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import {
  ARTICLES_TABLE,
  COVERS_BUCKET,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from '@/lib/supabaseConfig'
import { slugify, type ArticleDraft, type ArticleRow, type ArticleStatus } from '@/types/articles'

/** Mondays and Thursdays: the posting days from the editorial plan. */
function isPostingDay(d: Date): boolean {
  const wd = d.getDay()
  return wd === 1 || wd === 4
}

/** An article with at least some text. Below this it's a note, not an article. */
const MIN_CONTENT_CHARS = 200
const COVER_MAX_WIDTH = 1600

/**
 * The cover is shrunk in the browser (max 1600 px wide, JPEG) before upload,
 * so 5-8 MB phone photos don't land in Storage as they are.
 */
async function shrinkCover(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, COVER_MAX_WIDTH / bitmap.width)
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob'))), 'image/jpeg', 0.84)
  })
}

/** Starts a rebuild of the site (Supabase function `publica`, then GitHub Actions). */
async function triggerPublish(): Promise<boolean> {
  if (!supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return false
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/publica`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    })
    return res.ok
  } catch {
    return false
  }
}

// ... inside ArticlesCalendar() ...

  /** What happens after saving, explained so the person who pressed the button gets it. */
  const afterSave = async (row: ArticleRow) => {
    const when = longFormatter.format(fromIso(row.data_publicare))
    if (row.stare === 'zero') {
      setNotice(
        `„${row.nume}” este salvat în plan (Zero). Devine Realizat și apare pe site după ce are text și copertă.`,
      )
      return
    }
    if (row.data_publicare <= todayIso) {
      const ok = await triggerPublish()
      setNotice(
        ok
          ? `„${row.nume}” se publică acum: site-ul se reconstruiește, apare în 3–4 minute la /blog.`
          : `„${row.nume}” este salvat, dar reconstrucția site-ului nu a pornit. Pornește-o din GitHub, Actions, „Run workflow”, sau așteaptă build-ul de mâine dimineață.`,
      )
      return
    }
    setNotice(`„${row.nume}” este programat pentru ${when}: apare pe site în dimineața aceea.`)
  }

// ... inside the article form ...

  /**
   * Saving the article. `now` means "Publica acum": the date becomes today, so
   * the old schedule is dropped and the article moves in the calendar to the
   * day it was published.
   *
   * The state is not picked by hand, it is worked out: Zero while the text or
   * the cover is missing, Realizat once it has both. Publicat is set by the
   * deploy workflow after the article is live. A Publicat article stays that
   * way when edited, as long as its day is not moved into the future.
   */
  const submit = async (event: FormEvent | null, now = false) => {
    event?.preventDefault()
    const todayIso = toIso(new Date())
    const data_publicare = now ? todayIso : draft.data_publicare
    const nume = draft.nume.trim()
    const continut = draft.continut.trim()
    const slug = slugify(draft.slug) || makeSlug(nume)
    const hasText = continut.length >= MIN_CONTENT_CHARS
    const hasCover = Boolean(coverFile || draft.coperta_url)
    // An article that is already written can't fall back to Zero by mistake,
    // and "Publica acum" needs a complete article.
    const mustBeComplete = now || initial.stare !== 'zero'
    const next: typeof errors = {}
    if (nume.length < 3) next.nume = 'Scrie numele articolului.'
    if (slug.length < 3) next.slug = 'Adresa are nevoie de cel puțin 3 caractere.'
    else if (isSlugTaken(slug)) next.slug = 'Adresa e deja folosită de alt articol. Alege alta.'
    if (mustBeComplete) {
      if (!hasText) {
        next.continut = `Articolul are nevoie de text: cel puțin ${MIN_CONTENT_CHARS} de caractere.`
      }
      if (!hasCover) next.coperta = 'Alege o fotografie de copertă.'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return

    const stare: ArticleStatus = !(hasText && hasCover)
      ? 'zero'
      : initial.stare === 'publicat' && data_publicare <= todayIso
        ? 'publicat'
        : 'realizat'

    let coperta_url = draft.coperta_url
    if (coverFile && supabase) {
      setBusy('coperta')
      try {
        const blob = await shrinkCover(coverFile)
        const path = `${slug}-${Date.now()}.jpg`
        const { error } = await supabase.storage
          .from(COVERS_BUCKET)
          .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
        if (error) throw error
        coperta_url = supabase.storage.from(COVERS_BUCKET).getPublicUrl(path).data.publicUrl
      } catch {
        setErrors({ coperta: 'Nu am putut urca fotografia. Încearcă un JPG sau PNG mai mic.' })
        setBusy(false)
        return
      }
    }
    // ... save the row, then afterSave(row) ...
  }
