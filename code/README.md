# Code samples

These files come from the production codebase, with sensitive bits removed
(no project URLs, keys or private repo names, only the names of the secrets).
The code itself is the same; I translated the comments from Romanian to
English.

Variable names, UI strings, `aria-label`s and console output are still in
Romanian. The site is Romanian and so is the client, so I left them as they
are on purpose.

Three files are excerpts and say so in their header:
`ArticlesCalendar.excerpt.tsx`, `contact-guard.excerpt.ts` and `articole.sql`
(only the seed rows are missing from that one). The rest are full files.

## Automated blog

**`content.config.ts`** is a custom Astro content loader. At build time it
reads the published articles from Supabase over REST and turns them into a
normal Astro collection, so the blog pages are plain static HTML. The part I
care about most is the error handling. A missing table means "no blog yet" and
the build goes on, but any other error stops the build. Otherwise a Supabase
outage would produce a site with zero articles, and the FTP mirror (which runs
with `--delete`) would remove them from the server. There is also a small
helper that finds 07:00 Romanian time for any date, so summer and winter time
both work without a date library.

**`articole.sql`** is the table and its Row Level Security. The public key can
only read rows that are finished and whose date has come, so drafts and
scheduled posts stay private even though the key is public. The cover images
live in a public Storage bucket that only logged in staff can write to.

**`ArticlesCalendar.excerpt.tsx`** is a piece of the editorial calendar in the
internal panel. Nobody picks the article state by hand. It comes from what the
article has: no text or no cover means Zero, both means Realizat, and Publicat
is set later by the deploy. Covers are resized in a canvas before upload (max
1600 px wide, JPEG), so 5 to 8 MB phone photos don't end up in Storage as they
are. After saving, the message tells the person in plain Romanian what happens
next.

**`publica.ts`** is the Supabase Edge Function behind the "Publică acum"
button. It checks the user's session, then sends a `repository_dispatch`
event to GitHub, which starts the deploy workflow. The GitHub token never
leaves the server side.

## Deploy

**`deploy-production.yml`** runs on push, on the button from the panel and on
two daily crons. The crons are in UTC because the `timezone:` key simply didn't
fire one morning. Two runs (04:07 and 05:07 UTC) mean one of them always lands
at 07:07 in Romania, summer or winter. Before uploading, the build is checked
for missing files and for anything that shouldn't be public (`.env`, `src`,
sourcemaps). The upload uses `lftp mirror --ignore-time`, which compares files
only by size, so I added a sha256 manifest to catch files that changed but
kept the same size (like a price edit in an article). `index.html` goes up
last. At the end, published articles are marked as `publicat` in Supabase.

**`htaccess.conf`** is the Apache config from `public/.htaccess`. It makes
http/https, www and trailing slash variants all collapse into one address with
a single redirect, and maps clean URLs like `/contact` to `contact.html`.
Having both `blog.html` and a `blog/` folder made `/blog` answer 403 at first,
and the comments explain the rule order that fixed it.

## Gallery

**`build-gallery.mjs`** is the image pipeline built on sharp. It turns 326
original photos into 1,335 WebP files: EXIF rotation, then all metadata
stripped (tourists' phones save GPS coordinates), thumbnails for the grid,
bigger versions for the lightbox and a tiny blurred placeholder inlined as
base64. It caches by size and mtime so only new photos get processed, skips
duplicates by SHA-1, and refuses to overwrite the gallery with an empty one if
the source folder is empty.

**`GalleryLightbox.tsx`** is the photo viewer. It renders through a portal
into `body`. Before that, a parent element created a stacking context and the
page header ended up on top of the close button, so tapping X opened the menu.
It also has a focus trap, keyboard and swipe navigation, and preloads the next
and previous photos.

## Smaller pieces

**`contact-guard.excerpt.ts`** is the protection on the contact form: a hidden
honeypot field, a minimum fill time and two rate limits (per email and global).
Bots get a fake "ok" so they don't learn they were blocked. The counts come
from the `Content-Range` header of a `HEAD` request, so no rows are downloaded.

**`useViewportInset.ts`** is a hook that notices when the phone keyboard is
open, using `visualViewport`. The bottom navigation and the WhatsApp button
hide while the user is typing, so they don't cover the input.

**`structuredData.ts`** builds the JSON-LD for the agency, the website,
breadcrumbs and blog articles. It leaves out ratings, reviews and price range
on purpose, because we don't have real data for them and I didn't want to
make it up.
