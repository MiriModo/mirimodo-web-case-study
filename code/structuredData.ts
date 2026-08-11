import {
  brand,
  companyInfo,
  contactDetails,
  socialLinks,
  routes,
} from '@/data/company'
import { legalIdentity } from '@/data/legal'

/**
 * The official logo, the web-optimised version from `public/brand/`.
 * The same one `BrandLogo` renders in the header. Google requires `logo` for
 * Organization rich results.
 */
export const LOGO_PUBLIC_PATH = '/brand/mirimodo-logo-web.png'

/** E.164 phone format: `0769 611 826` → `+40769611826`. */
function toE164(display: string): string {
  return `+40${display.replace(/\D/g, '').replace(/^0/, '')}`
}

/**
 * Schema.org structured data.
 *
 * Only confirmed information is emitted. `aggregateRating`, `review`, `geo`,
 * `priceRange` and legal identifiers are left out until they are supplied:
 * false structured data can attract penalties and misleads users.
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
  if (socialLinks.length > 0) schema.sameAs = socialLinks.map((l) => l.url)

  return schema
}

/**
 * The site as an entity, tied to the organisation through `publisher`.
 *
 * No `potentialAction` / `SearchAction`: the site has no internal search with
 * its own address, and declaring one that does not exist would be a false
 * claim.
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
 * Breadcrumb: Home › <page>.
 * Defaults to "Despre noi", for compatibility with existing call sites.
 */
export function buildBreadcrumbSchema(
  name = 'Despre noi',
  path: string = routes.about,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Acasă',
        item: new URL(routes.home, brand.siteUrl).toString(),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name,
        item: new URL(path, brand.siteUrl).toString(),
      },
    ],
  }
}
