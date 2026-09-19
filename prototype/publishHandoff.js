// From "Score my race" to a published race page without uploading anything twice.
//
// The public site and the organizer app are two pages of one origin, so the two files a race just
// scored are handed over through this browser's IndexedDB: written only when the visitor presses
// "Publish this race", read by the organizer app once they are signed in, and deleted as soon as
// the race page exists (or after a day). Nothing here is sent anywhere; the files reach the API
// through the normal, signed-in uploads.

const DB_NAME = 'otri-publish'
const STORE = 'pending'
const KEY = 'race'
const FLAG = 'otri_publish_pending' // so pages can tell a hand-over is waiting without opening the database
const MAX_AGE_MS = 24 * 60 * 60 * 1000

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function run(mode, work) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE, mode)
        const request = work(transaction.objectStore(STORE))
        transaction.oncomplete = () => {
          db.close()
          resolve(request?.result)
        }
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      }),
  )
}

/** Keep a scored race for the organizer app: `{ gpx: File, results: File, raceName, course, summary }`. */
export async function saveHandoff(race) {
  await run('readwrite', (store) => store.put({ ...race, savedAt: Date.now() }, KEY))
  try {
    localStorage.setItem(FLAG, String(Date.now()))
  } catch {
    // storage blocked: the organizer app still finds the race when it opens /publish
  }
}

/** The race waiting to be published, or null. One older than a day is deleted, not returned. */
export async function loadHandoff() {
  try {
    const race = await run('readonly', (store) => store.get(KEY))
    if (!race) return null
    if (Date.now() - race.savedAt > MAX_AGE_MS) {
      await clearHandoff()
      return null
    }
    return race
  } catch {
    return null // private mode, or a browser without IndexedDB
  }
}

export async function clearHandoff() {
  try {
    localStorage.removeItem(FLAG)
  } catch {
    // ignore
  }
  try {
    await run('readwrite', (store) => store.delete(KEY))
  } catch {
    // ignore
  }
}

/** Cheap and synchronous: is a scored race waiting? (The flag expires with the race.) */
export function hasHandoff() {
  try {
    const at = Number(localStorage.getItem(FLAG))
    return Boolean(at) && Date.now() - at <= MAX_AGE_MS
  } catch {
    return false
  }
}
