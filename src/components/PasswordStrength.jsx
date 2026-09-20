// A password meter that mirrors the server's policy (api/security.py): length first, a short
// common-password check, and "not built from your email". The server has the final word.
const COMMON = new Set(['password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd', '123456', '12345678', '123456789', '1234567890', 'qwerty', 'qwertyuiop', 'qwerty123', 'abc123', 'letmein', 'welcome', 'welcome1', 'admin', 'iloveyou', 'monkey', 'dragon', 'football', 'sunshine', 'princess', 'trustno1', 'changeme', 'test1234', 'trailrunning', 'trailrun', 'running', 'marathon', 'otri', 'otrirun'])
export const PASSWORD_MIN = 10

export function assessPassword(password, email) {
  const raw = password ?? ''
  const norm = raw.normalize('NFKC').trim().toLowerCase()
  const stem = norm.replace(/[\d!@#$%^&*.]+$/, '')
  const problems = []
  if (raw.length < PASSWORD_MIN) problems.push(`use at least ${PASSWORD_MIN} characters (a few words work well)`)
  if (raw.length > 128) problems.push('use at most 128 characters')
  if (COMMON.has(norm) || COMMON.has(stem)) problems.push('that password is on every attacker\'s list')
  if (norm.length >= PASSWORD_MIN && new Set(norm).size <= 2) problems.push('that is one or two characters repeated')
  if (email) {
    const local = email.split('@')[0].toLowerCase()
    const parts = [local, ...local.split(/[._+-]/).filter((p) => p.length >= 4)]
    if (parts.some((p) => p && norm.includes(p))) problems.push('do not build the password from your email address')
  }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(raw)).length
  let score = 0
  if (raw.length >= PASSWORD_MIN) score = 1
  if (raw.length >= 12 && classes >= 2) score = 2
  if ((raw.length >= 14 && classes >= 2) || raw.length >= 16) score = 3
  if ((raw.length >= 18 && classes >= 3) || raw.length >= 24) score = 4
  if (problems.length && raw.length >= PASSWORD_MIN) score = Math.min(score, 1)
  const labels = ['too short', 'weak', 'fair', 'good', 'strong']
  return { score, label: labels[score], problems, ok: problems.length === 0 }
}

export default function PasswordStrength({ password, email }) {
  const { score, label, problems } = assessPassword(password, email)
  if (!password) {
    return <p className="field__hint">At least {PASSWORD_MIN} characters. A few unrelated words beat a short jumble; length is what counts.</p>
  }
  const colors = ['', 'var(--berry)', 'var(--ochre)', 'var(--sky)', 'var(--moss)']
  return (
    <div className="stack stack--tight mt-1" aria-live="polite">
      <div className="meter meter--bands meter--thin" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={step <= score ? 'is-on' : ''} style={step <= score ? { background: colors[score] } : undefined} />
        ))}
      </div>
      <p className="tiny">
        <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{label}</span>
        {problems.length > 0 && <span className="muted"> · {problems[0]}</span>}
        {problems.length === 0 && score < 3 && <span className="muted"> · longer is stronger</span>}
      </p>
    </div>
  )
}
