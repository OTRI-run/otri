import { createRoot } from 'preact/compat/client'
import { ArrowUpRight } from 'lucide-react'
import Logo from './components/Logo'
import Home from '../prototype/Home'
import ErrorBoundary from './components/ErrorBoundary'
import { initMonitoring } from './lib/monitoring'
import shell from '../prototype/Shell.module.css'
import './styles.css'
initMonitoring()
function Landing(){return <><header className={shell.header}><div className={shell.headerInner}><Logo href='./'/><nav className={shell.desktopNav} aria-label="Main navigation"><a className={shell.navLink} href="./prototype/#calculator">Calculator</a><a className={shell.navLink} href="./prototype/#score">Score a race</a><a className={shell.navLink} href="./prototype/#races">Races</a><a className={shell.navLink} href="./prototype/#runners">Runners</a><a className={shell.navLink} href="./prototype/#faq">FAQ</a><a className={shell.organizer} href="./prototype/organizer/">For organizers <ArrowUpRight size={14}/></a></nav><a className={`${shell.organizer} ${shell.mobileOrganizer}`} href="./prototype/">Open OTRI <ArrowUpRight size={14}/></a></div></header><main><Home routeBase="./prototype/"/></main><footer className={shell.footer}><div className={shell.footerInner}><Logo href='./'/><nav><a href="https://github.com/OTRI-run/otri">Source code</a><a href="./prototype/#media">Media & logo</a><a href="#contribute">Contribute</a><a href="https://github.com/OTRI-run/otri/blob/main/PRIVACY.md">Privacy</a><a href="mailto:hello@otri.run">hello@otri.run</a></nav><p>OPEN. TRANSPARENT. REPRODUCIBLE. INDEPENDENT.</p></div></footer></>}
createRoot(document.getElementById('root')).render(<ErrorBoundary home='./'><Landing/></ErrorBoundary>)
