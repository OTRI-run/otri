import './Flag.css'
import countries from 'i18n-iso-countries'
import 'flag-icons/css/flag-icons.min.css'

// Results files carry 3-letter codes. Most are ISO 3166-1 alpha-3; timing exports sometimes use
// the sports (IOC) codes instead, which differ for a few countries. Only IOC codes that are not
// themselves valid ISO codes are mapped here, so an ISO file is never misread.
const IOC_TO_ISO = {
  GER: 'DEU', NED: 'NLD', SUI: 'CHE', DEN: 'DNK', POR: 'PRT', RSA: 'ZAF', GRE: 'GRC', CRO: 'HRV', BUL: 'BGR',
  INA: 'IDN', MAS: 'MYS', PHI: 'PHL', SIN: 'SGP', TPE: 'TWN', VIE: 'VNM', CHI: 'CHL', URU: 'URY', PAR: 'PRY',
  ESA: 'SLV', GUA: 'GTM', HON: 'HND', NCA: 'NIC', CRC: 'CRI', PUR: 'PRI', BAR: 'BRB', TRI: 'TTO', ZIM: 'ZWE',
  ZAM: 'ZMB', TAN: 'TZA', NGR: 'NGA', ALG: 'DZA', LIB: 'LBN', KSA: 'SAU', UAE: 'ARE', IRI: 'IRN', OMA: 'OMN',
  KUW: 'KWT', NEP: 'NPL', SRI: 'LKA', BAN: 'BGD', MGL: 'MNG', MYA: 'MMR', CAM: 'KHM', ANG: 'AGO', BOT: 'BWA',
  MAW: 'MWI', MAD: 'MDG', MRI: 'MUS', SEY: 'SYC', TOG: 'TGO', NIG: 'NER', BUR: 'BFA', CHA: 'TCD', GBS: 'GNB',
  GEQ: 'GNQ', LES: 'LSO', SUD: 'SDN', SOL: 'SLB', FIJ: 'FJI', TGA: 'TON', VAN: 'VUT', SAM: 'WSM', PLE: 'PSE',
  LAT: 'LVA', SLO: 'SVN', MON: 'MCO', ISV: 'VIR', IVB: 'VGB', CAY: 'CYM', ARU: 'ABW', ANT: 'ATG', SKN: 'KNA',
  VIN: 'VCT', HAI: 'HTI', BIZ: 'BLZ', BAH: 'BHS', BER: 'BMU',
}

/** ISO alpha-2 code for a 3-letter country code from a results file, or null. */
export function alpha2For(code) {
  if (!code) return null
  const upper = String(code).trim().toUpperCase()
  if (upper.length !== 3) return null
  const iso = countries.alpha3ToAlpha2(upper) ?? countries.alpha3ToAlpha2(IOC_TO_ISO[upper] ?? '')
  return iso ? iso.toLowerCase() : null
}

export function countryName(code) {
  const alpha2 = alpha2For(code)
  return alpha2 ? countries.getName(alpha2.toUpperCase(), 'en', { select: 'official' }) ?? code : code
}

/**
 * A country flag (flag-icons, MIT) for a 3-letter code, with the code as text. Unknown codes
 * show the text only, so nothing is ever guessed.
 */
export default function Flag({ code, showCode = true, className = '' }) {
  if (!code) return null
  const alpha2 = alpha2For(code)
  const upper = String(code).trim().toUpperCase()
  return (
    <span className={`src-components-flag-flag-span-1 ${className}`} title={countryName(upper)}>
      {alpha2 && <span className={`fi fi-${alpha2} src-components-flag-flag-span-2`} aria-hidden="true" />}
      {showCode && <span className="src-components-flag-flag-span-3">{upper}</span>}
    </span>
  )
}
