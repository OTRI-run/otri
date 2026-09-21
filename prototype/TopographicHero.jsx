import { useEffect, useRef } from 'react'
import './topographic-hero.css'

// An illustrative height field projected into an isometric landscape, not race data.
const size = 26
function elevation(x, y) {
  const peak = (cx, cy, spread, height) => height * Math.exp(-((x-cx)**2 + (y-cy)**2) / spread)
  return peak(.32,.36,.035,1.05) + peak(.7,.55,.055,.72) + peak(.33,.82,.045,.4)
}
function point(x, y) {
  return [300 + (x-y)*420, 225 + (x+y)*210 - elevation(x,y)*245]
}
const pair = p => p.map(n => n.toFixed(2)).join(',')
const tiles = []
for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
  const u=x/size, v=y/size, step=1/size
  const slope=(elevation(u+.01,v)-elevation(u,v))/.01
  const light=Math.max(78,Math.min(97,91-slope*3))
  tiles.push({ depth:x+y, points:[[u,v],[u+step,v],[u+step,v+step],[u,v+step]].map(([a,b])=>pair(point(a,b))).join(' '), fill:`hsl(215 72% ${light}%)` })
}
tiles.sort((a,b)=>a.depth-b.depth)
const lines = Array.from({length:size+1},(_,i)=>Array.from({length:81},(_,j)=>`${j?'L':'M'}${pair(point(j/80,i/size))}`).join(' '))
const crossLines = Array.from({length:14},(_,i)=>Array.from({length:81},(_,j)=>`${j?'L':'M'}${pair(point(i/13,j/80))}`).join(' '))
// The route is sampled on the same surface so its switchbacks hug the slopes.
const trailPoints = Array.from({length:161},(_,i)=>{
  const t=i/160
  return point(.76-.44*t+.1*Math.sin(t*Math.PI*6)*Math.sin(t*Math.PI), .94-.58*t)
})
const trail = trailPoints.map((p,i)=>`${i?'L':'M'}${pair(p)}`).join(' ')
function Mountain({near=false}) {
  return <svg className={`otri-terrain-layer ${near?'otri-terrain-near':'otri-terrain-far'}`} viewBox="0 0 600 750" fill="none" aria-hidden="true" focusable="false">
    <ellipse cx="300" cy="590" rx="260" ry="58" fill="#bed5f2" opacity=".2" />
    <g strokeLinejoin="round">
      {tiles.map((tile,i)=><polygon key={i} points={tile.points} fill={tile.fill} stroke={tile.fill} strokeWidth=".5" />)}
      {lines.map((d,i)=><path key={i} d={d} stroke="#5689c9" strokeOpacity={i%4===0?'.65':'.32'} strokeWidth={i%4===0?'1.3':'.7'} />)}
      {crossLines.map((d,i)=><path key={i} d={d} stroke="#5689c9" strokeOpacity=".18" strokeWidth=".65" />)}
    </g>
    <path d={trail} stroke="white" strokeWidth="7" strokeLinecap="round" opacity=".9" />
    <path d={trail} stroke="#2563eb" strokeOpacity=".25" strokeWidth="3" />
    <path className="otri-terrain-trail" d={trail} pathLength="100" stroke={near?'#2563eb':'#0891b2'} strokeWidth="3" strokeLinecap="round" />
    {[trailPoints[0],trailPoints[160]].map(([cx,cy],i)=><g key={i}><circle cx={cx} cy={cy} r="6" fill="white" stroke="#2563eb" strokeWidth="2" /><circle cx={cx} cy={cy} r="2" fill="#2563eb" /></g>)}
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
      element.style.setProperty('--terrain-tilt', `${pointerY * 2}deg`)
      element.style.setProperty('--terrain-far', `${progress * 60}px`)
      element.style.setProperty('--terrain-near', `${progress * -85}px`)
      element.style.setProperty('--trail-hidden', `${18 * (1 - progress)}`)
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
        element.style.removeProperty('--terrain-far')
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
      <Mountain near />
      <div className="otri-terrain-veil" />
      <div className="otri-terrain-survey"><span>+ TERRAIN / PERFORMANCE</span><span>+ OPEN TRAIL RUNNING INDEX</span></div>
    </div>
  )
}
