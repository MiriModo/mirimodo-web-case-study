/**
 * Generator for the tourist photo feed.
 *
 *   materiale/galerie/<country>/<locality>/*.jpg|jpeg|png|webp  (originals, local)
 *              │  npm run galerie
 *              ▼
 *   public/gallery/<country>/<locality>/*.webp                  (optimised derivatives)
 *   src/data/gallery.generated.ts                               (the data the site reads)
 *
 * What it does for every photo:
 *  - applies the EXIF orientation, then STRIPS all metadata (including the
 *    phone's GPS coordinates), mandatory for tourists' photos;
 *  - generates TWO sets of WebP variants:
 *      · thumbnails (320 / 640 / 960 px) for the feed grid;
 *      · large images (1280 / 1920 px) for the lightbox;
 *    the original photo never reaches the page;
 *  - generates a tiny blurred placeholder, inlined in the data (base64, ~0.5 KB);
 *  - records the real dimensions and orientation so the page does not "jump".
 *
 * Subsequent runs only process new or modified photos
 * (cache in `materiale/galerie/.gallery-cache.json`).
 *
 * Options:
 *   --curata   removes derivatives in `public/` left without a source photo
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { numeStatiune, numeTara, slugify } from './gallery-labels.mjs'

const RADACINA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR_SURSA = path.join(RADACINA, 'materiale', 'galerie')
const DIR_IESIRE = path.join(RADACINA, 'public', 'gallery')
const PREFIX_PUBLIC = '/gallery'
const FISIER_DATE = path.join(RADACINA, 'src', 'data', 'gallery.generated.ts')
const FISIER_CACHE = path.join(DIR_SURSA, '.gallery-cache.json')

/** Grid thumbnails. 960 also covers the large (2×2) cards on retina screens. */
const LATIMI_THUMB = [320, 640, 960]
/** Lightbox images. */
const LATIMI_MARE = [1280, 1920]
/** Default feed thumbnail and default lightbox image. */
const THUMB_IMPLICIT = 640
const MARE_IMPLICIT = 1280

const CALITATE = 78
const EXTENSII = new Set(['.jpg', '.jpeg', '.png', '.webp'])
/** How many photos are processed in parallel. */
const PARALEL = 4
/**
 * From how many photos in a locality the first one gets featured (2×2 card).
 * The rule is deterministic: the same source always produces the same layout.
 */
const PRAG_EVIDENTIERE = 4

const curata = process.argv.includes('--curata')

/* --------------------------------------------------------------- utilities */

const kb = (octeti) => `${(octeti / 1024).toFixed(0)} KB`
const mb = (octeti) => `${(octeti / 1024 / 1024).toFixed(1)} MB`

/** The visible subdirectories of a folder, in alphabetical order. */
async function subdirectoare(dir) {
  const intrari = await readdir(dir, { withFileTypes: true })
  return intrari
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort()
}

/** The image files in a folder, in alphabetical order. */
async function imagini(dir) {
  const intrari = await readdir(dir, { withFileTypes: true })
  return intrari
    .filter(
      (e) =>
        e.isFile() &&
        !e.name.startsWith('.') &&
        EXTENSII.has(path.extname(e.name).toLowerCase()),
    )
    .map((e) => e.name)
    .sort()
}

/** Orientation, in the vocabulary the grid uses. */
function orientare(latime, inaltime) {
  const r = latime / inaltime
  if (r >= 1.15) return 'landscape'
  if (r <= 0.87) return 'portrait'
  return 'square'
}

/** Runs the tasks with a limited number of simultaneous executions. */
async function cuParalelism(sarcini, limita) {
  const rezultate = new Array(sarcini.length)
  let urmatoarea = 0
  const lucrator = async () => {
    while (urmatoarea < sarcini.length) {
      const i = urmatoarea++
      rezultate[i] = await sarcini[i]()
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limita, sarcini.length) }, lucrator),
  )
  return rezultate
}

/**
 * Optional `info.json` inside a locality folder:
 *
 *   {
 *     "caption": "Sejur all-inclusive in Hurghada, rezervat prin MIRIMODO",
 *     "alt": "...",
 *     "an": 2026,
 *     "evidentiaza": ["IMG_2031.jpg"]
 *   }
 */
async function citesteInfo(dir) {
  const cale = path.join(dir, 'info.json')
  if (!existsSync(cale)) return {}
  try {
    return JSON.parse(await readFile(cale, 'utf8'))
  } catch (eroare) {
    console.warn(`   ! info.json invalid în ${dir}: ${eroare.message}`)
    return {}
  }
}

/* --------------------------------------------------- processing one image */

/**
 * Generates the WebP variants plus the placeholder and returns the photo data.
 * Thumbnails and large images are distinct sets: the feed never downloads the
 * lightbox image.
 */
async function proceseaza({ octeti, localitate, hash, tara, dirIesire }) {
  const meta = await sharp(octeti).metadata()

  // EXIF orientation 5-8 rotates the image by 90°, so it swaps the sides.
  const rotita = (meta.orientation ?? 1) >= 5
  const latimeReala = rotita ? meta.height : meta.width
  if (!latimeReala) throw new Error('dimensiuni necunoscute')

  // We never upscale: an 800 px source does not produce 1280 px variants.
  const tinte = [...LATIMI_THUMB, ...LATIMI_MARE]
    .map((w) => Math.min(w, latimeReala))
    .filter((w, i, all) => all.indexOf(w) === i)
    .sort((a, b) => a - b)

  const variante = new Map()
  for (const latime of tinte) {
    const nume = `${localitate.slug}-${hash}-${latime}.webp`
    const { data, info } = await sharp(octeti)
      .rotate()
      .resize({ width: latime, withoutEnlargement: true })
      .webp({ quality: CALITATE })
      .toBuffer({ resolveWithObject: true })

    await writeFile(path.join(dirIesire, nume), data)
    variante.set(latime, {
      nume,
      url: `${PREFIX_PUBLIC}/${tara.slug}/${localitate.slug}/${nume}`,
      latime: info.width,
      inaltime: info.height,
      octeti: data.length,
    })
  }

  const blur = await sharp(octeti)
    .rotate()
    .resize({ width: 24 })
    .webp({ quality: 40 })
    .toBuffer()

  /** The requested variants, limited to what the source could produce. */
  const set = (latimi) => {
    const alese = latimi
      .map((w) => variante.get(Math.min(w, latimeReala)))
      .filter((v, i, all) => v && all.indexOf(v) === i)
    // A very small source can fall outside both sets: use whatever exists.
    return alese.length > 0 ? alese : [...variante.values()]
  }

  /** The variant closest to the preferred width. */
  const implicita = (alese, preferata) =>
    alese.reduce((a, b) =>
      Math.abs(b.latime - preferata) < Math.abs(a.latime - preferata) ? b : a,
    )

  const thumbs = set(LATIMI_THUMB)
  const mari = set(LATIMI_MARE)
  const thumb = implicita(thumbs, THUMB_IMPLICIT)
  const mare = implicita(mari, MARE_IMPLICIT)
  const srcset = (alese) => alese.map((v) => `${v.url} ${v.latime}w`).join(', ')

  return {
    variante: [...variante.values()],
    thumbSrc: thumb.url,
    thumbSrcSet: srcset(thumbs),
    src: mare.url,
    srcSet: srcset(mari),
    width: mare.latime,
    height: mare.inaltime,
    orientation: orientare(mare.latime, mare.inaltime),
    blur: `data:image/webp;base64,${blur.toString('base64')}`,
    octetiGenerati: [...variante.values()].reduce((t, v) => t + v.octeti, 0),
  }
}

/* ---------------------------------------------------------- the generator */

async function main() {
  if (!existsSync(DIR_SURSA)) {
    console.log(
      `Folderul "materiale/galerie" nu există — galeria rămâne neschimbată.\n` +
        `Creează-l și pune fotografiile în materiale/galerie/<tara>/<localitate>/.`,
    )
    if (!existsSync(FISIER_DATE)) await scrieDate([], [])
    return
  }

  const cacheVechi = existsSync(FISIER_CACHE)
    ? JSON.parse(await readFile(FISIER_CACHE, 'utf8'))
    : {}
  const cacheNou = {}

  const tari = await subdirectoare(DIR_SURSA)
  const fotografii = []
  const hashuriVazute = new Map()
  let procesate = 0
  let sarite = 0
  let octetiGenerati = 0
  let octetiSursa = 0

  for (const numeTaraFolder of tari) {
    const dirTara = path.join(DIR_SURSA, numeTaraFolder)
    // Clean slug for URLs/files (the folder name may contain spaces/diacritics).
    const taraSlug = slugify(numeTaraFolder)
    const tara = { slug: taraSlug, label: numeTara(taraSlug) }

    const razlete = await imagini(dirTara)
    if (razlete.length > 0) {
      console.warn(
        `   ! ${razlete.length} fotografii direct în "${numeTaraFolder}" au fost ignorate — ` +
          `pune-le într-un subfolder de localitate (ex. ${numeTaraFolder}/hurghada/).`,
      )
    }

    for (const numeLocFolder of await subdirectoare(dirTara)) {
      const dirLocalitate = path.join(dirTara, numeLocFolder)
      const localitate = {
        slug: slugify(numeLocFolder),
        label: numeStatiune(slugify(numeLocFolder)),
      }
      const fisiere = await imagini(dirLocalitate)
      if (fisiere.length === 0) continue

      const info = await citesteInfo(dirLocalitate)
      const caption =
        info.caption ??
        `Vacanță în ${localitate.label}, ${tara.label} — rezervată prin MIRIMODO`
      const alt =
        info.alt ??
        `Fotografie dintr-o vacanță în ${localitate.label}, ${tara.label}, rezervată prin MIRIMODO`
      const evidentiate = new Set(info.evidentiaza ?? [])

      const dirIesire = path.join(DIR_IESIRE, taraSlug, localitate.slug)
      await mkdir(dirIesire, { recursive: true })

      const rezultate = await cuParalelism(
        fisiere.map((fisier) => async () => {
          const caleSursa = path.join(dirLocalitate, fisier)
          const cheie = path
            .relative(DIR_SURSA, caleSursa)
            .split(path.sep)
            .join('/')
          const stare = await stat(caleSursa)
          octetiSursa += stare.size

          const inCache = cacheVechi[cheie]
          const neschimbat =
            inCache &&
            inCache.mtime === stare.mtimeMs &&
            inCache.size === stare.size &&
            inCache.foto?.thumbSrc &&
            inCache.foto.variante.every((v) =>
              existsSync(path.join(dirIesire, v.nume)),
            )

          let foto
          let hash
          if (neschimbat) {
            foto = inCache.foto
            hash = inCache.hash
            sarite += 1
          } else {
            const octeti = await readFile(caleSursa)
            hash = createHash('sha1').update(octeti).digest('hex').slice(0, 8)
            foto = await proceseaza({ octeti, tara, localitate, hash, dirIesire })
            procesate += 1
            console.log(
              `   + ${cheie} → ${foto.variante.length} variante, ${kb(foto.octetiGenerati)}`,
            )
          }

          octetiGenerati += foto.octetiGenerati
          cacheNou[cheie] = { mtime: stare.mtimeMs, size: stare.size, hash, foto }

          return {
            fisier,
            cheie,
            hash,
            foto,
            adaugatLa: new Date(stare.mtimeMs).toISOString(),
          }
        }),
        PARALEL,
      )

      const publicabile = []
      for (const rezultat of rezultate) {
        // The same photo placed in two locations: the first occurrence wins.
        const duplicat = hashuriVazute.get(rezultat.hash)
        if (duplicat) {
          console.warn(
            `   ! ${rezultat.cheie} este identică cu ${duplicat} — nu se publică de două ori.`,
          )
          continue
        }
        hashuriVazute.set(rezultat.hash, rezultat.cheie)
        publicabile.push(rezultat)
      }

      /*
       * Featuring (2×2 card in the grid) is deterministic, not random:
       *  - if `info.json` lists files under `evidentiaza`, those are chosen;
       *  - otherwise the locality's first photo, if it has at least 4 photos.
       * This way the layout does not change from one render to the next.
       */
      const alegeriExplicite = publicabile.some((r) => evidentiate.has(r.fisier))

      for (const [index, rezultat] of publicabile.entries()) {
        const featured = alegeriExplicite
          ? evidentiate.has(rezultat.fisier)
          : index === 0 && publicabile.length >= PRAG_EVIDENTIERE

        fotografii.push({
          id: `${tara.slug}-${localitate.slug}-${rezultat.hash}`,
          countrySlug: tara.slug,
          country: tara.label,
          localitySlug: localitate.slug,
          locality: localitate.label,
          caption: info.an ? `${caption} · ${info.an}` : caption,
          alt,
          thumbSrc: rezultat.foto.thumbSrc,
          thumbSrcSet: rezultat.foto.thumbSrcSet,
          src: rezultat.foto.src,
          srcSet: rezultat.foto.srcSet,
          width: rezultat.foto.width,
          height: rezultat.foto.height,
          orientation: rezultat.foto.orientation,
          blur: rezultat.foto.blur,
          featured,
          /*
           * The tourist's consent is confirmed BEFORE the photo is placed in
           * `materiale/galerie/`: presence in the source folder is the
           * confirmation. The field stays explicit in the data, and the site
           * filters on it.
           */
          consentConfirmed: true,
          addedAt: rezultat.adaugatLa,
        })
      }
    }
  }

  // Newest first; on a tie, a stable order by id.
  fotografii.sort(
    (a, b) => b.addedAt.localeCompare(a.addedAt) || a.id.localeCompare(b.id),
  )

  /*
   * Zero source photos, but a gallery that has already been generated: we do
   * not delete it.
   *
   * The original photos live in the repository, so a clone normally has them.
   * The check remains as a safety net for situations where the folder ends up
   * empty for another reason: a partial copy, a half-finished sync, a checkout
   * that did not manage to fetch the large files.
   *
   * Without it, `npm run build` would overwrite `gallery.generated.ts` with an
   * empty list, and the built site would be left without a gallery even though
   * all 681 derivatives in `public/gallery/` are exactly where they should be.
   *
   * The check at the start of `main()` does not cover this case: there the
   * whole folder is missing, here the folder exists and is merely empty.
   */
  if (fotografii.length === 0 && (await galerieGenerataAreContinut())) {
    console.log(
      'Nicio fotografie în materiale/galerie — galeria generată rămâne neschimbată.\n' +
        'Fotografiile originale nu se versionează; derivatele publicate sunt deja în public/gallery/.',
    )
    return
  }

  const tariAgregate = agregaTari(fotografii)
  await scrieDate(fotografii, tariAgregate)
  await writeFile(FISIER_CACHE, JSON.stringify(cacheNou, null, 2), 'utf8')

  if (curata) await curataOrfane(fotografii)

  const evidentiate = fotografii.filter((f) => f.featured).length
  console.log(
    `\nGalerie: ${fotografii.length} fotografii · ${tariAgregate.length} țări · ` +
      `${tariAgregate.reduce((t, c) => t + c.localities.length, 0)} localități · ` +
      `${evidentiate} evidențiate`,
  )
  console.log(
    `Procesate acum: ${procesate} · nemodificate: ${sarite} · ` +
      `sursă ${mb(octetiSursa)} → publicat ${mb(octetiGenerati)}`,
  )
  if (!curata) {
    console.log(
      'Dacă ai șters fotografii din materiale/galerie, rulează: npm run galerie -- --curata',
    )
  }
}

/** Groups the photos by country and locality, with counts. */
function agregaTari(fotografii) {
  const tari = new Map()
  for (const foto of fotografii) {
    let tara = tari.get(foto.countrySlug)
    if (!tara) {
      tara = {
        slug: foto.countrySlug,
        label: foto.country,
        count: 0,
        localities: new Map(),
      }
      tari.set(foto.countrySlug, tara)
    }
    tara.count += 1

    let localitate = tara.localities.get(foto.localitySlug)
    if (!localitate) {
      localitate = { slug: foto.localitySlug, label: foto.locality, count: 0 }
      tara.localities.set(foto.localitySlug, localitate)
    }
    localitate.count += 1
  }

  const dupaNumar = (a, b) =>
    b.count - a.count || a.label.localeCompare(b.label, 'ro')
  return [...tari.values()]
    .map((tara) => ({
      slug: tara.slug,
      label: tara.label,
      count: tara.count,
      localities: [...tara.localities.values()].sort(dupaNumar),
    }))
    .sort(dupaNumar)
}

/**
 * Tells whether the already generated gallery contains photos.
 *
 * It looks for a real entry in `touristPhotos`, not at the file size: the empty
 * version still has the whole header and the imports, so it is not empty as
 * text.
 */
async function galerieGenerataAreContinut() {
  if (!existsSync(FISIER_DATE)) return false
  const continut = await readFile(FISIER_DATE, 'utf8')
  return !/export const touristPhotos: TouristPhoto\[\] = \[\]/.test(continut)
}

/** Writes the TypeScript file the site reads. */
async function scrieDate(fotografii, tari) {
  const continut = `/**
 * FISIER GENERAT AUTOMAT, nu il edita manual.
 *
 * Sursa: folderele din \`materiale/galerie/<tara>/<localitate>/\`.
 * Regenerare: \`npm run galerie\`, care ruleaza si automat la \`npm run build\`.
 */
import type { GalleryCountry, TouristPhoto } from '@/types/content'

export const touristPhotos: TouristPhoto[] = ${JSON.stringify(fotografii, null, 2)}

export const galleryCountries: GalleryCountry[] = ${JSON.stringify(tari, null, 2)}
`
  await mkdir(path.dirname(FISIER_DATE), { recursive: true })
  await writeFile(FISIER_DATE, continut, 'utf8')
}

/** Removes files in `public/` left without a source photo. */
async function curataOrfane(fotografii) {
  if (!existsSync(DIR_IESIRE)) return
  const pastrate = new Set()
  for (const foto of fotografii) {
    for (const lista of [foto.thumbSrcSet, foto.srcSet]) {
      for (const intrare of lista.split(', ')) {
        pastrate.add(path.join(RADACINA, 'public', intrare.split(' ')[0]))
      }
    }
  }

  let sterse = 0
  const parcurge = async (dir) => {
    for (const intrare of await readdir(dir, { withFileTypes: true })) {
      const cale = path.join(dir, intrare.name)
      if (intrare.isDirectory()) {
        await parcurge(cale)
        if ((await readdir(cale)).length === 0) await rm(cale, { recursive: true })
      } else if (intrare.name.endsWith('.webp') && !pastrate.has(cale)) {
        await rm(cale)
        sterse += 1
      }
    }
  }
  await parcurge(DIR_IESIRE)
  if (sterse > 0) console.log(`Curățare: ${sterse} fișiere fără sursă, șterse.`)
}

main().catch((eroare) => {
  console.error(`Generarea galeriei a eșuat: ${eroare.message}`)
  process.exit(1)
})
