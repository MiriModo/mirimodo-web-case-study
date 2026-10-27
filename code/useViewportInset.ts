import { useEffect, useState } from 'react'

/**
 * Detects the open mobile keyboard, using `VisualViewport`.
 *
 * When the keyboard comes up, `visualViewport.height` goes down, but
 * `innerHeight` stays the same on Android and on iOS 15 and newer. The
 * difference between them is exactly the covered height. Above the threshold
 * below we treat the keyboard as open and hide the fixed controls, so they
 * don't sit on top of the field the user is typing in.
 *
 * Without `VisualViewport` (old browsers) the answer is always `false`: the
 * controls stay where they are, which is exactly how it worked before.
 */
const PRAG_PX = 140

function tastaturaDeschisa(): boolean {
  if (typeof window === 'undefined' || !window.visualViewport) return false
  return window.innerHeight - window.visualViewport.height > PRAG_PX
}

export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(tastaturaDeschisa)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    let frame = 0
    const masoara = () => {
      frame = 0
      setOpen(tastaturaDeschisa())
    }
    const laEveniment = () => {
      if (!frame) frame = requestAnimationFrame(masoara)
    }

    vv.addEventListener('resize', laEveniment)
    vv.addEventListener('scroll', laEveniment)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      vv.removeEventListener('resize', laEveniment)
      vv.removeEventListener('scroll', laEveniment)
    }
  }, [])

  return open
}
