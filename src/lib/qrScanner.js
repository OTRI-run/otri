// Reading a bib's QR code with the phone's camera, on any phone a volunteer brings.
//
// Two decoders, one interface: the browser's own BarcodeDetector where it exists (Chrome and most
// Android browsers: fast, runs off the main thread), otherwise jsQR over canvas frames (Safari on
// iPhone, Firefox). Both hand every decoded string to `onCode`, at most once every two seconds per
// string, so a bib held in front of the camera is one scan, not thirty.
import jsQR from 'jsqr'

// What OTRI prints in a bib's QR code is a URL ending in the runner's 32-hex-digit token; the
// token is the identity, whatever else is around it.
const TOKEN_RE = /[0-9a-f]{32}/

export function tokenIn(text) {
  const match = TOKEN_RE.exec(text || '')
  return match ? match[0] : null
}

export function cameraSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

async function makeDetector() {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return null
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats?.()
    if (formats && !formats.includes('qr_code')) return null
    return new window.BarcodeDetector({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

/** Starts the back camera into `video` and decodes frames until the returned function is called. */
export async function startScanner(video, onCode) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  })
  video.srcObject = stream
  video.setAttribute('playsinline', '')
  video.muted = true
  await video.play()

  const detector = await makeDetector()
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const lastSeen = new Map()
  let stopped = false

  const emit = (text) => {
    const now = Date.now()
    if (now - (lastSeen.get(text) || 0) < 2000) return
    lastSeen.set(text, now)
    onCode(text)
  }

  async function tick() {
    if (stopped) return
    if (video.readyState >= 2) {
      try {
        if (detector) {
          for (const code of await detector.detect(video)) if (code.rawValue) emit(code.rawValue)
        } else {
          const width = video.videoWidth
          const height = video.videoHeight
          if (width && height) {
            // Decoding cost grows with the pixels; 640 wide is plenty for a code filling a hand's width.
            const scale = Math.min(1, 640 / width)
            canvas.width = Math.round(width * scale)
            canvas.height = Math.round(height * scale)
            context.drawImage(video, 0, 0, canvas.width, canvas.height)
            const image = context.getImageData(0, 0, canvas.width, canvas.height)
            const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
            if (code?.data) emit(code.data)
          }
        }
      } catch {
        // A frame that would not decode: the next one will.
      }
    }
    setTimeout(tick, detector ? 120 : 180)
  }
  tick()

  return () => {
    stopped = true
    for (const track of stream.getTracks()) track.stop()
    video.srcObject = null
  }
}

/** A short tone: high for a recorded scan, low for a refused one. Silent where audio is blocked. */
export function beep(ok = true) {
  try {
    const Context = window.AudioContext || window.webkitAudioContext
    const context = new Context()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = ok ? 1175 : 220
    gain.gain.value = 0.08
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + (ok ? 0.12 : 0.35))
    setTimeout(() => context.close(), 600)
  } catch {
    // no audio here
  }
}
