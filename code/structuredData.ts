import {
  brand,
  companyInfo,
  contactDetails,
  mapLinks,
  socialLinks,
  routes,
} from '@/data/company'
import { legalIdentity } from '@/data/legal'

/**
 * The official logo, the web optimised version from `public/brand/`.
 * Same one `BrandLogo` shows in the header. Google wants `logo` for
 * Organization rich results.
 */
export const LOGO_PUBLIC_PATH = '/brand/mirimodo-logo-web.png'

/** E.164 phone format: `0769 611 826` becomes `+40769611826`. */
function toE164(display: string): string {
  return `+40${display.replace(/\D/g, '').replace(/^0/, '')}`
}

/**
 * Schema.org structured data.
 *
 * Only confirmed information goes out. No `aggregateRating`, `review`, `geo`,
 * `priceRange` or legal identifiers until they are actually provided, because
 * fake structured data can get penalised and misleads users.
 */
export function buildTravelAgencySchema(): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': ['TravelAgency', 'LocalBusiness', 'Organization'],
    '@id': `${brand.siteUrl}/#organization`,
    name: brand.legalDisplayName,
    alternateName: brand.name,
    slogan: brand.slogan,
    url: brand.siteUrl,
    logo: {
      '@type': 'ImageObject',
      url: new URL(LOGO_PUBLIC_PATH, brand.siteUrl).toString(),
    },
    image: new URL(LOGO_PUBLIC_PATH, brand.siteUrl).toString(),
    foundingDate: String(brand.foundedYear),
    founder: [
      { '@type': 'Person', name: 'Marinela Modoran' },
      { '@type': 'Person', name: 'Bogdan Modoran' },
    ],
    telephone: toE164(contactDetails.phoneDisplay),
    email: contactDetails.emailDisplay,
    // The agency's public address (not the registered office).
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Strada Victoriei, bl. 37, sc. 2, ap. 1, parter',
      postalCode: contactDetails.postalCode,
      addressLocality: contactDetails.city,
      addressRegion: contactDetails.county,
      addressCountry: 'RO',
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: contactDetails.openingHoursSpec.days,
        opens: contactDetails.openingHoursSpec.opens,
        closes: contactDetails.openingHoursSpec.closes,
      },
    ],
    areaServed: [
      { '@type': 'AdministrativeArea', name: 'Gorj' },
      { '@type': 'AdministrativeArea', name: 'Oltenia' },
      { '@type': 'Country', name: 'România' },
    ],
    // All three contact numbers.
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        telephone: toE164(contactDetails.phoneDisplay),
        email: contactDetails.emailDisplay,
        availableLanguage: ['ro'],
      },
      {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        telephone: toE164(contactDetails.secondaryPhoneDisplay),
        availableLanguage: ['ro'],
      },
      {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        telephone: toE164(contactDetails.landlineDisplay),
        availableLanguage: ['ro'],
      },
    ],
  }

  // Confirmed legal data.
  schema.legalName = companyInfo.legalName
  schema.vatID = `RO${companyInfo.cui}`
  schema.taxID = companyInfo.cui
  if (legalIdentity.licenseNumber) {
    schema.hasCredential = {
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'Licență de turism',
      identifier: legalIdentity.licenseNumber,
    }
  }
  schema.hasMap = mapLinks.businessProfileUrl
  schema.sameAs = [...socialLinks.map((l) => l.url), mapLinks.businessProfileUrl]

  return schema
}

/**
 * The site as an entity, linked to the organization through `publisher`.
 *
 * No `potentialAction` / `SearchAction`: the site has no internal search with
 * its own URL, and declaring one that doesn't exist would be a false claim.
 */
export function buildWebSiteSchema(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${brand.siteUrl}/#website`,
    url: brand.siteUrl,
    name: brand.legalDisplayName,
    alternateName: brand.name,
    inLanguage: 'ro-RO',
    publisher: { '@id': `${brand.siteUrl}/#organization` },
  }
}

/**
 * Breadcrumb with any number of levels, always starting from "Acasa".
 * The blog uses it with three or four levels: Acasa, Blog, Category, Article.
 */
export function buildBreadcrumbTrailSchema(
  items: { name: string; path: string }[],
): Record<string, unknown> {
  const trail = [{ name: 'Acasă', path: routes.home }, ...items]
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: new URL(item.path, brand.siteUrl).toString(),
    })),
  }
}

/**
 * Breadcrumb: Acasa, then <page>.
 * Defaults to "Despre noi", so the older calls keep working.
 */
export function buildBreadcrumbSchema(
  name = 'Despre noi',
  path: string = routes.about,
): Record<string, unknown> {
  return buildBreadcrumbTrailSchema([{ name, path }])
}

export interface BlogPostingInput {
  title: string
  description: string
  path: string
  publishDate: Date
  modifiedDate: Date
  /** Absolute URL of the cover. */
  imageUrl: string
  authorName: string
  keywords: string[]
  wordCount?: number
}

/**
 * Blog article (`BlogPosting`), with the author as a `Person` linked to the
 * "Despre noi" page and the organization as `publisher`, the way Google asks
 * for Article results. The dates include the timezone.
 */
export function buildBlogPostingSchema(input: BlogPostingInput): Record<string, unknown> {
  const url = new URL(input.path, brand.siteUrl).toString()
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    headline: input.title,
    description: input.description,
    image: [input.imageUrl],
    datePublished: input.publishDate.toISOString(),
    dateModified: input.modifiedDate.toISOString(),
    inLanguage: 'ro-RO',
    isAccessibleForFree: true,
    author: {
      '@type': 'Person',
      name: input.authorName,
      url: new URL(routes.about, brand.siteUrl).toString(),
      worksFor: { '@id': `${brand.siteUrl}/#organization` },
    },
    publisher: { '@id': `${brand.siteUrl}/#organization` },
    ...(input.keywords.length > 0 ? { keywords: input.keywords.join(', ') } : {}),
    ...(input.wordCount ? { wordCount: input.wordCount } : {}),
  }
}
