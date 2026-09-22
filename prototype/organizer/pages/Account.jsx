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
  requestPasswordReset,
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
      <p className="text-xs">Each works once, when you cannot get a code. They are shown only this once.</p>
      <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-5">
        {codes.map((code) => (
          <li key={code} className="rounded bg-white px-2 py-1 text-[#0b1220]">
            {code}
          </li>
        ))}
      </ul>
      <button type="button" onClick={copy} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline">
        {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy all'}
      </button>
    </Notice>
  )
}

function ProfileForm({ me, onSaved }) {
  const [form, setForm] = useState({ display_name: '', organization: '', website: '', country: '', bio: '', marketing_opt_in: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  // Fill the form only once the profile has arrived, and never wipe what the organizer is typing:
  // the inputs stay disabled until then, so a fast typist cannot lose a field to a late response.
  const ready = Boolean(me)
  useEffect(() => {
    if (!me) return
    const p = me.profile ?? {}
    setForm({ display_name: p.display_name ?? '', organization: p.organization ?? '', website: p.website ?? '', country: p.country ?? '', bio: p.bio ?? '', marketing_opt_in: Boolean(p.marketing_opt_in) })
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
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <fieldset disabled={!ready} className="contents">
      <div className="grid gap-4 sm:grid-cols-2">
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
      <label className="flex items-start gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <input id="pf-news" type="checkbox" checked={form.marketing_opt_in} onChange={(e) => setForm((f) => ({ ...f, marketing_opt_in: e.target.checked }))} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
        <span>
          <span className="font-semibold text-[#0b1220]">Email me OTRI news.</span> New features, scoring-model updates, organizer tips; a few times a year.
          {me?.profile?.marketing_opt_in_at && <span className="block text-xs text-slate-500">Subscribed since {new Date(me.profile.marketing_opt_in_at).toLocaleDateString()}.</span>}
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

/** For an account that signs in with Google and has never set a password. The reset link is how
 *  one is set: it goes to the confirmed address, and opening it is the proof the owner asked. */
function SetPasswordCard({ email }) {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function send() {
    setBusy(true)
    setError(null)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm leading-6 text-slate-600">
        This account signs in with Google and has no password. You can add one: it gives you a second way in, and it is what
        two-factor sign-in, signing out everywhere and deleting the account ask for.
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      {sent ? (
        <Notice kind="success" title="Check your inbox.">We sent {email} a link to choose a password. It is good for an hour.</Notice>
      ) : (
        <Button type="button" variant="secondary" busy={busy} onClick={send}>
          <KeyRound size={15} /> Email me a link to set a password
        </Button>
      )}
    </div>
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
    <form onSubmit={submit} className="grid gap-4" noValidate>
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
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
        <p className="text-sm">
          <span className="font-semibold text-[#0b1220]">Two-factor authentication</span>{' '}
          {status.enabled ? (
            <span className="text-emerald-700">
              on · {status.method === 'totp' ? 'authenticator app' : 'email codes'} · {status.recovery_codes_left} recovery codes left
            </span>
          ) : (
            <span className="text-slate-500">off · a second code at sign-in stops a stolen password on its own</span>
          )}
        </p>
        {!status.enabled && mode == null && (
          <span className="flex flex-wrap gap-2">
            <Button variant="secondary" busy={busy} onClick={() => { setPassword(''); setError(null); setMode('confirm-totp') }} className="min-h-10 text-xs">
              <Smartphone size={14} /> Authenticator app
            </Button>
            <Button variant="secondary" busy={busy} onClick={() => { setPassword(''); setError(null); setMode('confirm-email') }} className="min-h-10 text-xs">
              <Mail size={14} /> Email codes
            </Button>
          </span>
        )}
        {status.enabled && mode == null && (
          <span className="flex flex-wrap gap-2">
            <Button variant="secondary" className="min-h-10 text-xs" onClick={() => setMode('codes')}>
              New recovery codes
            </Button>
            <Button variant="danger" className="min-h-10 text-xs" onClick={() => setMode('disable')}>
              Turn off
            </Button>
          </span>
        )}
      </div>

      {recovery && <RecoveryCodes codes={recovery.codes} method={recovery.method} />}
      {error && <Notice kind="error">{error}</Notice>}

      {(mode === 'confirm-totp' || mode === 'confirm-email') && (
        <form
          className="mt-4 grid max-w-sm gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (mode === 'confirm-totp') startTotp()
            else startEmail()
          }}
        >
          <Field label="Your password" htmlFor="tf-confirm-pw" hint="Changing how your account is protected asks for it again.">
            <PasswordInput id="tf-confirm-pw" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </Field>
          <div className="flex flex-wrap gap-2">
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
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-2" dangerouslySetInnerHTML={{ __html: setup.svg }} aria-label="QR code for your authenticator app" />
          <div className="grid gap-3">
            <p className="text-sm text-slate-600">
              Scan the code with an authenticator app (any that speaks TOTP: Aegis, Google Authenticator, 1Password, Authy…), or enter the key by hand:
            </p>
            <code className="select-all break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs">{setup.secret}</code>
            <Field label="Enter the 6-digit code the app shows" htmlFor="tf-code">
              <input id="tf-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={`${inputClass} font-mono tracking-[.3em]`} maxLength={7} />
            </Field>
            <div className="flex gap-2">
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
        <div className="grid gap-3">
          <Notice kind="info">{message ?? `A code was sent to ${email}.`} Codes expire after 10 minutes.</Notice>
          <Field label="Enter the code from the email" htmlFor="tf-email-code">
            <input id="tf-email-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={`${inputClass} font-mono tracking-[.3em]`} maxLength={7} />
          </Field>
          <div className="flex flex-wrap gap-2">
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
        <div className="grid gap-3">
          <Field label={mode === 'disable' ? 'Confirm with your password to turn two-factor off' : 'Confirm with your password to get new recovery codes'} htmlFor="tf-pw">
            <PasswordInput id="tf-pw" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </Field>
          <div className="flex gap-2">
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
    <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-semibold text-[#0b1220]">Sign out everywhere</span>{' '}
          <span className="text-slate-500">· lost a phone or used a shared computer? Every session ends, this one too.</span>
        </p>
        {!open && (
          <Button variant="secondary" className="min-h-10 text-xs" onClick={() => setOpen(true)}>
            <LogOut size={14} /> Sign out everywhere
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-3 grid gap-3">
          <Field label="Confirm with your password" htmlFor="so-pw">
            <PasswordInput id="so-pw" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </Field>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="flex gap-2">
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
  // The download carries every result row the account has ever uploaded, so it asks for the
  // password like the other two actions in this card do.
  const [askingDownload, setAskingDownload] = useState(false)
  const [downloadPassword, setDownloadPassword] = useState('')
  const [downloading, setDownloading] = useState(false)
  async function download() {
    setError(null)
    setDownloading(true)
    try {
      const blob = await fetchAccountExport(downloadPassword)
      setAskingDownload(false)
      setDownloadPassword('')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'otri-account-export.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setDownloading(false)
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
      <div className="mt-3 grid gap-4">
        <div className="rounded-xl bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-semibold text-[#0b1220]">Download my data</span>{' '}
              <span className="text-slate-500">· your account, linked sign-ins, events, races, result rows and the emails we sent you, as JSON.</span>
            </p>
            {!askingDownload && (
              <Button variant="secondary" className="min-h-10 text-xs" onClick={() => { setError(null); setAskingDownload(true) }}>
                <Download size={14} /> Download (JSON)
              </Button>
            )}
          </div>
          {askingDownload && (
            <form
              className="mt-3 grid gap-3"
              onSubmit={(event) => { event.preventDefault(); download() }}
            >
              <Field label="Your password" htmlFor="export-pw" hint="The file holds every finisher's name from the results you uploaded, so we ask before handing it over.">
                <PasswordInput id="export-pw" autoComplete="current-password" value={downloadPassword} onChange={(e) => setDownloadPassword(e.target.value)} className={inputClass} />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" variant="secondary" busy={downloading} disabled={!downloadPassword}>
                  <Download size={14} /> Download (JSON)
                </Button>
                <Button type="button" variant="secondary" onClick={() => { setAskingDownload(false); setDownloadPassword(''); setError(null) }}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/60 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-semibold text-red-700">Delete my account</span>{' '}
              <span className="text-slate-600">· removes every event, race and result you uploaded. Published leaderboards disappear. This cannot be undone.</span>
            </p>
            {!open && (
              <Button variant="danger" className="min-h-10 text-xs" onClick={() => setOpen(true)}>
                <Trash2 size={14} /> Delete account
              </Button>
            )}
          </div>
          {open && (
            <div className="mt-3 grid gap-3">
              <Field label={`Type ${email} to confirm`} htmlFor="del-confirm">
                <input id="del-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={inputClass} autoComplete="off" />
              </Field>
              <Field label="Your password" htmlFor="del-pw">
                <PasswordInput id="del-pw" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
              </Field>
              {error && <Notice kind="error">{error}</Notice>}
              <div className="flex gap-2">
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
        <div className="mt-6">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <Eyebrow>PROFILE</Eyebrow>
          <div className="mt-3">
            <ProfileForm me={me} onSaved={setMe} />
          </div>
        </Card>
        <div className="grid gap-6">
          <Card>
            <Eyebrow>SIGN-IN SECURITY</Eyebrow>
            {me?.has_password === false && (
              <div className="mt-3">
                <Notice kind="info">This account signs in with Google. Two-factor sign-in, signing out everywhere and deleting the account ask for a password; set one in the card below first.</Notice>
              </div>
            )}
            <div className="mt-3">
              <TwoFactor me={me} email={session.email} onChanged={load} onToken={keepToken} />
            </div>
            <SessionsCard onSignedOut={onSignOut} />
            <p className="mt-4 text-[11px] leading-5 text-slate-500">
              Sessions last 12 hours, or 30 days when you tick "remember me" at sign-in. Password last changed:{' '}
              {me?.password_changed_at ? new Date(me.password_changed_at).toLocaleDateString() : 'never'}.
              {me?.profile?.terms_accepted_at && <> Terms accepted {new Date(me.profile.terms_accepted_at).toLocaleDateString()}.</>}
            </p>
          </Card>
          <Card>
            <Eyebrow>PASSWORD</Eyebrow>
            <div className="mt-3">
              {me?.has_password === false ? (
                <SetPasswordCard email={session.email} />
              ) : (
                <ChangePasswordForm email={session.email} onChanged={(result) => { keepToken(result); load() }} />
              )}
            </div>
          </Card>
          <DataCard email={session.email} onDeleted={onSignOut} />
        </div>
      </div>
    </Page>
  )
}
