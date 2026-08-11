import { useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import s from './gallery.module.css'
import { Icon } from '@/components/ui/Icon'
import type { LightboxItem } from './lightboxItem'

export interface GalleryLightboxProps {
  items: LightboxItem[]
  index: number
  onClose: () => void
  onNavigate: (nextIndex: number) => void
}

/** Minimum distance (px) for a swipe to change the photo. */
const PRAG_SWIPE = 48

/**
 * Accessible lightbox.
 *
 * - modal dialog with a focus trap and `aria-modal`;
 * - navigates strictly within the list it receives, i.e. within the feed's
 *   active filter: from Crete you can never end up in another locality;
 * - keyboard: Escape closes, arrows change the photo, Tab stays in the dialog;
 * - left/right swipe on touch screens;
 * - preloads the neighbouring photos so navigation is instant;
 * - locks page scrolling while open;
 * - returns focus to the element that opened it (handled by the parent);
 * - shows locality, country and the counter; it never shows tourist names, EXIF
 *   data or GPS locations.
 *
 * Rendered through a portal, straight into `body`.
 *
 * Rendered in place, `z-index: 200` achieves nothing: a parent in the content
 * opens a stacking context and the lightbox stays trapped inside it. The page
 * header, at `z-index: 50`, therefore ended up above the close button: pressing
 * X opened the menu instead of closing the photo, and the visitor was stuck.
 * From `body` there is no longer a parent that can confine it.
 */
export function GalleryLightbox({
  items,
  index,
  onClose,
  onNavigate,
}: GalleryLightboxProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const touchStartX = useRef<number | null>(null)
  const item = items[index]

  const hasPrev = index > 0
  const hasNext = index < items.length - 1

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(index - 1)
  }, [hasPrev, index, onNavigate])

  const goNext = useCallback(() => {
    if (hasNext) onNavigate(index + 1)
  }, [hasNext, index, onNavigate])

  // Keyboard: Escape, arrows and a Tab focus trap.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrev()
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
        return
      }
      if (event.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled])',
        )
        if (!focusables || focusables.length === 0) return
        const first = focusables[0]!
        const last = focusables[focusables.length - 1]!
        const active = document.activeElement
        if (event.shiftKey && active === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && active === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [goPrev, goNext, onClose])

  // Lock page scrolling while the lightbox is open.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Move focus into the dialog on open.
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [])

  // Preload the neighbours so the arrows never wait on a download.
  useEffect(() => {
    for (const vecin of [items[index - 1], items[index + 1]]) {
      if (!vecin) continue
      const img = new Image()
      if (vecin.srcSet) img.srcset = vecin.srcSet
      img.src = vecin.src
    }
  }, [items, index])

  if (!item) return null
  // Outside the browser there is no `body` for the portal to render into.
  if (typeof document === 'undefined') return null

  const eticheta = [item.place, item.region].filter(Boolean).join(', ')

  return createPortal(
    <div
      className={s.lightbox}
      role="dialog"
      aria-modal="true"
      aria-label={eticheta ? `Fotografie din ${eticheta}` : item.caption}
      ref={dialogRef}
      onClick={(event) => {
        // A click on the backdrop (not on the image or buttons) closes it.
        if (event.target === event.currentTarget) onClose()
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current
        touchStartX.current = null
        const end = event.changedTouches[0]?.clientX
        if (start === null || end === undefined) return
        const delta = end - start
        if (Math.abs(delta) < PRAG_SWIPE) return
        if (delta < 0) goNext()
        else goPrev()
      }}
    >
      <div className={s.lightboxTop}>
        <p className={s.lightboxPlace}>
          {item.place ? (
            <span className={s.lightboxLocality}>{item.place}</span>
          ) : (
            <span className={s.lightboxLocality}>{item.caption}</span>
          )}
          {item.region ? (
            <span className={s.lightboxCountry}>{item.region}</span>
          ) : null}
        </p>

        <p className={s.lightboxCounter}>
          <span aria-hidden="true">
            {index + 1} / {items.length}
          </span>
          <span className="sr-only" aria-live="polite">
            Fotografia {index + 1} din {items.length}
          </span>
        </p>

        {/* The icon used to be `external`, an external-link arrow. It did not
            signal closing, so the button did not read as one. */}
        <button
          type="button"
          className={s.lightboxBtn}
          onClick={onClose}
          aria-label="Închide galeria"
        >
          <Icon name="close" size={20} title={undefined} />
        </button>
      </div>

      <div className={s.lightboxStage}>
        {/*
          The card takes the exact shape of the photo, from its real dimensions.
          Without this, the rounded corners would be drawn on the edges of the
          box, i.e. in the empty space next to a letterboxed photo, and would
          not be visible.
        */}
        <div
          className={s.lightboxCard}
          style={
            { '--foto-raport': `${item.width} / ${item.height}` } as CSSProperties
          }
        >
          <img
            className={s.lightboxImg}
            src={item.src}
            srcSet={item.srcSet}
            sizes="(min-width: 1024px) 80vw, 100vw"
            alt={item.alt}
            width={item.width}
            height={item.height}
          />
        </div>
      </div>

      <div className={s.lightboxBar}>
        <button
          type="button"
          className={s.lightboxBtn}
          onClick={goPrev}
          disabled={!hasPrev}
          aria-label="Fotografia anterioară"
        >
          <Icon name="arrow-right" size={20} className={s.lightboxPrevIcon} />
        </button>
        <button
          type="button"
          className={s.lightboxBtn}
          onClick={goNext}
          disabled={!hasNext}
          aria-label="Fotografia următoare"
        >
          <Icon name="arrow-right" size={20} />
        </button>
      </div>
    </div>,
    document.body,
  )
}
