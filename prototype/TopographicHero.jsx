import { useEffect, useRef } from 'react'
import './topographic-hero.css'

// A synthetic elevation surface, drawn as ordered survey profiles. Decorative
// artwork only: neither the geometry nor the moving trace represents race data.
const pair=([x,y])=>`${x.toFixed(2)},${y.toFixed(2)}`
function height(x,z) {
  const peak=(cx,cz,wx,wz,h)=>h*Math.exp(-((x-cx)**2/wx+(z-cz)**2/wz))
  const massif=peak(.5,.4,.075,.14,1.05)+peak(.19,.54,.028,.1,.78)+peak(.81,.54,.028,.1,.78)
  const rock=.9+.06*Math.sin(x*51+z*6)+.025*Math.sin(x*113-z*13)
  return massif*rock
}
function surface(x,z) {return [720+(x-.5)*(1050+z*1150),255+z*420-height(x,z)*240]}
const profiles=Array.from({length:32},(_,i)=>{
  const z=i/31
  const points=Array.from({length:301},(_,j)=>surface(-.5+j/300*2,z))
  const d=points.map((p,j)=>`${j?'L':'M'}${pair(p)}`).join(' ')
  return {d,fill:d+`L${pair([points.at(-1)[0],850])}L${pair([points[0][0],850])}Z`,z}
})
const routePoints=Array.from({length:241},(_,i)=>{
  const t=i/240, x=.17+.68*t
  const z=.88-.34*Math.sin(t*Math.PI)+.07*Math.sin(t*19)
  return surface(x,z)
})
const route=routePoints.map((p,i)=>`${i?'L':'M'}${pair(p)}`).join(' ')
function TerrainLab() {
  return <svg className="otri-terrain-layer otri-terrain-near" viewBox="0 0 1440 800" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="otri-survey-line" x1="120" y1="300" x2="1320" y2="500" gradientUnits="userSpaceOnUse"><stop stopColor="#9cb2cc"/><stop offset=".5" stopColor="#7d9aba"/><stop offset="1" stopColor="#9cb2cc"/></linearGradient>
      <linearGradient id="otri-survey-fill" x1="720" y1="160" x2="720" y2="780" gradientUnits="userSpaceOnUse"><stop stopColor="#edf2f8"/><stop offset="1" stopColor="#f4f7fb"/></linearGradient>
    </defs>
    {profiles.map(({d,fill},i)=><g key={i}><path d={fill} fill="url(#otri-survey-fill)"/><path d={d} stroke="url(#otri-survey-line)" strokeWidth={i%5===0?1.4:.65} strokeOpacity={i%5===0?.85:.5}/></g>)}
    <path d={route} stroke="#2563eb" strokeWidth="16" strokeOpacity=".08"/>
    <path d={route} stroke="#3b82f6" strokeWidth="7" strokeOpacity=".18"/>
    <path className="otri-terrain-trail" d={route} pathLength="100" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round"/>
    <path className="otri-index-pulse" d={route} pathLength="100" stroke="#1d4ed8" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 98"/>
    {[0,50,125,190,240].map(n=>{
      const [cx,cy]=routePoints[n]
      return <g key={n}><circle cx={cx} cy={cy} r="9" fill="#60a5fa" fillOpacity=".1"/><circle cx={cx} cy={cy} r="3" fill="#ffffff" stroke="#3b82f6" strokeWidth="1.5"/></g>
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
      <TerrainLab />
      <div className="otri-terrain-veil" />
    </div>
  )
}
