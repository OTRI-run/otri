import { useEffect, useRef } from 'react'
import './topographic-hero.css'

// An abstract course fingerprint: elevation becomes radial samples around an
// index dial. Decorative geometry only; no invented scores or race measurements.
const count = 156
const polar = (angle, radius) => [600 + Math.cos(angle)*radius*1.48, 390 + Math.sin(angle)*radius]
const pair = ([x,y]) => `${x.toFixed(2)},${y.toFixed(2)}`
const samples = Array.from({length:count},(_,i)=>{
  const angle=i/count*Math.PI*2
  const peak = (center,width,amplitude) => amplitude*Math.exp(-Math.pow((i/count-center)/width,2))
  const relief=12+peak(.14,.065,52)+peak(.39,.1,37)+peak(.67,.055,63)+peak(.86,.08,44)+5*Math.sin(i*.73)
  return {angle, radius:250+relief}
})
const fingerprint = samples.map(({angle,radius},i)=>`${i?'L':'M'}${pair(polar(angle,radius))}`).join(' ')+' Z'
const route = samples.map(({angle,radius},i)=>`${i?'L':'M'}${pair(polar(angle,radius-23))}`).join(' ')+' Z'
function CourseFingerprint() {
  return <svg className="otri-terrain-layer otri-terrain-near" viewBox="0 0 1200 780" preserveAspectRatio="none" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="otri-index-aura"><stop offset=".5" stopColor="#fff" stopOpacity="0"/><stop offset=".8" stopColor="#dce9ff" stopOpacity=".8"/><stop offset="1" stopColor="#eaf1ff" stopOpacity="0"/></radialGradient>
      <linearGradient id="otri-index-ink" x1="190" y1="150" x2="1000" y2="630" gradientUnits="userSpaceOnUse"><stop stopColor="#96b9f4"/><stop offset=".46" stopColor="#2563eb"/><stop offset="1" stopColor="#1e3a6b"/></linearGradient>
    </defs>
    <ellipse cx="600" cy="390" rx="530" ry="345" fill="url(#otri-index-aura)"/>
    <g stroke="#7e9bc3" strokeOpacity=".25">
      <ellipse cx="600" cy="390" rx="355" ry="240" strokeDasharray="2 7"/>
      <ellipse cx="600" cy="390" rx="493" ry="333"/>
    </g>
    <g stroke="url(#otri-index-ink)" strokeLinecap="round">
      {samples.map(({angle,radius},i)=><path key={i} d={`M${pair(polar(angle,251))}L${pair(polar(angle,radius))}`} strokeWidth={i%4===0?2.2:1.1} strokeOpacity={i%4===0?.7:.32}/>) }
    </g>
    <path d={fingerprint} stroke="#5482c7" strokeOpacity=".3" strokeWidth=".8"/>
    <path d={route} stroke="white" strokeWidth="6"/>
    <path className="otri-terrain-trail" d={route} pathLength="100" stroke="#2563eb" strokeWidth="1.8" strokeLinecap="round"/>
    <path className="otri-index-pulse" d={route} pathLength="100" stroke="#1e3a6b" strokeWidth="3" strokeLinecap="round" strokeDasharray="3 97"/>
    {Array.from({length:48},(_,i)=>{
      const angle=i/48*Math.PI*2
      return <path key={i} d={`M${pair(polar(angle,333))}L${pair(polar(angle,i%4===0?344:337))}`} stroke="#6485b1" strokeOpacity={i%4===0?.5:.25} strokeWidth="1"/>
    })}
    {[17,64,105,145].map(n=>{
      const p=polar(samples[n].angle,samples[n].radius-23)
      return <g key={n}><circle cx={p[0]} cy={p[1]} r="7" fill="white"/><circle cx={p[0]} cy={p[1]} r="3" fill="#2563eb"/></g>
    })}
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
      element.style.setProperty('--signal-state', visible ? 'running' : 'paused')
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
      <CourseFingerprint />
      <div className="otri-terrain-veil" />
    </div>
  )
}
