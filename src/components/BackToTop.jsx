import { useEffect, useState } from 'preact/compat'
import { ArrowUp } from '../ui/icons'
import { scrollBehavior } from '../lib/comfort'

/** A quiet way back up a long page: appears in the corner once a screen and a half has gone by, and
 * keeps out of the way until then. */
export default function BackToTop() {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setShown(window.scrollY > window.innerHeight * 1.5)
        ticking = false
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
      aria-label="Back to the top of the page"
      title="Back to top"
      tabIndex={shown ? 0 : -1}
      className={`to-top ${shown ? '' : 'is-hidden'}`}
    >
      <ArrowUp size={20} />
    </button>
  )
}
