// Towns and areas where trail races are held, offered as suggestions while an organizer types an
// event's location (a <datalist>: the field stays free text). Each carries its country, so choosing
// "Chamonix" can fill in France when the country is still empty. A place to start typing from, not
// a gazetteer: anything else is simply typed.
export const PLACES = [
  // Thailand and South-East Asia
  ['Chiang Mai', 'THA'], ['Chiang Rai', 'THA'], ['Chiang Dao', 'THA'], ['Doi Inthanon', 'THA'], ['Mae Rim', 'THA'], ['Pai', 'THA'], ['Mae Hong Son', 'THA'], ['Nan', 'THA'],
  ['Phuket', 'THA'], ['Krabi', 'THA'], ['Khao Yai', 'THA'], ['Pak Chong', 'THA'], ['Kanchanaburi', 'THA'], ['Hua Hin', 'THA'], ['Ratchaburi', 'THA'], ['Phetchabun', 'THA'],
  ['Khao Kho', 'THA'], ['Loei', 'THA'], ['Betong', 'THA'], ['Koh Samui', 'THA'], ['Bangkok', 'THA'], ['Sapa', 'VNM'], ['Da Lat', 'VNM'], ['Moc Chau', 'VNM'], ['Siem Reap', 'KHM'],
  ['Luang Prabang', 'LAO'], ['Kota Kinabalu', 'MYS'], ['Cameron Highlands', 'MYS'], ['Penang', 'MYS'], ['Singapore', 'SGP'], ['Lombok', 'IDN'], ['Bromo', 'IDN'], ['Bali', 'IDN'],
  ['Baguio', 'PHL'], ['Cebu', 'PHL'],
  // East and South Asia, Oceania
  ['Hong Kong', 'HKG'], ['Lantau', 'HKG'], ['Sai Kung', 'HKG'], ['Taipei', 'TWN'], ['Fujiyoshida', 'JPN'], ['Hakuba', 'JPN'], ['Nagano', 'JPN'], ['Jeju', 'KOR'], ['Seoul', 'KOR'],
  ['Tengchong', 'CHN'], ['Lijiang', 'CHN'], ['Ninghai', 'CHN'], ['Chongli', 'CHN'], ['Pokhara', 'NPL'], ['Kathmandu', 'NPL'], ['Manali', 'IND'], ['Katoomba', 'AUS'],
  ['Blue Mountains', 'AUS'], ['Bright', 'AUS'], ['Hobart', 'AUS'], ['Rotorua', 'NZL'], ['Queenstown', 'NZL'], ['Wanaka', 'NZL'],
  // Alps and France
  ['Chamonix', 'FRA'], ['Annecy', 'FRA'], ['Grenoble', 'FRA'], ['Millau', 'FRA'], ['Val d’Isère', 'FRA'], ['Les Deux Alpes', 'FRA'], ['Briançon', 'FRA'], ['Nice', 'FRA'],
  ['Saint-Étienne', 'FRA'], ['Lyon', 'FRA'], ['Font-Romeu', 'FRA'], ['Corte', 'FRA'], ['Saint-Denis (La Réunion)', 'REU'], ['Courmayeur', 'ITA'], ['Cortina d’Ampezzo', 'ITA'],
  ['Aosta', 'ITA'], ['Canazei', 'ITA'], ['Limone sul Garda', 'ITA'], ['Bolzano', 'ITA'], ['Grindelwald', 'CHE'], ['Zermatt', 'CHE'], ['Verbier', 'CHE'], ['Davos', 'CHE'],
  ['Zinal', 'CHE'], ['Interlaken', 'CHE'], ['Garmisch-Partenkirchen', 'DEU'], ['Grainau', 'DEU'], ['Oberstdorf', 'DEU'], ['Berchtesgaden', 'DEU'], ['Innsbruck', 'AUT'],
  ['Kitzbühel', 'AUT'], ['Kals am Großglockner', 'AUT'], ['Salzburg', 'AUT'], ['Neustift im Stubaital', 'AUT'], ['Kranjska Gora', 'SVN'], ['Bovec', 'SVN'],
  // Iberia, Britain, the north and the east
  ['Zegama', 'ESP'], ['Vielha', 'ESP'], ['Bagà', 'ESP'], ['La Palma', 'ESP'], ['Las Palmas de Gran Canaria', 'ESP'], ['Tenerife', 'ESP'], ['Castellón', 'ESP'], ['Benasque', 'ESP'],
  ['Funchal', 'PRT'], ['Gerês', 'PRT'], ['Ordino', 'AND'], ['Llanberis', 'GBR'], ['Keswick', 'GBR'], ['Coniston', 'GBR'], ['Fort William', 'GBR'], ['Glencoe', 'GBR'],
  ['Tromsø', 'NOR'], ['Åre', 'SWE'], ['Båstad', 'SWE'], ['Zakopane', 'POL'], ['Brașov', 'ROU'], ['Ürgüp', 'TUR'], ['Litochoro', 'GRC'], ['Labin', 'HRV'],
  // The Americas and Africa
  ['Auburn, California', 'USA'], ['Olympic Valley, California', 'USA'], ['Silverton, Colorado', 'USA'], ['Leadville, Colorado', 'USA'], ['Boulder, Colorado', 'USA'],
  ['Flagstaff, Arizona', 'USA'], ['Moab, Utah', 'USA'], ['Bend, Oregon', 'USA'], ['Big Sky, Montana', 'USA'], ['Honolulu, Hawaii', 'USA'], ['Squamish', 'CAN'], ['Whistler', 'CAN'],
  ['Canmore', 'CAN'], ['Québec', 'CAN'], ['Puerto Vallarta', 'MEX'], ['San Martín de los Andes', 'ARG'], ['Bariloche', 'ARG'], ['Ushuaia', 'ARG'], ['Torres del Paine', 'CHL'],
  ['Pucón', 'CHL'], ['Quito', 'ECU'], ['Huaraz', 'PER'], ['Paraty', 'BRA'], ['Cape Town', 'ZAF'], ['Drakensberg', 'ZAF'], ['Iten', 'KEN'], ['Chefchaouen', 'MAR'],
]

// How a race distance is usually listed within an event.
export const DISTANCE_NAMES = [
  '5K', '10K', '12K', '15K', '20K', '21K', 'Half marathon', '25K', '30K', '35K', '40K', '42K', 'Marathon', '45K', '50K', '55K', '60K', '65K', '70K', '75K', '80K', '90K',
  '100K', '110K', '120K', '130K', '150K', '160K', '170K', '200K', '50 mile', '100 mile', '200 mile', 'Vertical', 'Vertical kilometre', 'Skyrace', 'Sky marathon', 'Ultra',
  'Night trail', 'Relay', '6 hours', '12 hours', '24 hours', 'Backyard ultra', 'Kids run', 'Fun run',
]

/** The country of a suggested place, when the text is exactly one of them. */
export function countryOfPlace(text) {
  const wanted = String(text ?? '').trim().toLowerCase()
  return PLACES.find(([name]) => name.toLowerCase() === wanted)?.[1] ?? null
}
