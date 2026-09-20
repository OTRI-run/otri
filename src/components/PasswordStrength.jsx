import './PasswordStrength.css'
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
    return <p className="src-components-password-strength-password-strength-p-1">At least {PASSWORD_MIN} characters. A few unrelated words beat a short jumble; length is what counts.</p>
  }
  const colors = ["otri-state-1", "otri-state-2", "otri-state-3", "otri-state-4", "otri-state-5"]
  return (
    <div className="src-components-password-strength-password-strength-div-2" aria-live="polite">
      <div className="src-components-password-strength-password-strength-div-3" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={`src-components-password-strength-password-strength-span-4 ${step <= score ? colors[score] : "src-components-password-strength-password-strength-span-5"}`} />
        ))}
      </div>
      <p className="src-components-password-strength-password-strength-p-6">
        <span className="src-components-password-strength-password-strength-span-7">{label}</span>
        {problems.length > 0 && <span className="src-components-password-strength-password-strength-span-8"> · {problems[0]}</span>}
        {problems.length === 0 && score < 3 && <span className="src-components-password-strength-password-strength-span-8"> · longer is stronger</span>}
      </p>
    </div>
  )
}
