import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
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
      className={`fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-500 shadow-[0_10px_28px_rgba(15,23,42,.12)] backdrop-blur transition duration-200 hover:border-blue-300 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 print:hidden ${shown ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0'}`}
    >
      <ArrowUp size={18} />
    </button>
  )
}
