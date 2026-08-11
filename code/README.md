# Code samples

These are sanitized excerpts from the production codebase. The code is
unmodified; the original inline comments have been preserved and translated
from Romanian.

Everything else stays in Romanian on purpose: variable names, user-facing
strings, `aria-label`s, console output. This is a Romanian product built for a
Romanian client, and translating those would misrepresent the codebase.

One file is a partial excerpt, marked as such in its own header: `ssr-smoke.tsx`.
The other six are complete.

## `GalleryLightbox.tsx`, frontend

An accessible modal for the photo feed, in 218 lines.

Worth looking at: it renders through a portal into `body`, and the comment
explains why that is not decoration. Rendered in place, `z-index: 200` achieved
nothing, because a parent in the content opened a stacking context and trapped
the lightbox inside it. The page header ended up above the close button, so
pressing X opened the menu instead of closing the photo.

Also here: a focus trap on Tab, Escape and arrow keys, touch swipe with a
threshold, neighbour preloading so the arrows never wait on a download, and the
card taking the photo's real aspect ratio through a CSS custom property so
rounded corners never get drawn in the empty space beside a letterboxed image.

## `build-gallery.mjs`, image pipeline

Turns 296 source photos into 1,215 responsive derivatives.

Per photo: apply the EXIF orientation, then strip every metadata segment
including the phone's GPS coordinates, which is mandatory for tourists' photos.
Then two distinct WebP sets, thumbnails and lightbox sizes, so the feed never
downloads a full-size image. Plus a 24 px blurred placeholder inlined as base64.

Worth looking at: the incremental cache keyed on mtime, size and the presence of
every expected output file; deduplication by SHA-1 so the same photo placed in
two folders is not published twice; and the guard that refuses to overwrite a
generated gallery with an empty list when the source folder is merely empty
rather than absent.

## `seo.ts`, metadata for a single-page app

Title, description, canonical, Open Graph and Twitter Card, applied per route
with no external dependency.

Worth looking at: `robots` is written on every page, not only where it needs to
change. Without that, SPA navigation left a stale value behind, which is how a
404 route ended up inheriting the canonical URL of the previously visited page.

## `structuredData.ts`, JSON-LD

`TravelAgency` plus `LocalBusiness` plus `Organization`, a `WebSite` entity, and
a `BreadcrumbList` builder used on nine pages.

Worth looking at what is deliberately absent: no `aggregateRating`, no `review`,
no `geo`, no `priceRange`. Those values did not exist, and inventing structured
data both risks penalties and misleads users.

## `htaccess.conf`, URL canonicalisation

The Apache rules that collapse http and https, www and non-www, trailing slash
and none, into a single canonical URL. Copied from `public/.htaccess`, renamed
only so the file is visible in a directory listing.

Worth looking at: the comment on rule ordering. Ordered the obvious way,
`http://www.example/page/` took two redirects. Since every rule already targets
the full canonical address, moving the trailing-slash rule first means whichever
matches first resolves everything, so one hop is the worst case.

These rules were verified against a real Apache in Docker, with `mod_rewrite`
and TLS, across 19 cases.

## `deploy-production.yml`, CI/CD

GitHub Actions to shared hosting over explicit FTPS.

Worth looking at: the validation gate between build and upload. It refuses to
publish if a required file is missing, if anything from the source tree leaked
into `dist`, or if a `.env` file or a sourcemap turns up. And `index.html` is
excluded from the mirror and uploaded last, so there is never a window where the
page requests assets that have not arrived.

Certificate verification stays on. A failing deploy turned out to be an expired
certificate on the hosting side, and the fix was renewal rather than
`ssl:verify-certificate false`.

## `ssr-smoke.tsx`, testing without a test framework

Renders every page to a string outside the browser and asserts on the result.
111 assertions in the real file; this is an excerpt.

Worth looking at what is being asserted. Not only whether a page renders, but
also: every public page has exactly one `h1`; every gallery photo carries a
confirmed consent flag; the Google Maps embed is absent until consent is given;
no 13-digit sequence that could be a national ID number appears on the legal
page; the logged-out internal panel leaks no row and no internal content; and
the word "organizăm" appears nowhere, because the agency is legally an
intermediary and not a tour operator.
