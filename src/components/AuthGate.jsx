import React, { useState, useEffect } from 'react';
import LandingPage from '../features/marketing/LandingPage';

/* Inline marks rather than an icon package: this screen renders before the app
   shell loads, and the two glyphs it needs are not worth the import. Both are
   decorative — the text beside them already says what they mean. */
const BookIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
    <path strokeLinecap="round" d="M8 8h7M8 11.5h7" />
  </svg>
);

const CheckIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
  </svg>
);

const AuthGate = ({ onAuth }) => {
  const [mode, setMode] = useState('login'); // login | signup | forgot | reset
  // The public page is what a first-time visitor should meet, not a password
  // box. Anyone arriving with a reset link skips straight past it (see below).
  const [showLanding, setShowLanding] = useState(true);
  const [signupStep, setSignupStep] = useState(1);
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [resetToken, setResetToken] = useState('');
  
  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [signupToken, setSignupToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Backend base URL.
  // In dev, Vite proxies `/api` to the backend (see vite.config.js).
  // In prod, you can set VITE_API_BASE to the API origin, or keep it empty if the UI is served behind the same origin.
  const API_BASE = (import.meta && import.meta.env && import.meta.env.VITE_API_BASE) || '';

  // Check for reset token in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) setShowLanding(false);
    if (token) {
      setResetToken(token);
      setMode('reset');
    }
  }, []);

  const api = async (path, body, headers = {}) => {
    const base = API_BASE ? API_BASE.replace(/\/+$/g, '') : '';
    const url = `${base}/api/auth/${path}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body)
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      return { ok: res.ok, status: res.status, data, text };
    } catch (e) {
      const hint = API_BASE
        ? `Cannot reach server at ${API_BASE}. Make sure the backend is running.`
        : 'Cannot reach server. Make sure the backend is running.';
      throw new Error(`${hint} (${String(e?.message || e)})`);
    }
  };

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const onLogin = async () => {
    clearMessages();
    
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setLoading(true);
    try {
      const identity = email.trim().toLowerCase();
      const res = await api('login', { emailOrUsername: identity, password, email: identity });
      if (res.ok && res.data?.token) {
        localStorage.setItem('token', res.data.token);
        if (res.data.refreshToken) localStorage.setItem('refreshToken', res.data.refreshToken);
        localStorage.setItem('userEmail', identity);
        if (res.data.user?.accountId) {
          localStorage.setItem('accountId', res.data.user.accountId);
        }
        // The server picks the active org/branch on login; without them every
        // protected call fails on the missing x-org-id / x-branch-id headers.
        const firstOrgId = res.data?.activeOrgId || res.data?.companies?.[0]?.orgId;
        if (firstOrgId) {
          localStorage.setItem('activeOrgId', String(firstOrgId));
        }
        const firstBranchId = res.data?.activeBranchId;
        if (firstBranchId) {
          localStorage.setItem('activeBranchId', String(firstBranchId));
          localStorage.setItem('branchId', String(firstBranchId));
        }
        setSuccess('Login successful! Redirecting...');
        setTimeout(() => {
          onAuth && onAuth(res.data.token);
        }, 500);
      } else {
        const msg = res.data?.error || res.data?.hint || 'Login failed';
        setError(msg);
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const onSignupAccount = async () => {
    clearMessages();

    if (!name.trim()) {
      setError('Please enter your full name');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }
    if (!password) {
      setError('Please enter a password');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await api('signup', { 
        email: email.trim().toLowerCase(), 
        password,
        name: name.trim(),
        mobile: mobile.trim() || undefined,
      });
      
      if (res.ok && res.data?.token) {
        setSignupToken(res.data.token);
        if (res.data.refreshToken) localStorage.setItem('refreshToken', res.data.refreshToken);
        localStorage.setItem('userEmail', email.trim().toLowerCase());
        if (res.data.user?.accountId) {
          localStorage.setItem('accountId', res.data.user.accountId);
        }
        setSuccess('User created');
        setTimeout(() => {
          setSignupStep(2);
          setSuccess('');
        }, 1500);
      } else {
        const msg = res.data?.error || res.data?.hint || 'Signup failed';
        setError(msg);
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const onSignupCompany = async () => {
    clearMessages();

    if (!companyName.trim()) {
      setError('Please enter your company name');
      return;
    }

    setLoading(true);
    try {
      const res = await api('setup-company', { companyName: companyName.trim() }, { 
        Authorization: `Bearer ${signupToken}` 
      });
      
      if (res.ok && res.data?.company?.id) {
        if (res.data.company?.orgId) {
          localStorage.setItem('activeOrgId', String(res.data.company.orgId));
        }
        // setup-company creates the head-office branch; store it, or the very
        // first protected request has no x-branch-id and 400s.
        if (res.data.branch?.id) {
          localStorage.setItem('activeBranchId', String(res.data.branch.id));
          localStorage.setItem('branchId', String(res.data.branch.id));
        }
        setSuccess('Company created');
        localStorage.setItem('token', signupToken);
        setTimeout(() => {
          onAuth && onAuth({
            token: signupToken,
            onboarding: {
              companyId: res.data.company.id,
              companyName: res.data.company.name,
              orgId: res.data.company.orgId,
              branchId: res.data.branch?.id || null,
            },
          });
        }, 1000);
      } else {
        const msg = res.data?.error || 'Company setup failed';
        setError(msg);
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const onForgotPassword = async () => {
    clearMessages();

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const res = await api('forgot-password', { email: email.trim().toLowerCase() });
      if (res.ok) {
        setSuccess(res.data?.message || 'If an account exists, a reset link has been sent to your email.');
        if (res.data?.devToken) {
          console.log('[DEV] Password reset token:', res.data.devToken);
          setSuccess(`Reset link sent! (Dev token: ${res.data.devToken})`);
        }
      } else {
        setError(res.data?.error || 'Failed to send reset email');
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const onResetPassword = async () => {
    clearMessages();

    if (!resetToken) {
      setError('Invalid reset token. Please request a new password reset.');
      return;
    }
    if (!password) {
      setError('Please enter a new password');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await api('reset-password', { token: resetToken, password });
      if (res.ok) {
        setSuccess(res.data?.message || 'Password reset successfully! You can now login.');
        setTimeout(() => {
          setMode('login');
          setPassword('');
          setConfirmPassword('');
          setResetToken('');
          // Clear URL params
          window.history.replaceState({}, document.title, window.location.pathname);
        }, 2000);
      } else {
        setError(res.data?.error || 'Failed to reset password');
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === 'login') return onLogin();
    if (mode === 'signup' && signupStep === 1) return onSignupAccount();
    if (mode === 'signup' && signupStep === 2) return onSignupCompany();
    if (mode === 'forgot') return onForgotPassword();
    if (mode === 'reset') return onResetPassword();
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setSignupStep(1);
    clearMessages();
    setSignupToken('');
  };

  // Get title and subtitle based on mode
  const getTitle = () => {
    if (mode === 'login') return 'Welcome Back';
    if (mode === 'signup' && signupStep === 1) return 'Create Account';
    if (mode === 'signup' && signupStep === 2) return 'Setup Your Company';
    if (mode === 'forgot') return 'Reset Password';
    if (mode === 'reset') return 'Set New Password';
    return 'Welcome';
  };

  const getSubtitle = () => {
    if (mode === 'login') return 'Sign in to access your account';
    if (mode === 'signup' && signupStep === 1) return 'Enter your details to get started';
    if (mode === 'signup' && signupStep === 2) return 'Create your first organization';
    if (mode === 'forgot') return 'Enter your email to receive reset instructions';
    if (mode === 'reset') return 'Choose a strong password for your account';
    return '';
  };

  if (showLanding) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <LandingPage
          onSignIn={() => {
            setMode('login');
            setShowLanding(false);
          }}
          onGetStarted={() => {
            setMode('signup');
            setShowLanding(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: 'rgb(var(--app-bg))' }}>
      <div className="min-h-screen flex">
        {/* Left: the brand side.
            Deep pine rather than the usual slate/indigo — this screen used to
            open on blue-500 and indigo-500 washes, which is the default nobody
            picked. Warm ink and brass instead, matching the app behind it. */}
        <div
          className="hidden lg:flex lg:w-[46%] relative overflow-hidden"
          style={{ backgroundColor: 'rgb(var(--brand-panel))' }}
        >
          <div
            className="absolute inset-0"
            aria-hidden="true"
            style={{
              backgroundImage:
                'radial-gradient(38rem 24rem at 20% 10%, rgb(var(--brand) / 0.55), transparent 62%),' +
                'radial-gradient(30rem 20rem at 90% 85%, rgb(var(--accent) / 0.28), transparent 60%)',
            }}
          />
          {/* Faint ledger ruling. Decorative, so it is hidden from assistive tech. */}
          <div
            className="absolute inset-0 opacity-[0.06]"
            aria-hidden="true"
            style={{
              backgroundImage: 'repeating-linear-gradient(180deg, #fff 0 1px, transparent 1px 2.25rem)',
            }}
          />

          <div className="relative z-10 p-12 flex flex-col justify-between w-full text-white">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl grid place-items-center ui-surface/10 backdrop-blur-sm ring-1 ring-white/15">
                  <BookIcon className="w-6 h-6" />
                </div>
                <div>
                  <p className="ui-display text-2xl">Ledgerly</p>
                  <p className="text-white/55 text-xs tracking-wide">GST accounting, kept straight</p>
                </div>
              </div>

              <h2 className="ui-display mt-16 text-[2.75rem] leading-[1.05] max-w-[16ch]">
                Books that balance themselves.
              </h2>
              <p className="mt-5 text-white/65 leading-relaxed max-w-[46ch]">
                Every invoice, receipt and journal posts to a real double-entry ledger the moment
                you save it. No month-end reconciliation ritual.
              </p>

              <ul className="mt-12 space-y-5">
                {[
                  ['Balanced or rejected', 'An entry that does not foot to zero is never stored.'],
                  ['Multi-company, multi-branch', 'One sign-in across every book you keep.'],
                  ['Role-based access', 'Down to individual fields and approval limits.'],
                ].map(([title, body]) => (
                  <li key={title} className="flex items-start gap-3.5">
                    <span
                      className="mt-0.5 w-6 h-6 rounded-md grid place-items-center ui-surface/10 ring-1 ring-white/15 flex-shrink-0"
                      aria-hidden="true"
                    >
                      <CheckIcon className="w-3.5 h-3.5" />
                    </span>
                    <span>
                      <span className="block font-semibold text-[0.9375rem]">{title}</span>
                      <span className="block text-white/55 text-sm mt-0.5">{body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-white/40 text-xs">
              © 2026 Ledgerly · Books stay on your server
            </p>
          </div>
        </div>

        {/* Right side - Form */}
        <div className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-md">
            {/* Mobile logo */}
            <div className="lg:hidden mb-8 text-center">
              <div className="inline-flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ backgroundColor: 'rgb(var(--brand))', color: 'rgb(var(--on-brand))' }}>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="ui-display text-xl">Ledgerly</span>
              </div>
            </div>

            <div className="ui-card p-8 ui-in">
              <div className="text-center mb-8">
                <h2 className="ui-display text-[1.75rem]">{getTitle()}</h2>
                <p className="ui-muted mt-2 text-sm">{getSubtitle()}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Login Form */}
                {mode === 'login' && (
                  <>
                    <div>
                      <label className="ui-label">Email Address</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (error) setError('');
                        }}
                        className="ui-input h-11"
                        placeholder="you@example.com"
                        autoComplete="email"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="ui-label">Password</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (error) setError('');
                          }}
                          className="ui-input h-11 pr-12"
                          placeholder="Enter your password"
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 ui-icon-btn"
                        >
                          {showPassword ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* Signup Step 1 Form */}
                {mode === 'signup' && signupStep === 1 && (
                  <>
                    <div>
                      <label className="ui-label">Full Name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (error) setError('');
                        }}
                        className="ui-input h-11"
                        placeholder="John Doe"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="ui-label">Email Address</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (error) setError('');
                        }}
                        className="ui-input h-11"
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                    </div>
                    <div>
                      <label className="ui-label">Mobile (Optional)</label>
                      <input
                        type="tel"
                        value={mobile}
                        onChange={(e) => {
                          setMobile(e.target.value);
                          if (error) setError('');
                        }}
                        className="ui-input h-11"
                        placeholder="+91 98765 43210"
                      />
                    </div>
                    <div>
                      <label className="ui-label">Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (error) setError('');
                        }}
                        className="ui-input h-11"
                        placeholder="Min 8 characters"
                        autoComplete="new-password"
                      />
                    </div>
                    <div>
                      <label className="ui-label">Confirm Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (error) setError('');
                        }}
                        className="ui-input h-11"
                        placeholder="Re-enter password"
                        autoComplete="new-password"
                      />
                    </div>
                  </>
                )}

                {/* Signup Step 2 Form */}
                {mode === 'signup' && signupStep === 2 && (
                  <div>
                    <label className="ui-label">Company / Organization Name</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => {
                        setCompanyName(e.target.value);
                        if (error) setError('');
                      }}
                      className="ui-input h-11"
                      placeholder="My Business Pvt Ltd"
                      autoFocus
                    />
                    <p className="mt-2 text-sm ui-muted">This will be your first organization. You can add more later.</p>
                  </div>
                )}

                {/* Forgot Password Form */}
                {mode === 'forgot' && (
                  <div>
                    <label className="ui-label">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError('');
                      }}
                      className="ui-input h-11"
                      placeholder="you@example.com"
                      autoFocus
                    />
                  </div>
                )}

                {/* Reset Password Form */}
                {mode === 'reset' && (
                  <>
                    <div>
                      <label className="ui-label">New Password</label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (error) setError('');
                        }}
                        className="ui-input h-11"
                        placeholder="Min 8 characters"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="ui-label">Confirm New Password</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (error) setError('');
                        }}
                        className="ui-input h-11"
                        placeholder="Re-enter password"
                      />
                    </div>
                  </>
                )}

                {/* Error Message */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 max-h-28 overflow-auto">
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-red-700 break-words">{String(error)}</p>
                  </div>
                )}

                {/* Success Message */}
                {success && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                    <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-green-700">{success}</p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="ui-btn ui-btn-brand ui-btn-lg w-full" 
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Please wait...
                    </span>
                  ) : (
                    <>
                      {mode === 'login' && 'Sign In'}
                      {mode === 'signup' && signupStep === 1 && 'Create Account'}
                      {mode === 'signup' && signupStep === 2 && 'Create Organization'}
                      {mode === 'forgot' && 'Send Reset Link'}
                      {mode === 'reset' && 'Reset Password'}
                    </>
                  )}
                </button>

                {/* Links */}
                <div className="space-y-3 pt-2">
                  {mode === 'login' && (
                    <>
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="w-full text-center text-sm ui-muted hover:text-[rgb(var(--fg))] transition-colors"
                      >
                        Forgot your password?
                      </button>
                      <div className="text-center text-sm ui-muted">
                        Don't have an account?{' '}
                        <button
                          type="button"
                          onClick={() => switchMode('signup')}
                          className="ui-fg font-semibold ui-hover-fg transition-colors"
                        >
                          Sign up here
                        </button>
                      </div>
                    </>
                  )}

                  {mode === 'signup' && signupStep === 1 && (
                    <div className="text-center text-sm ui-muted">
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => switchMode('login')}
                        className="ui-fg font-semibold ui-hover-fg transition-colors"
                      >
                        Sign in
                      </button>
                    </div>
                  )}

                  {mode === 'signup' && signupStep === 2 && (
                    <button
                      type="button"
                      onClick={() => { setSignupStep(1); clearMessages(); }}
                      className="w-full text-center text-sm ui-muted hover:text-[rgb(var(--fg))] transition-colors"
                    >
                      ← Back to account details
                    </button>
                  )}

                  {(mode === 'forgot' || mode === 'reset') && (
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="w-full text-center text-sm ui-muted hover:text-[rgb(var(--fg))] transition-colors"
                    >
                      ← Back to sign in
                    </button>
                  )}
                </div>
              </form>
            </div>

            <p className="text-center text-white/40 text-xs mt-6">
              By continuing, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthGate;
