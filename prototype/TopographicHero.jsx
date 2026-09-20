import { useEffect, useRef } from 'react'
import './topographic-hero.css'

// Decorative course geometry, not race data. Isolines are sampled from one
// continuous ridge field, with a small elevation projection for depth.
const grid = 72
function height(x,y) {
  const ridge = .22*Math.sin(x*3.2) - .12*x
  const spine = Math.exp(-((y-ridge)**2)/.14 - x*x/.95)
  const detail = .045*Math.sin(x*17+y*9) + .025*Math.cos(y*23-x*7)
  return Math.max(0, spine + detail*spine)
}
function project(x,y,z) { return [600+x*370,390+y*220-z*65] }
const pair = ([x,y])=>`${x.toFixed(2)},${y.toFixed(2)}`
const levels = Array.from({length:23},(_,i)=>.055+i*.041)
// Marching squares yields actual equal-height contours instead of a decorative mesh.
const contours = levels.map((level)=>{
  const segments=[]
  for(let row=0;row<grid;row++) for(let col=0;col<grid;col++) {
    const x=-1.55+col*3.1/grid, y=-1.1+row*2.2/grid
    const corners=[[x,y],[x+3.1/grid,y],[x+3.1/grid,y+2.2/grid],[x,y+2.2/grid]]
    const values=corners.map(([u,v])=>height(u,v))
    const cuts=[]
    for(let edge=0;edge<4;edge++) {
      const next=(edge+1)%4, a=values[edge], b=values[next]
      if((a<level)===(b<level)) continue
      const t=(level-a)/(b-a)
      cuts.push(project(corners[edge][0]+t*(corners[next][0]-corners[edge][0]),corners[edge][1]+t*(corners[next][1]-corners[edge][1]),level))
    }
    for(let j=0;j+1<cuts.length;j+=2) segments.push(`M${pair(cuts[j])}L${pair(cuts[j+1])}`)
  }
  return segments.join(' ')
})
const routePoints=Array.from({length:200},(_,i)=>{
  const t=i/199, x=-1.25+2.5*t
  const y=.46*Math.cos(t*Math.PI*2)+.17*Math.sin(t*Math.PI*9)
  return project(x,y,height(x,y))
})
const trail=routePoints.map((p,i)=>`${i?'L':'M'}${pair(p)}`).join(' ')
function TerrainMap() {
  return <svg className="otri-terrain-layer otri-terrain-near" viewBox="0 0 1200 700" fill="none" aria-hidden="true" focusable="false">
    <defs><pattern id="otri-index-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M20 17V23M17 20H23" stroke="#8ca9cd" strokeWidth=".7" opacity=".3" /></pattern></defs>
    <rect x="70" y="140" width="1060" height="460" fill="url(#otri-index-grid)" />
    <g stroke="#2563eb" strokeLinejoin="round">
      {contours.map((d,i)=><path key={i} d={d} strokeOpacity={i%5===0?.46:.23} strokeWidth={i%5===0?1.5:.8} />)}
    </g>
    <path d={trail} stroke="white" strokeWidth="6" strokeLinecap="round" />
    <path d={trail} stroke="#2563eb" strokeWidth="2" strokeOpacity=".2" />
    <path className="otri-terrain-trail" d={trail} pathLength="100" stroke="#2563eb" strokeWidth="2.3" strokeLinecap="round" />
    {[0,45,100,155,199].map((n,i)=>{
      const [cx,cy]=routePoints[n]
      return <g key={i}><circle cx={cx} cy={cy} r="8" fill="white" fillOpacity=".7" /><circle cx={cx} cy={cy} r="3.5" fill="white" stroke="#2563eb" strokeWidth="1.5" /></g>
    })}
    <g stroke="#7295bd" strokeOpacity=".4" strokeWidth=".8">
      <path d="M95 265v-35h35M1105 265v-35h-35M95 505v35h35M1105 505v35h-35" />
      <path d="M555 565H645M600 558v14" />
    </g>
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
      <TerrainMap />
      <div className="otri-terrain-veil" />
    </div>
  )
}
