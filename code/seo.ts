import { useEffect } from 'react'
import { brand } from '@/data/company'
import { LOGO_PUBLIC_PATH } from '@/lib/structuredData'

/**
 * The image used when a page has none of its own.
 *
 * It is the official logo from `public/brand/`, not a photo: until now, sharing
 * a link on Facebook or WhatsApp produced an empty rectangle.
 *
 * `twitter:card` stays `summary` (square thumbnail) when the logo is used, and
 * only becomes `summary_large_image` for pages with their own image: a logo
 * stretched across 1200x630 would appear cropped or lost in the middle.
 */
const IMAGINE_IMPLICITA = LOGO_PUBLIC_PATH

export interface SeoConfig {
  title: string
  description: string
  /** Relative path, e.g. `/despre-noi`. */
  path: string
  /** Absolute URL or public path; `null` ⇒ no image tags are emitted. */
  image?: string | null
  type?: 'website' | 'article'
  /** `true` ⇒ the page is not indexed (e.g. the internal `/cereri` panel). */
  noindex?: boolean
}

type MetaSelector = { attr: 'name' | 'property'; key: string }

function upsertMeta({ attr, key }: MetaSelector, content: string): void {
  const selector = `meta[${attr}="${key}"]`
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Applies title, meta description, canonical, Open Graph and Twitter Card.
 *
 * Implemented without external dependencies. When the site moves to SSR or to a
 * framework with its own <head>, the same values can move into the page loader
 * without changing `aboutPageData.seo`.
 */
export function useSeo({
  title,
  description,
  path,
  image = null,
  type = 'website',
  noindex = false,
}: SeoConfig): void {
  useEffect(() => {
    const canonical = new URL(path, brand.siteUrl).toString()

    document.title = title
    upsertMeta({ attr: 'name', key: 'description' }, description)
    // Set on every page, so SPA navigation never leaves a stale value behind.
    upsertMeta(
      { attr: 'name', key: 'robots' },
      noindex ? 'noindex, nofollow' : 'index, follow',
    )
    upsertLink('canonical', canonical)

    upsertMeta({ attr: 'property', key: 'og:site_name' }, brand.legalDisplayName)
    upsertMeta({ attr: 'property', key: 'og:locale' }, 'ro_RO')
    upsertMeta({ attr: 'property', key: 'og:type' }, type)
    upsertMeta({ attr: 'property', key: 'og:title' }, title)
    upsertMeta({ attr: 'property', key: 'og:description' }, description)
    upsertMeta({ attr: 'property', key: 'og:url' }, canonical)

    upsertMeta(
      { attr: 'name', key: 'twitter:card' },
      image ? 'summary_large_image' : 'summary',
    )
    upsertMeta({ attr: 'name', key: 'twitter:title' }, title)
    upsertMeta({ attr: 'name', key: 'twitter:description' }, description)

    // The page's own image if it has one; otherwise the logo.
    const absolute = new URL(image ?? IMAGINE_IMPLICITA, brand.siteUrl).toString()
    upsertMeta({ attr: 'property', key: 'og:image' }, absolute)
    upsertMeta({ attr: 'property', key: 'og:image:alt' }, brand.legalDisplayName)
    upsertMeta({ attr: 'name', key: 'twitter:image' }, absolute)
  }, [title, description, path, image, type, noindex])
}

/** Injects a JSON-LD block and cleans it up on unmount. */
export function useStructuredData(id: string, data: unknown): void {
  useEffect(() => {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.id = id
    script.textContent = JSON.stringify(data)
    document.head.appendChild(script)

    return () => {
      script.remove()
    }
  }, [id, data])
}
