import s from './Logo.module.css'
import identity from '../brand/identity.json'

// Closed O, geometric T/R/I, and a rising cut in the R. The wordmark is font-independent.
export function BrandWordmark({ className }) {
 return <svg className={className} viewBox="0 0 180 48" fill="currentColor" aria-hidden="true" focusable="false">
   {identity.wordmark.map((d,i)=><path key={i} fillRule="evenodd" d={d}/>)}
 </svg>
}
export default function Logo({dark=false,href='#top'}){
 return <a href={href} className={`${s.logo} ${dark?s.dark:''}`} aria-label="OTRI home"><BrandWordmark className={s.wordmark}/><span className={s.name}>Open Trail<br/>Running Index</span></a>
}
