import { useEffect, useRef } from 'react'
import './topographic-hero.css'

// Illustrative relief: nested elevation contours projected into a landscape.
// This is brand artwork, never presented as a measured race course.
const pair = ([x,y]) => `${x.toFixed(2)},${y.toFixed(2)}`
function surface(level, angle) {
  const radius = 440 * Math.pow(1-level, .82)
  const ridge = 1 + .12*Math.cos(3*angle+.4) + .07*Math.sin(5*angle) + .035*Math.cos(9*angle)
  return [710 + Math.cos(angle)*radius*ridge - level*75,
    358 + Math.sin(angle)*radius*ridge*.34 - level*252]
}
const contours = Array.from({length:27},(_,i)=>{
  const level = i/28
  const points = Array.from({length:181},(_,j)=>surface(level,j/180*Math.PI*2))
  return {d:points.map((p,j)=>`${j?'L':'M'}${pair(p)}`).join(' ')+' Z', level}
})
const routePoints = Array.from({length:181},(_,i)=>{
  const h=.035+i/180*.925
  return surface(h,Math.PI*.56 + Math.sin(h*19)*.48*(1-h*.55))
})
const trail = routePoints.map((p,i)=>`${i?'L':'M'}${pair(p)}`).join(' ')
function Mountain() {
  return <svg className="otri-terrain-layer otri-terrain-near" viewBox="0 0 1200 520" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="otri-relief-light" x1="350" y1="100" x2="1050" y2="480" gradientUnits="userSpaceOnUse">
        <stop stopColor="#f8fbff" /><stop offset=".55" stopColor="#e6effc" /><stop offset="1" stopColor="#bacfea" />
      </linearGradient>
      <pattern id="otri-survey-grid" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#96b1d4" opacity=".5" /></pattern>
    </defs>
    <path d="M150 340 685 165 1180 350 660 510Z" fill="url(#otri-survey-grid)" />
    <path d="M260 370 710 210 1150 380 700 510Z" fill="#d8e5f6" opacity=".35" />
    <g strokeLinejoin="round">
      {contours.map(({d},i)=><path key={i} d={d} fill="url(#otri-relief-light)" stroke={i%5===0?'#7298c5':'#a2bcdd'} strokeWidth={i%5===0?1.4:.75} />)}
    </g>
    <path d={trail} stroke="white" strokeWidth="8" strokeLinecap="round" />
    <path d={trail} stroke="#2563eb" strokeOpacity=".35" strokeWidth="3" />
    <path className="otri-terrain-trail" d={trail} pathLength="100" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
    {[0,70,130,180].map((index,i)=>{
      const [cx,cy]=routePoints[index]
      return <g key={i}><circle cx={cx} cy={cy} r={i===0||i===3?5:4} fill="white" stroke="#2563eb" strokeWidth="2" /></g>
    })}
    <g stroke="#7595bc" strokeWidth=".8">
      <path d="M640 108 690 58H805M620 427 530 469H405" />
      <path d="M110 390V460H300" />
    </g>
    <g fill="#547296" fontFamily="ui-monospace,monospace" fontSize="10" letterSpacing="1.5">
      <text x="705" y="49">SUMMIT</text><text x="408" y="490">TRAIL / ASCENT</text>
      <text x="110" y="365">ELEVATION PROFILE</text>
    </g>
    <path d="M115 452 135 446 151 450 173 432 189 436 208 418 221 423 243 399 258 409 281 383 299 390" stroke="#2563eb" strokeWidth="2" />
    <path d="M115 452 135 446 151 450 173 432 189 436 208 418 221 423 243 399 258 409 281 383 299 390V460H115Z" fill="#2563eb" opacity=".06" />
  </svg>
}

export default function TopographicHero() {
  const ref = useRef(null)

  useEffect(() => {
    const element = ref.current
    const hero = element?.parentElement
    if (!hero) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let visible = true
    let pointerX = 0
    let pointerY = 0

    const paint = () => {
      frame = 0
      if (!visible || motion.matches) return
      const rect = hero.getBoundingClientRect()
      const progress = Math.min(1, Math.max(0, (68 - rect.top) / Math.max(1, rect.height * .75)))
      element.style.setProperty('--terrain-x', `${pointerX * 14}px`)
      element.style.setProperty('--terrain-tilt', `${pointerY * .7}deg`)
      element.style.setProperty('--terrain-near', `${progress * -36}px`)
      element.style.setProperty('--trail-hidden', `${8 * (1 - progress)}`)
    }
    const schedule = () => {
      if (!frame && visible && !motion.matches) frame = requestAnimationFrame(paint)
    }
    const move = event => {
      if (event.pointerType !== 'mouse') return
      const rect = hero.getBoundingClientRect()
      pointerX = (event.clientX - rect.left) / rect.width * 2 - 1
      pointerY = (event.clientY - rect.top) / rect.height * 2 - 1
      schedule()
    }
    const reset = () => { pointerX = 0; pointerY = 0; schedule() }
    const configure = () => {
      hero.removeEventListener('pointermove', move)
      hero.removeEventListener('pointerleave', reset)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
      frame = 0
      if (motion.matches) {
        element.style.removeProperty('--terrain-x')
        element.style.removeProperty('--terrain-tilt')
        element.style.removeProperty('--terrain-near')
        element.style.removeProperty('--trail-hidden')
      } else {
        hero.addEventListener('pointermove', move, { passive: true })
        hero.addEventListener('pointerleave', reset)
        window.addEventListener('scroll', schedule, { passive: true })
        window.addEventListener('resize', schedule)
        schedule()
      }
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) schedule()
    })
    observer.observe(hero)
    motion.addEventListener('change', configure)
    configure()
    return () => {
      observer.disconnect()
      motion.removeEventListener('change', configure)
      hero.removeEventListener('pointermove', move)
      hero.removeEventListener('pointerleave', reset)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={ref} className="otri-terrain" aria-hidden="true">
      <Mountain />
      <div className="otri-terrain-veil" />
      <div className="otri-terrain-survey"><span>TOPOGRAPHY / ROUTE / PERFORMANCE</span><span>ILLUSTRATIVE TERRAIN</span></div>
    </div>
  )
}
