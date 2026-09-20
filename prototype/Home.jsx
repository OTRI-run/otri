import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, Calculator, GitBranch, Mountain, Timer, Upload, ShieldCheck, Users } from 'lucide-react'
import { scrollBehavior } from '../src/lib/comfort'
import { formatDistance, formatElevation, useUnits } from '../src/lib/units'
import TopographicHero from './TopographicHero'
import { listRaces } from './apiClient'
import s from './Home.module.css'

const GITHUB_URL = 'https://github.com/OTRI-run/otri'
const DOCS = {
  how: `${GITHUB_URL}/blob/main/docs/methodology/0.1.0/HOW-OTRI-SCORES.md`,
  methodology: `${GITHUB_URL}/blob/main/METHODOLOGY.md`,
  dataPolicy: `${GITHUB_URL}/blob/main/DATA_POLICY.md`,
}

export default function Home() {
  // #contribute (the footer's link or an address someone shared) is the block below.
  useEffect(() => {
    const go = () => {
      if (window.location.hash === '#contribute') document.getElementById('contribute')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
    }
    const timer = setTimeout(go, 80) // after the page has laid out
    window.addEventListener('hashchange', go)
    return () => { clearTimeout(timer); window.removeEventListener('hashchange', go) }
  }, [])
  const [races, setRaces] = useState([])
  const units = useUnits()
  useEffect(() => {
    let cancelled = false
    listRaces().then(items => { if (!cancelled) setRaces(items.filter(race => race.is_published)) }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  return <div className={s.home}>
    <section className={s.hero} data-home-hero>
      <TopographicHero />
      <div className={s.heroContent}>
        <p className={s.heroLabel}>TRAIL RUNNING / OPEN PERFORMANCE INDEX</p>
        <h1 aria-label="Open Trail Running Index">OPEN TRAIL<br /><span>RUNNING INDEX</span></h1>
        <p className={s.intro}>Your trail performance, measured.<br /> One score from your course and finish time.</p>
        <div className={s.actions}>
          {[
            { Icon: Calculator, number: '01', audience: 'For runners', title: 'Calculate my score', text: 'Your course + your finish time.', href: '#calculator', cta: 'Start calculating' },
            { Icon: Upload, number: '02', audience: 'For race organizers', title: 'Score all finishers', text: 'Your course + your results file.', href: '#score', cta: 'Upload race files' },
          ].map(({Icon,number,audience,title,text,href,cta})=><a href={href} key={href} className={s.action} data-home-action data-audience={number === '01' ? 'runner' : 'organizer'}>
            <span className={s.actionTop}><span>{number} / {audience}</span><Icon size={19} aria-hidden="true" /></span>
            <span className={s.actionTitle}>{title}</span>
            <span className={s.actionDescription}>{text}</span>
            <span className={s.actionButton}>{cta}<ArrowRight size={21} aria-hidden="true" /></span>
          </a>)}
        </div>
        <p className={s.trust}>Free to use <span>·</span> No sign-up to score <span>·</span> Open methodology</p>
      </div>
    </section>

    <section className={s.section}>
      <div className={s.wrap}>
        <div className={s.sectionHead}><p className={s.kicker}>01 / THE IDEA</p><h2>Different courses.<br /><em>A common scale.</em></h2><p>A finish time needs context. OTRI measures the course, then puts your performance on an open scoring scale.</p></div>
        <div className={s.steps}>
          {[[Mountain,'01','Your course','Distance, climb and gradients, measured from the GPX route.'],[Timer,'02','Your time','A finish time you have run, or a target you want to explore.'],[GitBranch,'03','Your score','A model-based score with its calculation and model version explained.']].map(([Icon,n,title,text])=><article key={n} className={s.step}>
            <div className={s.stepTop}><Icon size={25} aria-hidden="true"/><span>{n}</span></div><h3>{title}</h3><p>{text}</p>
          </article>)}
        </div>
        <a className={s.textLink} href={DOCS.how}>See how the score is calculated <ArrowUpRight size={16}/></a>
      </div>
    </section>

    <section className={`${s.section} ${s.organizer}`}>
      <div className={`${s.wrap} ${s.split}`}>
        <div><p className={s.kicker}>02 / FOR ORGANIZERS</p><h2>One upload.<br />Every finisher scored.</h2><p className={s.lead}>Bring your course GPX and results spreadsheet. Download the scores, share them with your runners, or publish a race page.</p>
          <div className={s.buttonRow}><a className={s.button} href="#score">Score my race <ArrowRight size={17}/></a><a className={s.textLink} href="#score?example=1">Try the sample race <ArrowUpRight size={16}/></a></div>
        </div>
        <div className={s.workflow}>
          {[[Upload,'Bring the files','Course GPX + results in CSV or Excel.'],[ShieldCheck,'Check the results','Review scores and any file or course-quality notes.'],[Users,'Choose what to share','Download first. Create an organizer account when you want to publish.']].map(([Icon,title,text])=><article key={title}><Icon size={23}/><div><h3>{title}</h3><p>{text}</p></div></article>)}
        </div>
      </div>
    </section>

    {races.length>0 && <section id="races-preview" className={s.section}><div className={s.wrap}>
      <div className={s.row}><p className={s.kicker}>SCORED RACES</p><a href="#races" className={s.textLink}>All races <ArrowRight size={16}/></a></div>
      <h2>Every number explained.</h2>
      <p className={s.lead}>Published results, scored with the same open model. Open a race to see its leaderboard.</p>
      <div className={s.races}>{races.slice(0,4).map(race=><a key={race.race_id} href={`#races/${encodeURIComponent(race.race_id)}`} className={s.race}>
        <div className={s.row}><time>{race.event_date}</time><ArrowUpRight size={18}/></div>
        {race.is_demo && <span className={s.badge}>DEMO DATA</span>}{race.is_vertical && <span className={s.badge}>VERTICAL</span>}
        {['upcoming','awaiting_results'].includes(race.listing_status) && <span className={s.badge}>{race.listing_status === 'upcoming' ? 'UPCOMING' : 'AWAITING RESULTS'}</span>}
        <h3>{race.event_name}</h3><p>{race.course_name}</p><p>{race.event_location ?? race.event_country}</p>
        <p className={s.metrics}>{formatDistance(race.distance_km,units)} · {formatElevation(race.elevation_gain_m,units,{sign:'+'})}</p>
        {race.has_gpx && <span className={s.badge}>VERIFIED COURSE</span>}
        <span className={s.raceFoot}>{race.finisher_count ?? 0} finishers <span>Leaderboard →</span></span>
      </a>)}</div>
    </div></section>}

    <section className={`${s.section} ${s.method}`}><div className={s.wrap}>
      <p className={s.kicker}>03 / OPEN BY DESIGN</p><h2>Built in the open.</h2>
      <div className={s.documents}>
        {[[DOCS.how,'How a score is made','The calculation, its assumptions and its limits.'],[DOCS.methodology,'Versioned model','Every score identifies its model version.'],[DOCS.dataPolicy,'Data policy','Which results OTRI uses, and why.'],[GITHUB_URL,'Source code','Scoring, course measurement and this website.']].map(([href,title,text])=><a key={title} href={href}><h3>{title}<ArrowUpRight size={16}/></h3><p>{text}</p></a>)}
      </div>
      <div id="contribute" className={s.contribute}><div><p className={s.kicker}>CONTRIBUTE</p><h3>Better courses.<br />Better measurement.</h3><p>OTRI is independent and open source. Help test the model, improve course measurement, or report a result that looks wrong.</p><a href={`${GITHUB_URL}/blob/main/CONTRIBUTING.md`} className={s.textLink}>How to contribute <ArrowUpRight size={16}/></a></div>
        <div className={s.contributionLinks}>{[[DOCS.how,'Challenge the model'],[`${GITHUB_URL}/blob/main/docs/methodology/course-measurement/REAL-WORLD-COURSE-MEASUREMENT-SPEC.md`,'Improve course measurement'],[`${GITHUB_URL}/issues`,'Report an issue'],[GITHUB_URL,'Contribute code']].map(([href,label])=><a key={label} href={href}>{label}<ArrowUpRight size={18}/></a>)}</div>
      </div>
    </div></section>
    <section className={s.final}><div className={s.wrap}><p className={s.kicker}>YOUR NEXT START LINE</p><h2>Your course. Your time.<br />Your next score.</h2><div className={s.buttonRow}><a href="#calculator" className={s.button}>Calculate my score <ArrowRight size={18}/></a><a href="#score" className={s.textLink}>Score my race <ArrowRight size={18}/></a></div></div></section>
  </div>
}
