import { useEffect, useState } from 'preact/compat'
import { ArrowRight, ArrowUpRight, Mountain, Timer, Activity, GitBranch } from 'lucide-react'
import { scrollBehavior } from '../src/lib/comfort'
import { formatDistance, formatElevation, useUnits } from '../src/lib/units'
import { FieldAction, FieldFrame, FieldLabel, FieldRule } from '../src/field'
import ContourField from '../src/field/ContourField'
import { listRaces } from './apiClient'
import s from './Home.module.css'

const REPO='https://github.com/OTRI-run/otri'
const METHOD=`${REPO}/blob/main/docs/methodology/0.1.0/HOW-OTRI-SCORES.md`
export default function Home({ routeBase='' }) {
  const [races,setRaces]=useState([])
  const units=useUnits()
  const to=hash=>routeBase+hash
  useEffect(()=>{
    let active=true
    listRaces().then(items=>{if(active)setRaces(items.filter(r=>r.is_published))}).catch(()=>{})
    return()=>{active=false}
  },[])
  useEffect(()=>{
    const go=()=>{if(location.hash==='#contribute')document.getElementById('contribute')?.scrollIntoView({behavior:scrollBehavior(),block:'start'})}
    const timeout=setTimeout(go,80);window.addEventListener('hashchange',go)
    return()=>{clearTimeout(timeout);window.removeEventListener('hashchange',go)}
  },[])
  return <div className={s.home} data-entry={routeBase ? 'main' : 'prototype'}>
    <section className={s.hero} data-home-hero>
      <FieldFrame className={s.heroFrame}>
        <FieldRule left="Independent trail performance" right="Open source / Open scoring"/>
        <div className={s.heroStage}>
          <ContourField/>
          <div className={s.heroCopy}>
            <FieldLabel className={s.eyebrow}>The ground changes. The measure is open.</FieldLabel>
            <h1 aria-label="Open Trail Running Index"><span>OPEN TRAIL</span><span>RUNNING <em>INDEX</em><sup>↗</sup></span></h1>
            <p className={s.intro}>Every trail is different.<br/>Give your performance a common measure.</p>
          </div>
          <div className={s.stageCaption}><span>COURSE + FINISH TIME</span><span>ONE EXPLAINED SCORE</span></div>
        </div>
        <div className={s.heroBottom}>
          <div className={s.actions}>
            <FieldAction href={to('#calculator')} number="01" audience="FOR RUNNERS" data-home-action data-audience="runner">Calculate my score</FieldAction>
            <FieldAction href={to('#score')} number="02" audience="FOR RACE ORGANIZERS" tone="signal" data-home-action data-audience="organizer">Score all finishers</FieldAction>
          </div>
          <p className={s.trust}>Free to use <i/> No account needed to score <i/> Open methodology</p>
        </div>
      </FieldFrame>
    </section>

    <section className={s.methodIntro}>
      <div className={s.wrap}>
        <div className={s.sectionHeading}><p className={s.eyebrow}>01 / THE MEASURE</p><h2>Different ground.<br/><em>A common language.</em></h2><p>Time only tells part of the story. OTRI measures the course, then turns your finish time into an explained, reproducible score.</p></div>
        <div className={s.equation}>
          {[[Mountain,'The course','Distance. Climbing. Gradients.'],[Timer,'Your time','The performance you put in.'],[Activity,'Your index','An open measure you can inspect.']].map(([Icon,title,description],i)=><article key={title}><span className={s.stepNumber}>0{i+1}</span><Icon size={30}/><h3>{title}</h3><p>{description}</p></article>)}
        </div>
        <a className={s.textLink} href={METHOD}>Follow the calculation <ArrowUpRight size={18}/></a>
      </div>
    </section>

    <section className={s.organizer}><div className={`${s.wrap} ${s.organizerGrid}`}>
      <div><p className={s.eyebrow}>02 / THE WHOLE FIELD</p><h2>A finish line.<br/><em>A score for everyone.</em></h2><p className={s.lead}>Give your runners another way to understand their race. Upload the route and results. Review the scores, download them, or publish a race page.</p><a className={s.button} href={to('#score')}>Score your race <ArrowUpRight size={20}/></a></div>
      <div className={s.fileFlow}>
        <div><span>01</span><strong>Course GPX</strong><small>The ground they covered</small></div>
        <div><span>02</span><strong>Results file</strong><small>Names and finish times</small></div>
        <div className={s.flowResult}><Activity/><strong>Every finisher scored.</strong></div>
        <a href={to('#score?example=1')}>Explore the sample race <ArrowRight size={17}/></a>
      </div>
    </div></section>

    {races.length>0&&<section id="races-preview" className={s.raceSection}><div className={s.wrap}>
      <div className={s.headingRow}><div><p className={s.eyebrow}>OUT ON THE TRAILS</p><h2>Results with context.</h2></div><a className={s.textLink} href={to('#races')}>All races <ArrowUpRight size={18}/></a></div>
      <div className={s.races}>{races.slice(0,4).map(race=><a key={race.race_id} href={to(`#races/${encodeURIComponent(race.race_id)}`)} className={s.race}>
        <div><time>{race.event_date}</time><h3>{race.event_name}</h3><p>{race.course_name} {race.event_location&&`/ ${race.event_location}`}</p></div>
        <div className={s.raceFacts}><span>{formatDistance(race.distance_km,units)} / {formatElevation(race.elevation_gain_m,units,{sign:'+'})}</span><small>{race.finisher_count??0} finishers {race.is_demo&&'· DEMO DATA'} {race.is_vertical&&'· VERTICAL'}</small></div><ArrowUpRight size={24}/>
      </a>)}</div>
    </div></section>}

    <section id="contribute" className={s.openSection}><div className={s.wrap}>
      <div className={s.openTop}><p className={s.eyebrow}>03 / NO BLACK BOX</p><GitBranch size={28}/></div>
      <h2>Open from<br/><em>start to finish.</em></h2>
      <div className={s.openBottom}><p>Independent. Open source. Every score has a method and a model version behind it. Inspect it, question it, help make it better.</p><div className={s.links}>{[[METHOD,'How the score works'],[`${REPO}/blob/main/METHODOLOGY.md`,'The methodology'],[`${REPO}/blob/main/DATA_POLICY.md`,'Our data policy'],[`${REPO}/blob/main/CONTRIBUTING.md`,'Contribute to OTRI']].map(([href,label])=><a href={href} key={label}>{label}<ArrowUpRight size={18}/></a>)}</div></div>
    </div></section>
  </div>
}
