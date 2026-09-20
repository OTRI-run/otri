import './Account.css'
import { useEffect, useState } from 'react'
import CountrySelect from '../../../src/components/CountrySelect'
import { Check, Copy, Download, KeyRound, LogOut, ShieldCheck, Smartphone, Mail, Trash2 } from 'lucide-react'
import QRCode from 'qrcode'
import PasswordStrength, { assessPassword } from '../../../src/components/PasswordStrength'
import {
  changePassword,
  deleteOwnAccount,
  disableTwoFactor,
  fetchAccountExport,
  logoutEverywhere,
  emailTwoFactorEnable,
  emailTwoFactorStart,
  getMe,
  regenerateRecoveryCodes,
  totpEnable,
  totpSetup,
  updateProfile,
} from '../../apiClient'
import { Button, Card, Eyebrow, Field, Gradient, inputClass, Notice, Page, PasswordInput } from '../ui'

function RecoveryCodes({ codes, method }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Notice kind="success" title={`${method === 'email' ? 'Email codes' : 'Authenticator app'} switched on. Save these recovery codes now.`}>
      <p className="prototype-organizer-pages-account-recovery-codes-p-1">Each works once, when you cannot get a code. They are shown only this once.</p>
      <ul className="prototype-organizer-pages-account-recovery-codes-ul-2">
        {codes.map((code) => (
          <li key={code} className="prototype-organizer-pages-account-recovery-codes-li-3">
            {code}
          </li>
        ))}
      </ul>
      <button type="button" onClick={copy} className="prototype-organizer-pages-account-recovery-codes-button-4">
        {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy all'}
      </button>
    </Notice>
  )
}

function ProfileForm({ me, onSaved }) {
  const [form, setForm] = useState({ display_name: '', organization: '', website: '', country: '', phone: '', bio: '', marketing_opt_in: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  // Fill the form only once the profile has arrived, and never wipe what the organizer is typing:
  // the inputs stay disabled until then, so a fast typist cannot lose a field to a late response.
  const ready = Boolean(me)
  useEffect(() => {
    if (!me) return
    const p = me.profile ?? {}
    setForm({ display_name: p.display_name ?? '', organization: p.organization ?? '', website: p.website ?? '', country: p.country ?? '', phone: p.phone ?? '', bio: p.bio ?? '', marketing_opt_in: Boolean(p.marketing_opt_in) })
  }, [me])
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const next = await updateProfile(form)
      onSaved(next)
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="prototype-organizer-pages-account-profile-form-form-5" noValidate>
      <fieldset disabled={!ready} className="prototype-organizer-pages-account-profile-form-fieldset-6">
      <div className="prototype-organizer-pages-account-profile-form-div-7">
        <Field label="Your name" htmlFor="pf-name" hint="Shown to admins; not public.">
          <input id="pf-name" value={form.display_name} onChange={set('display_name')} className={inputClass} placeholder="Ann Organizer" />
        </Field>
        <Field label="Organization" htmlFor="pf-org" hint="Shown next to your published races.">
          <input id="pf-org" value={form.organization} onChange={set('organization')} className={inputClass} placeholder="Doi Trail Club" />
        </Field>
        <Field label="Website" htmlFor="pf-web" hint="Linked from your race pages.">
          <input id="pf-web" value={form.website} onChange={set('website')} className={inputClass} placeholder="https://…" />
        </Field>
        <Field label="Country" htmlFor="pf-country" hint="Where you organize.">
          <CountrySelect id="pf-country" value={form.country} onChange={(value) => setForm((f) => ({ ...f, country: value }))} className={inputClass} />
        </Field>
      </div>
      <Field label="About" htmlFor="pf-bio" hint="A sentence or two about the races you organize.">
        <textarea id="pf-bio" rows={3} maxLength={1000} value={form.bio} onChange={set('bio')} className={inputClass} />
      </Field>
      <label className="prototype-organizer-pages-account-profile-form-label-8">
        <input id="pf-news" type="checkbox" checked={form.marketing_opt_in} onChange={(e) => setForm((f) => ({ ...f, marketing_opt_in: e.target.checked }))} className="prototype-organizer-pages-account-profile-form-input-9" />
        <span>
          <span className="prototype-organizer-pages-account-profile-form-span-10">Email me OTRI news.</span> New features, scoring-model updates, organizer tips; a few times a year.
          {me?.profile?.marketing_opt_in_at && <span className="prototype-organizer-pages-account-profile-form-span-11">Subscribed since {new Date(me.profile.marketing_opt_in_at).toLocaleDateString()}.</span>}
        </span>
      </label>
      {error && <Notice kind="error">{error}</Notice>}
      {saved && <Notice kind="success">Profile saved.</Notice>}
      <div>
        <Button type="submit" busy={busy} disabled={!ready}>
          Save profile
        </Button>
      </div>
      </fieldset>
    </form>
  )
}

function ChangePasswordForm({ email, onChanged }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const check = assessPassword(next, email)
  const mismatch = confirm.length > 0 && confirm !== next

  async function submit(e) {
    e.preventDefault()
    if (!check.ok || mismatch) return
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const result = await changePassword(current, next)
      setDone(true)
      setCurrent('')
      setNext('')
      setConfirm('')
      onChanged?.(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="prototype-organizer-pages-account-profile-form-form-5" noValidate>
      <Field label="Current password" htmlFor="cp-current">
        <PasswordInput id="cp-current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
      </Field>
      <Field label="New password" htmlFor="cp-next">
        <PasswordInput id="cp-next" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
        <PasswordStrength password={next} email={email} />
      </Field>
      <Field label="Confirm new password" htmlFor="cp-confirm" error={mismatch ? 'Passwords do not match.' : null}>
        <PasswordInput id="cp-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
      </Field>
      {error && <Notice kind="error">{error}</Notice>}
      {done && <Notice kind="success">Password changed. Every other device has been signed out; this one stays signed in.</Notice>}
      <div>
        <Button type="submit" busy={busy} disabled={!current || !check.ok || mismatch}>
          <KeyRound size={15} /> Change password
        </Button>
      </div>
    </form>
  )
}

function TwoFactor({ me, email, onChanged, onToken }) {
  const status = me?.two_factor ?? { enabled: false }
  const [mode, setMode] = useState(null) // null | 'totp' | 'email' | 'disable' | 'codes'
  const [setup, setSetup] = useState(null) // { secret, otpauth_uri, svg }
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [recovery, setRecovery] = useState(null)

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Both setups start by asking for the password (mode "confirm-…"); it is kept for "Send again"
  // and dropped when the setup ends either way.
  const startTotp = () =>
    run(async () => {
      const data = await totpSetup(password)
      const svg = await QRCode.toString(data.otpauth_uri, { type: 'svg', margin: 1, width: 180 })
      setSetup({ ...data, svg })
      setMode('totp')
      setCode('')
    })
  const finishTotp = () =>
    run(async () => {
      const result = await totpEnable(code)
      onToken?.(result) // turning it on signed out every session; this is the new one
      setRecovery(result)
      setMode(null)
      setSetup(null)
      onChanged()
    })
  const startEmail = () =>
    run(async () => {
      const result = await emailTwoFactorStart(password)
      setMessage(result.message)
      setMode('email')
      setCode('')
    })
  const finishEmail = () =>
    run(async () => {
      const result = await emailTwoFactorEnable(code)
      onToken?.(result)
      setRecovery(result)
      setMode(null)
      onChanged()
    })
  const disable = () =>
    run(async () => {
      const result = await disableTwoFactor(password)
      onToken?.(result)
      setMode(null)
      setPassword('')
      setRecovery(null)
      onChanged()
    })
  const regenerate = () =>
    run(async () => {
      const result = await regenerateRecoveryCodes(password)
      setRecovery(result)
      setMode(null)
      setPassword('')
      onChanged()
    })

  return (
    <div className="prototype-organizer-pages-account-profile-form-form-5">
      <div className="prototype-organizer-pages-account-two-factor-div-12">
        <p className="prototype-organizer-pages-account-two-factor-p-13">
          <span className="prototype-organizer-pages-account-profile-form-span-10">Two-factor authentication</span>{' '}
          {status.enabled ? (
            <span className="prototype-organizer-pages-account-two-factor-span-14">
              on · {status.method === 'totp' ? 'authenticator app' : 'email codes'} · {status.recovery_codes_left} recovery codes left
            </span>
          ) : (
            <span className="prototype-organizer-pages-account-two-factor-span-15">off · a second code at sign-in stops a stolen password on its own</span>
          )}
        </p>
        {!status.enabled && mode == null && (
          <span className="prototype-organizer-pages-account-two-factor-span-16">
            <Button variant="secondary" busy={busy} onClick={() => { setPassword(''); setError(null); setMode('confirm-totp') }} className="prototype-organizer-pages-account-two-factor-button-17">
              <Smartphone size={14} /> Authenticator app
            </Button>
            <Button variant="secondary" busy={busy} onClick={() => { setPassword(''); setError(null); setMode('confirm-email') }} className="prototype-organizer-pages-account-two-factor-button-17">
              <Mail size={14} /> Email codes
            </Button>
          </span>
        )}
        {status.enabled && mode == null && (
          <span className="prototype-organizer-pages-account-two-factor-span-16">
            <Button variant="secondary" className="prototype-organizer-pages-account-two-factor-button-17" onClick={() => setMode('codes')}>
              New recovery codes
            </Button>
            <Button variant="danger" className="prototype-organizer-pages-account-two-factor-button-17" onClick={() => setMode('disable')}>
              Turn off
            </Button>
          </span>
        )}
      </div>

      {recovery && <RecoveryCodes codes={recovery.codes} method={recovery.method} />}
      {error && <Notice kind="error">{error}</Notice>}

      {(mode === 'confirm-totp' || mode === 'confirm-email') && (
        <form
          className="prototype-organizer-pages-account-two-factor-form-18"
          onSubmit={(event) => {
            event.preventDefault()
            if (mode === 'confirm-totp') startTotp()
            else startEmail()
          }}
        >
          <Field label="Your password" htmlFor="tf-confirm-pw" hint="Changing how your account is protected asks for it again.">
            <PasswordInput id="tf-confirm-pw" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </Field>
          <div className="prototype-organizer-pages-account-two-factor-span-16">
            <Button type="submit" busy={busy} disabled={!password}>
              Continue
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setMode(null); setPassword(''); setError(null) }}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {mode === 'totp' && setup && (
        <div className="prototype-organizer-pages-account-two-factor-div-19">
          <div className="prototype-organizer-pages-account-two-factor-div-20" dangerouslySetInnerHTML={{ __html: setup.svg }} aria-label="QR code for your authenticator app" />
          <div className="prototype-organizer-pages-account-two-factor-div-21">
            <p className="prototype-organizer-pages-account-two-factor-p-22">
              Scan the code with an authenticator app (any that speaks TOTP: Aegis, Google Authenticator, 1Password, Authy…), or enter the key by hand:
            </p>
            <code className="prototype-organizer-pages-account-two-factor-code-23">{setup.secret}</code>
            <Field label="Enter the 6-digit code the app shows" htmlFor="tf-code">
              <input id="tf-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={`${inputClass} prototype-organizer-pages-account-two-factor-input-24`} maxLength={7} />
            </Field>
            <div className="prototype-organizer-pages-account-two-factor-div-25">
              <Button busy={busy} disabled={code.replace(/\s/g, '').length !== 6} onClick={finishTotp}>
                <ShieldCheck size={15} /> Turn on
              </Button>
              <Button variant="secondary" onClick={() => { setMode(null); setSetup(null) }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {mode === 'email' && (
        <div className="prototype-organizer-pages-account-two-factor-div-21">
          <Notice kind="info">{message ?? `A code was sent to ${email}.`} Codes expire after 10 minutes.</Notice>
          <Field label="Enter the code from the email" htmlFor="tf-email-code">
            <input id="tf-email-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={`${inputClass} prototype-organizer-pages-account-two-factor-input-24`} maxLength={7} />
          </Field>
          <div className="prototype-organizer-pages-account-two-factor-span-16">
            <Button busy={busy} disabled={code.replace(/\s/g, '').length !== 6} onClick={finishEmail}>
              <ShieldCheck size={15} /> Turn on
            </Button>
            <Button variant="secondary" busy={busy} onClick={startEmail}>
              Send again
            </Button>
            <Button variant="secondary" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {(mode === 'disable' || mode === 'codes') && (
        <div className="prototype-organizer-pages-account-two-factor-div-21">
          <Field label={mode === 'disable' ? 'Confirm with your password to turn two-factor off' : 'Confirm with your password to get new recovery codes'} htmlFor="tf-pw">
            <PasswordInput id="tf-pw" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </Field>
          <div className="prototype-organizer-pages-account-two-factor-div-25">
            <Button variant={mode === 'disable' ? 'danger' : 'primary'} busy={busy} disabled={!password} onClick={mode === 'disable' ? disable : regenerate}>
              {mode === 'disable' ? 'Turn off two-factor' : 'Generate new codes'}
            </Button>
            <Button variant="secondary" onClick={() => { setMode(null); setPassword('') }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function SessionsCard({ onSignedOut }) {
  const [password, setPassword] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function go() {
    setBusy(true)
    setError(null)
    try {
      await logoutEverywhere(password)
      onSignedOut()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="prototype-organizer-pages-account-sessions-card-div-26">
      <div className="prototype-organizer-pages-account-sessions-card-div-27">
        <p className="prototype-organizer-pages-account-two-factor-p-13">
          <span className="prototype-organizer-pages-account-profile-form-span-10">Sign out everywhere</span>{' '}
          <span className="prototype-organizer-pages-account-two-factor-span-15">· lost a phone or used a shared computer? Every session ends, this one too.</span>
        </p>
        {!open && (
          <Button variant="secondary" className="prototype-organizer-pages-account-two-factor-button-17" onClick={() => setOpen(true)}>
            <LogOut size={14} /> Sign out everywhere
          </Button>
        )}
      </div>
      {open && (
        <div className="prototype-organizer-pages-account-sessions-card-div-28">
          <Field label="Confirm with your password" htmlFor="so-pw">
            <PasswordInput id="so-pw" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </Field>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="prototype-organizer-pages-account-two-factor-div-25">
            <Button busy={busy} disabled={!password} onClick={go}>
              Sign out everywhere
            </Button>
            <Button variant="secondary" onClick={() => { setOpen(false); setPassword('') }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function DataCard({ email, onDeleted }) {
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function download() {
    setError(null)
    try {
      const blob = await fetchAccountExport()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'otri-account-export.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    }
  }
  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await deleteOwnAccount(password)
      onDeleted()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <Eyebrow>YOUR DATA</Eyebrow>
      <div className="prototype-organizer-pages-account-data-card-div-29">
        <div className="prototype-organizer-pages-account-two-factor-div-12">
          <p className="prototype-organizer-pages-account-two-factor-p-13">
            <span className="prototype-organizer-pages-account-profile-form-span-10">Download my data</span>{' '}
            <span className="prototype-organizer-pages-account-two-factor-span-15">· your account, events, races, result rows and the emails we sent you, as JSON.</span>
          </p>
          <Button variant="secondary" className="prototype-organizer-pages-account-two-factor-button-17" onClick={download}>
            <Download size={14} /> Download (JSON)
          </Button>
        </div>
        <div className="prototype-organizer-pages-account-data-card-div-30">
          <div className="prototype-organizer-pages-account-sessions-card-div-27">
            <p className="prototype-organizer-pages-account-two-factor-p-13">
              <span className="prototype-organizer-pages-account-data-card-span-31">Delete my account</span>{' '}
              <span className="prototype-organizer-pages-account-data-card-span-32">· removes every event, race and result you uploaded. Published leaderboards disappear. This cannot be undone.</span>
            </p>
            {!open && (
              <Button variant="danger" className="prototype-organizer-pages-account-two-factor-button-17" onClick={() => setOpen(true)}>
                <Trash2 size={14} /> Delete account
              </Button>
            )}
          </div>
          {open && (
            <div className="prototype-organizer-pages-account-sessions-card-div-28">
              <Field label={`Type ${email} to confirm`} htmlFor="del-confirm">
                <input id="del-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={inputClass} autoComplete="off" />
              </Field>
              <Field label="Your password" htmlFor="del-pw">
                <PasswordInput id="del-pw" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
              </Field>
              {error && <Notice kind="error">{error}</Notice>}
              <div className="prototype-organizer-pages-account-two-factor-div-25">
                <Button variant="danger" busy={busy} disabled={!password || confirmText.trim().toLowerCase() !== email.toLowerCase()} onClick={remove}>
                  Delete my account for good
                </Button>
                <Button variant="secondary" onClick={() => { setOpen(false); setPassword(''); setConfirmText('') }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

export function AccountPage({ session, onToken, onSignOut }) {
  const [me, setMe] = useState(null)
  const [error, setError] = useState(null)
  const load = () => getMe(session.token).then(setMe).catch((err) => setError(err.message))
  const keepToken = (result) => {
    if (result?.access_token) onToken?.(result.access_token, result.email ?? session.email, result.is_admin ?? session.isAdmin)
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token])

  return (
    <Page
      eyebrow="ACCOUNT"
      headline={
        <>
          Your account,
          <br />
          <Gradient>your details.</Gradient>
        </>
      }
      intro={`Signed in as ${session.email}. Your organization and website appear next to the races you publish; everything else stays with the OTRI admins.`}
    >
      {error && (
        <div className="prototype-organizer-pages-account-account-page-div-33">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <div className="prototype-organizer-pages-account-account-page-div-34">
        <Card>
          <Eyebrow>PROFILE</Eyebrow>
          <div className="prototype-organizer-pages-account-account-page-div-35">
            <ProfileForm me={me} onSaved={setMe} />
          </div>
        </Card>
        <div className="prototype-organizer-pages-account-account-page-div-36">
          <Card>
            <Eyebrow>SIGN-IN SECURITY</Eyebrow>
            <div className="prototype-organizer-pages-account-account-page-div-35">
              <TwoFactor me={me} email={session.email} onChanged={load} onToken={keepToken} />
            </div>
            <SessionsCard onSignedOut={onSignOut} />
            <p className="prototype-organizer-pages-account-account-page-p-37">
              Sessions last 12 hours, or 30 days when you tick "remember me" at sign-in. Password last changed:{' '}
              {me?.password_changed_at ? new Date(me.password_changed_at).toLocaleDateString() : 'never'}.
              {me?.profile?.terms_accepted_at && <> Terms accepted {new Date(me.profile.terms_accepted_at).toLocaleDateString()}.</>}
            </p>
          </Card>
          <Card>
            <Eyebrow>PASSWORD</Eyebrow>
            <div className="prototype-organizer-pages-account-account-page-div-35">
              <ChangePasswordForm email={session.email} onChanged={(result) => { keepToken(result); load() }} />
            </div>
          </Card>
          <DataCard email={session.email} onDeleted={onSignOut} />
        </div>
      </div>
    </Page>
  )
}
