import { useEffect, useRef } from 'preact/compat'
import s from './TrailSculpture.module.css'

// An abstract folded trail, not a measured course or a sample result.
const ridge=[[34,303],[97,279],[143,291],[190,205],[239,229],[284,126],[324,153],[370,69],[415,114],[453,180],[505,194],[566,255]]
const path=points=>points.map(([x,y],i)=>`${i?'L':'M'}${x} ${y}`).join(' ')
export default function TrailSculpture(){
 const root=useRef(null)
 useEffect(()=>{
  const element=root.current,media=matchMedia('(prefers-reduced-motion: reduce)');let frame=0
  const move=e=>{if(media.matches||e.pointerType==='touch')return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const r=element.getBoundingClientRect();element.style.setProperty('--turn',`${((e.clientX-r.left)/r.width-.5)*6}deg`);element.style.setProperty('--lift',`${((e.clientY-r.top)/r.height-.5)*-10}px`)})}
  const reset=()=>{cancelAnimationFrame(frame);element.style.removeProperty('--turn');element.style.removeProperty('--lift')}
  element.addEventListener('pointermove',move);element.addEventListener('pointerleave',reset);media.addEventListener('change',reset)
  return()=>{cancelAnimationFrame(frame);element.removeEventListener('pointermove',move);element.removeEventListener('pointerleave',reset);media.removeEventListener('change',reset)}
 },[])
 return <div className={s.instrument} ref={root} aria-hidden="true">
   <div className={s.instrumentTop}><span>THE SHAPE OF EFFORT</span><span>OTRI / FIELD NOTES</span></div>
   <svg className={s.sculpture} viewBox="0 0 620 435" fill="none" focusable="false">
     <defs><linearGradient id="ribbon-face" x1="100" y1="90" x2="520" y2="390" gradientUnits="userSpaceOnUse"><stop stopColor="#b6a3f2"/><stop offset=".55" stopColor="#7a54d3"/><stop offset="1" stopColor="#412179"/></linearGradient><linearGradient id="ribbon-top" x1="50" y1="230" x2="450" y2="80" gradientUnits="userSpaceOnUse"><stop stopColor="#f4efff"/><stop offset="1" stopColor="#d3c5f4"/></linearGradient></defs>
     <ellipse cx="316" cy="382" rx="225" ry="15" fill="#4e2a8920"/>
     <path d={`${path(ridge)} L566 326 L34 374 Z`} fill="url(#ribbon-face)"/>
     <path d={`${path(ridge)} ${[...ridge].reverse().map(([x,y])=>`L${x+30} ${y-27}`).join(' ')} Z`} fill="url(#ribbon-top)" stroke="#8564c4" strokeWidth=".7"/>
     {ridge.slice(1,-1).map(([x,y],i)=><path key={x} d={`M${x} ${y}V${374-(x-34)*48/532}`} stroke={i%2?'#f2eaff':'#24123f'} strokeOpacity=".18"/>)}
     {[.2,.4,.6,.8].map(t=><path key={t} d={path(ridge.map(([x,y])=>[x,y+(374-(x-34)*48/532-y)*t]))} stroke="#eee5ff" strokeWidth=".8" strokeOpacity=".4"/>)}
     <path d={path(ridge.map(([x,y])=>[x+15,y-13]))} stroke="#593599" strokeWidth="2"/>
     {[0,5,7,11].map(i=><g key={i}><circle cx={ridge[i][0]+15} cy={ridge[i][1]-13} r="5" fill="#fff" stroke="#593599" strokeWidth="2"/></g>)}
     <path d="M49 290V398H585M385 58V395" stroke="#7c6a9933" strokeDasharray="3 5"/>
     {Array.from({length:24},(_,i)=><path key={i} d={`M${49+i*23} 395v${i%4===0?9:5}`} stroke="#8f7aab" strokeWidth=".7"/>)}
   </svg>
   <div className={s.instrumentBottom}><span>COURSE</span><span>+ TIME</span><span>= INDEX ↗</span></div>
 </div>
}
