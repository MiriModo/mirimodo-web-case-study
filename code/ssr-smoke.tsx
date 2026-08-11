/**
 * Smoke test: renders the pages outside the browser to catch runtime errors and
 * to check how content is distributed across pages after a reorganisation. Not
 * part of the production bundle.
 *
 *   npx vite build --ssr scripts/ssr-smoke.tsx --outDir dist-ssr
 *   node dist-ssr/ssr-smoke.js
 *
 * ---------------------------------------------------------------------------
 * EXCERPT. The real file carries 111 assertions. The harness below is complete
 * and unmodified; the assertion list keeps a representative selection, verbatim,
 * with the rest elided at the marked point. Nothing else was changed.
 * ---------------------------------------------------------------------------
 */
import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Layout } from '../src/components/layout/Layout'
import { galleryCountries, touristPhotos } from '../src/data/gallery'
import { isSupabaseReady } from '../src/lib/supabaseConfig'
import { offers } from '../src/data/offers'
import { HomePage } from '../src/pages/HomePage'
import { AboutPage } from '../src/pages/AboutPage'
import { GalleryPage } from '../src/pages/GalleryPage'
import { ContactPage } from '../src/pages/ContactPage'
import { LegalPage } from '../src/pages/LegalPage'
import { VacantePage } from '../src/pages/VacantePage'
import { ServiciiPage } from '../src/pages/ServiciiPage'
import { serviceHubSections } from '../src/data/servicesHub'
import { ghidSocial } from '../src/data/socialGhid'
import { RequestsAdminPage } from '../src/pages/RequestsAdminPage'
import { TermsPage } from '../src/pages/TermsPage'
import { PrivacyPage } from '../src/pages/PrivacyPage'
import { CookiePolicyPage } from '../src/pages/CookiePolicyPage'
import { ConsentProvider } from '../src/lib/consent'

/** Renders a page with the global layout (header + footer + floating button). */
function render(path: string, element: ReactElement): string {
  return renderToString(
    <ConsentProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path={path} element={element} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ConsentProvider>,
  )
}

const home = render('/', <HomePage />)
const about = render('/despre-noi', <AboutPage />)
const gallery = render('/galerie', <GalleryPage />)
const contact = render('/contact', <ContactPage />)
const legal = render('/date-legale', <LegalPage />)
const vacante = render('/vacante', <VacantePage />)
const servicii = render('/servicii', <ServiciiPage />)
// The panel renders without Supabase configured (test) → the "unconfigured" state.
const requests = render('/cereri', <RequestsAdminPage />)
const terms = render('/termeni-si-conditii', <TermsPage />)
const privacy = render('/politica-de-confidentialitate', <PrivacyPage />)
const cookies = render('/politica-de-cookies', <CookiePolicyPage />)

const countH1 = (html: string) => (html.match(/<h1/g) ?? []).length

const checks: [string, boolean][] = [
  // --- Document structure ---
  ['acasă: un singur h1', countH1(home) === 1],
  ['despre: un singur h1', countH1(about) === 1],
  ['galerie: un singur h1', countH1(gallery) === 1],
  ['vacanțe: un singur h1', countH1(vacante) === 1],
  [
    'seo: nicio pagină publică fără h1',
    [home, about, gallery, contact, legal, vacante, servicii, terms, privacy, cookies].every(
      (html) => countH1(html) === 1,
    ),
  ],

  // --- Consent gate on tourists' photos ---
  [
    'galerie: toate fotografiile au acord confirmat',
    touristPhotos.every((foto) => foto.consentConfirmed === true),
  ],
  // The site only serves the derivatives in public/gallery/. A link to the
  // source folder would mean someone wired the page to the large originals.
  ['galerie: fără trimiteri la materiale/galerie', !gallery.includes('materiale/galerie')],
  [
    'galerie: feed coerent cu datele generate',
    touristPhotos.length > 0
      ? gallery.includes('/gallery/') &&
        galleryCountries.every((tara) => gallery.includes(`>${tara.label}<`))
      : gallery.includes('Primele fotografii sunt pe drum'),
  ],

  // --- GDPR: nothing external loads before consent ---
  ['contact: harta blocată fără acord', contact.includes('este necesară activarea conținutului extern') && !contact.includes('output=embed')],
  ['cookies: fără analytics/marketing inventat', !/google analytics|meta pixel|tiktok pixel|hotjar|clarity/i.test(cookies)],
  // No national ID number may ever appear on the legal page.
  ['legale: fără CNP', !/\b\d{13}\b/.test(legal)],

  // --- The internal panel leaks nothing to a logged-out visitor ---
  ['cereri: fără rânduri de cerere', !requests.includes('>Stare:<')],
  [
    'ghid: nu ajunge la vizitatorii nelogați',
    !requests.includes('Ghid social media') &&
      ghidSocial.sectiuni.every((sectiune) => !requests.includes(sectiune.titlu)),
  ],
  [
    'vacanțe: wizard sau stare elegantă',
    isSupabaseReady
      ? vacante.includes('Unde ai vrea să mergi?') &&
        vacante.includes('Inspirație')
      : vacante.includes('Formularul se activează în curând'),
  ],
  [
    'vacanțe: oferte (carusel sau stare goală)',
    offers.length > 0
      ? vacante.includes('/generated/oferte/')
      : vacante.includes('Noile oferte MIRIMODO vor apărea aici în curând'),
  ],

  // --- Legal wording: the agency is an intermediary, not a tour operator ---
  [
    'servicii: fără formularea „organizăm”',
    !/\borganiz[ăa]m\b/i.test(servicii),
  ],
  [
    'servicii: toate secțiunile au ancoră',
    serviceHubSections.every((sectiune) =>
      servicii.includes(`id="${sectiune.id}"`),
    ),
  ],

  // --- General hygiene ---
  ['fără text tehnic', !/TODO|Lorem ipsum|de completat|imagine lipsă/i.test(home + about)],

  // […] the remaining assertions are elided in this excerpt.
]

let failed = 0
for (const [label, ok] of checks) {
  if (!ok) failed += 1
  console.log(`${ok ? 'OK  ' : 'EȘEC'} ${label}`)
}

console.log(`\nAcasă: ${home.length} · Despre noi: ${about.length} caractere`)
process.exit(failed === 0 ? 0 : 1)
