import { useEffect, useRef } from 'preact/compat'
import s from './ContourField.module.css'

// Analytic contours of an imaginary landform, deliberately not race data.
// Built once; pointer movement only updates compositor transforms.
const contours = Array.from({length:22},(_,level)=>{
 const t=(level+1)/22
 return Array.from({length:181},(_,i)=>{
  const a=i/180*Math.PI*2
  const r=(.65+.1*Math.sin(a*3+t*2)+.07*Math.cos(a*5-t))*t
  return `${i?'L':'M'}${(600+Math.cos(a)*640*r+70*Math.sin(t*3)).toFixed(1)},${(270+Math.sin(a)*300*r-50*t).toFixed(1)}`
 }).join(' ')+'Z'
})
export default function ContourField(){
 const root=useRef(null)
 useEffect(()=>{
  const el=root.current,host=el.closest('[data-home-hero]'),media=matchMedia('(prefers-reduced-motion: reduce)');let frame=0
  const reset=()=>{cancelAnimationFrame(frame);el.style.removeProperty('--field-x');el.style.removeProperty('--field-y')}
  const move=e=>{if(media.matches||e.pointerType==='touch')return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const r=host.getBoundingClientRect();el.style.setProperty('--field-x',`${((e.clientX-r.left)/r.width-.5)*14}px`);el.style.setProperty('--field-y',`${((e.clientY-r.top)/r.height-.5)*10}px`)})}
  host.addEventListener('pointermove',move);host.addEventListener('pointerleave',reset);media.addEventListener('change',reset)
  return()=>{reset();host.removeEventListener('pointermove',move);host.removeEventListener('pointerleave',reset);media.removeEventListener('change',reset)}
 },[])
 return <div ref={root} className={s.field} aria-hidden="true"><svg viewBox="0 0 1200 540" fill="none" focusable="false">
  <g className={s.contours}>{contours.map((d,i)=><path d={d} key={i} strokeWidth={i%5===0?1.2:.65}/>)}</g>
  <g className={s.survey}><path d="M90 270H1110M600 45V495" strokeDasharray="2 7"/>{[[90,270],[600,45],[1110,270],[600,495]].map(([x,y])=><path key={`${x}-${y}`} d={`M${x-6} ${y}h12M${x} ${y-6}v12`}/>)}</g>
  <path className={s.trail} d="M226 370C260 359 276 306 325 313S407 389 442 338 389 275 444 232 514 255 529 206 583 130 618 168 649 233 704 224 756 253 800 196 865 178 915 156"/>
  <g className={s.points}><circle cx="226" cy="370" r="5"/><circle cx="915" cy="156" r="5"/></g>
 </svg></div>
}
