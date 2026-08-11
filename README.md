# MIRIMODO, production website for a travel agency

A complete website for a Romanian travel agency: public marketing pages, a photo
gallery built from the agency's own material, a four-step request funnel that
writes to a database, and a password-protected internal panel.

**Live: [mirimodo.ro](https://mirimodo.ro)**

**Status:** Production · Live · Actively maintained

## My role

Designed, built, launched, and currently maintain a production website for a
real travel agency client. I worked end-to-end across requirements, frontend
implementation, responsive design, image processing, technical SEO, deployment,
production debugging, and ongoing maintenance.

## The project

MIRIMODO is a travel agency in Târgu Jiu, Romania, trading since 2009. It is an
*intermediary* agency rather than a tour operator, which is a legal distinction
that shapes the product: the site may never claim the agency organises the
packages it sells. That single constraint is enforced all the way down into an
automated test.

What the site does:

- **10 public pages**, covering home, a services hub with 11 anchored sections,
  about, photo gallery, contact, and four legal pages;
- **a request funnel**, a four-step form with a live summary, writing to
  Supabase (Postgres with Row Level Security);
- **a photo gallery** of 296 real photos from 14 countries and 37 localities,
  filterable by country and resort, with a masonry grid and an accessible
  lightbox;
- **an internal panel** on a hidden, `noindex` route where the agency reads
  incoming requests and keeps its content playbooks.

Roughly 29,000 lines across 79 components and 17 CSS modules.

## Stack

**Frontend:** React 19, TypeScript (strict), Vite, React Router 7, CSS Modules

**Backend:** Supabase, using Auth, Postgres and Row Level Security

**Tooling:** sharp for the image pipeline, ESLint, custom SSR scripts for
testing and auditing

**Infrastructure:** GitHub Actions building and publishing over explicit FTPS to
Apache on shared hosting

No UI framework, no CSS framework, no state library. For a site this size they
would have added weight without removing work.

## Engineering highlights

### Recovering a project that had no version control

The site was live, but the source had drifted from what was actually published
and nothing was under version control. I reconstructed the source until a clean
build reproduced the deployed archive, then compared the two artefact by
artefact, including Vite's content-hashed filenames, which only match when the
inputs match byte for byte. Every file was identical. Only then did the project
go into Git, which is why the commit history is much younger than the site.

### Automated deployment to legacy shared hosting

The hosting predates anything with a deploy API: Apache, cPanel, FTP. I built a
GitHub Actions pipeline that type-checks, lints, builds, then uploads over
explicit FTPS with certificate verification enabled. Between build and upload
sits a validation gate that refuses to publish if a required file is missing, if
anything from the source tree leaked into the output, or if a `.env` file or a
sourcemap appears. `index.html` uploads last, after the assets, so there is
never a moment where the live page requests files that have not arrived. When a
deploy failed, the diagnostic step traced it to an expired certificate on the
hosting side, and the fix was renewal rather than turning verification off.

### URL canonicalisation, verified against a real Apache

The same page was reachable at four addresses: http and https, with and without
`www`, with and without a trailing slash. Search engines treat those as
competing duplicates, and a `canonical` tag is only a hint. I wrote `.htaccess`
rules and then tested them properly, in a Docker `httpd` container with
`mod_rewrite` and TLS, across 19 cases covering query strings, real directories
and the proxy headers shared hosting adds. The test caught something reading
alone would not have: the obvious rule order made `http://www.example/page/`
take two redirects. Reordering brought the worst case down to one hop, and all
19 cases pass with no loop.

### An SEO audit tool, and what it found

Rather than click through pages, I wrote a script that renders every route
outside the browser and reports structure. It found four pages with no `h1` at
all, and something worse: the 404 route had no SEO handling, so it inherited the
title, canonical URL and robots directive of whichever page the visitor came
from. Any mistyped URL could be indexed as a duplicate of a real page. Both are
fixed, along with JSON-LD for `TravelAgency`, `Organization`, `WebSite` and
breadcrumbs on nine pages. The audit now runs as `npm run seo`.

### An image pipeline for photos that arrive by WhatsApp

The agency's photos come from tourists, at unpredictable sizes and orientations,
carrying whatever metadata the phone attached. The build script applies the EXIF
orientation and then strips every metadata segment, because the GPS coordinates
in a holiday photo are not the agency's to publish. It emits two distinct WebP
sets, thumbnails and lightbox sizes, so the feed never downloads a full-size
image, plus a 24-pixel blurred placeholder inlined as base64 to hold layout.
296 source photos become 1,215 derivatives. An incremental cache means only new
or changed photos are reprocessed, and SHA-1 hashing means the same photo filed
in two folders is never published twice.

### Testing without a test framework

A single-page marketing site does not justify a full test setup, but it does
have rules worth enforcing. I wrote a smoke test that renders every page to a
string and asserts on the output, 111 assertions today. Some are structural:
exactly one `h1` per public page. Some are legal: the word "organizăm" must
appear nowhere, because the agency is an intermediary. Some protect people:
every gallery photo must carry a confirmed consent flag, no 13-digit sequence
that could be a national ID may appear on the legal page, and the logged-out
internal panel must leak neither a request row nor any internal content.

### Consent handled as a feature, not a banner

The Google Maps embed does not load until the visitor accepts external content.
The iframe is genuinely absent from the DOM, and a test asserts it. The cookie
policy page is generated from a typed inventory file, so the published table
cannot drift from what the site actually stores. Gallery photos pass a consent
gate before they reach the feed.

### A CSS trap, and a limitation I did not paper over

The mobile menu needed a dimmed, blurred backdrop. Placed inside the header it
covered only the top bar, because `backdrop-filter` turns an element into a
containing block for `position: fixed` descendants, so the overlay was confined
to its parent. Moving it to a portal on `body` fixed it.

Worth stating plainly: metadata and JSON-LD are injected client-side. Google
renders JavaScript, so search is fine, but social scrapers do not, and link
previews fall back to the static `index.html`. That is a real limitation of the
current SPA architecture, and fixing it properly means server-side rendering
rather than a workaround.

## Screenshots

| | |
|---|---|
| ![Home page](screenshots/01-home-desktop.jpg) | ![Services hub](screenshots/02-services-desktop.jpg) |
| **Home**, hero and primary funnel entry | **Services hub**, sticky section nav and alternating two-column layout |
| ![Gallery](screenshots/03-gallery-filters-masonry.jpg) | ![Request wizard](screenshots/04-request-wizard.jpg) |
| **Gallery**, country filters with live counts over a masonry grid | **Request wizard**, four steps with a running summary |
| ![Lightbox](screenshots/05-gallery-lightbox.jpg) | |
| **Lightbox**, accessible modal portalled out of the page | |

## Code samples

Seven files from the production codebase are in [`code/`](code/), with a short
note on each explaining what is worth reading and why. They cover frontend
implementation, the image pipeline, SEO, canonicalisation, CI/CD and testing.

## Maintenance

The site is live and I still work on it. Recent work includes adding a services
hub, splitting a section into its own page, a full technical SEO pass, gallery
expansions as new photos arrive, and accessibility adjustments to navigation.

## Future development

The next major technical direction for MIRIMODO is an automated travel search
engine designed to handle 500+ GB of travel data daily and improve large-scale
offer discovery. This is planned work, not built yet.

## License note

This repository contains selected, sanitized excerpts from a commercial
production project for portfolio and technical review purposes. It is not the
complete production codebase.
