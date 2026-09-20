import { useEffect, useRef } from 'react'
import './topographic-hero.css'

// Decorative terrain, not a measured course. Fixed geometry keeps renders deterministic.
function contour(cx, cy, radius, phase) {
  return Array.from({ length: 97 }, (_, i) => {
    const angle = (i / 96) * Math.PI * 2
    const relief = 1 + .09 * Math.sin(3 * angle + phase) + .045 * Math.cos(5 * angle - phase)
    const x = cx + Math.cos(angle) * radius * relief
    const y = cy + Math.sin(angle) * radius * relief * .78
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ') + ' Z'
}

const west = Array.from({ length: 16 }, (_, i) => contour(60, 365, 65 + i * 27, .6))
const east = Array.from({ length: 18 }, (_, i) => contour(1350, 500, 45 + i * 26, 2.1))
const trail = 'M 1210 20 C 1190 100 1320 105 1320 175 S 1160 215 1180 300 S 1355 350 1310 430 S 1140 470 1180 555 S 1350 615 1270 705 S 1090 775 1140 900'

export default function TopographicHero() {
  const ref = useRef(null)

  useEffect(() => {
    const element = ref.current
    const hero = element?.parentElement
    if (!hero) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let visible = true

    const paint = () => {
      frame = 0
      if (!visible || motion.matches) return
      const rect = hero.getBoundingClientRect()
      const progress = Math.min(1, Math.max(0, (68 - rect.top) / Math.max(1, rect.height * .75)))
      element.style.setProperty('--terrain-far', `${progress * 24}px`)
      element.style.setProperty('--terrain-near', `${progress * -36}px`)
      element.style.setProperty('--trail-hidden', `${72 * (1 - progress)}`)
    }
    const schedule = () => {
      if (!frame && visible && !motion.matches) frame = requestAnimationFrame(paint)
    }
    const configure = () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
      frame = 0
      if (motion.matches) {
        element.style.removeProperty('--terrain-far')
        element.style.removeProperty('--terrain-near')
        element.style.removeProperty('--trail-hidden')
      } else {
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
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={ref} className="otri-terrain" aria-hidden="true">
      <svg className="otri-terrain-layer otri-terrain-far" viewBox="0 0 1440 900" preserveAspectRatio="none" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="1">
          {west.map((d, i) => <path key={i} d={d} vectorEffect="non-scaling-stroke" strokeWidth={i % 4 === 0 ? 1.6 : .8} />)}
        </g>
      </svg>
      <svg className="otri-terrain-layer otri-terrain-near" viewBox="0 0 1440 900" preserveAspectRatio="none" focusable="false">
        <g fill="none" stroke="currentColor">
          {east.map((d, i) => <path key={i} d={d} vectorEffect="non-scaling-stroke" strokeWidth={i % 4 === 0 ? 1.6 : .8} />)}
        </g>
        <path d={trail} fill="none" stroke="#2563eb" strokeOpacity=".12" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        <path className="otri-terrain-trail" d={trail} pathLength="100" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="otri-terrain-veil" />
    </div>
  )
}
