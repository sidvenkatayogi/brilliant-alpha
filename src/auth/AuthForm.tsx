import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

interface Props {
  mode: 'login' | 'signup'
}

const friendlyError = (code: string): string => {
  if (code.includes('invalid-credential') || code.includes('wrong-password'))
    return 'Email or password is incorrect.'
  if (code.includes('email-already-in-use')) return 'That email already has an account.'
  if (code.includes('weak-password')) return 'Password should be at least 6 characters.'
  if (code.includes('invalid-email')) return 'That email address looks off.'
  return 'Something went wrong. Please try again.'
}

export function AuthForm({ mode }: Props) {
  const { signUp, logIn, logInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (isSignup) {
        await signUp(email, password, displayName.trim() || 'Learner')
      } else {
        await logIn(email, password)
      }
      navigate('/')
    } catch (err) {
      setError(friendlyError((err as { code?: string }).code ?? ''))
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    setError(null)
    setBusy(true)
    try {
      await logInWithGoogle()
      navigate('/')
    } catch (err) {
      setError(friendlyError((err as { code?: string }).code ?? ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto grid min-h-dvh max-w-sm place-items-center px-5">
      <div className="w-full space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Long Run</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isSignup ? 'Create an account to start learning.' : 'Welcome back.'}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {isSignup && (
            <input
              className="w-full rounded-xl px-4 py-3 ring-1 ring-slate-200 focus:outline-none focus:ring-accent"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
            />
          )}
          <input
            className="w-full rounded-xl px-4 py-3 ring-1 ring-slate-200 focus:outline-none focus:ring-accent"
            placeholder="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className="w-full rounded-xl px-4 py-3 ring-1 ring-slate-200 focus:outline-none focus:ring-accent"
            placeholder="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
          />
          {error && <p className="text-sm font-medium text-bad">{error}</p>}
          <button className="btn-primary w-full" disabled={busy} type="submit">
            {isSignup ? 'Sign up' : 'Log in'}
          </button>
        </form>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
        </div>

        <button className="btn-ghost w-full" disabled={busy} onClick={google} type="button">
          Continue with Google
        </button>

        <p className="text-center text-sm text-slate-500">
          {isSignup ? (
            <>
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-accent">
                Log in
              </Link>
            </>
          ) : (
            <>
              New here?{' '}
              <Link to="/signup" className="font-semibold text-accent">
                Sign up
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
