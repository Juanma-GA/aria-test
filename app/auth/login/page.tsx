'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/lib/store/authStore';
import { apiUrl } from '@/lib/utils';

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const doLogin = async (loginEmail: string, loginPassword: string) => {
    const res = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || data.message || 'Invalid credentials');
    }

    const data = await res.json();
    setUser(data.user, data.accessToken);
    router.push('/dashboard');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await doLogin(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoSetup = async () => {
    setError('');
    setIsDemoLoading(true);
    try {
      const seedRes = await fetch(apiUrl('/api/seed'), { method: 'POST' });
      if (!seedRes.ok) {
        const data = await seedRes.json().catch(() => ({}));
        throw new Error(data.error || 'Seed failed');
      }
      const seedData = await seedRes.json();
      // Auto-login with demo credentials returned from seed, or use defaults
      const demoEmail = seedData.email || 'demo@aria.ai';
      const demoPassword = seedData.password || 'demo1234';
      await doLogin(demoEmail, demoPassword);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Demo setup failed');
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left navy panel */}
      <div
        className="hidden lg:flex flex-col justify-between p-10 w-[480px] shrink-0"
        style={{ backgroundColor: '#0B1929' }}
      >
        {/* Logo */}
        <div>
          <span className="font-display text-4xl font-bold text-blue-light tracking-tight">
            ARIA
          </span>
          <span className="block text-sm text-slate-400 mt-1 font-sans">
            by Atexis
          </span>
        </div>

        {/* Description */}
        <div className="space-y-6">
          <h1 className="font-display text-3xl font-bold text-white leading-snug">
            AI Readiness &amp; Impact Audit
          </h1>
          <p className="text-slate-300 text-sm leading-relaxed">
            A structured framework to identify, assess, and prioritise AI use
            cases across your organisation — from process discovery to POC
            governance.
          </p>
          <ul className="space-y-3 text-sm text-slate-400">
            {[
              'Process-level AI opportunity mapping',
              'Sovereignty & compliance scoring',
              'ROI-driven use case prioritisation',
              'POC lifecycle tracking',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-blue-light shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-slate-600">
          &copy; {new Date().getFullYear()} Atexis. All rights reserved.
        </p>
      </div>

      {/* Right white panel */}
      <div className="flex flex-1 items-center justify-center bg-smoke px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 lg:hidden text-center">
            <span className="font-display text-3xl font-bold text-navy tracking-tight">
              ARIA
            </span>
            <span className="block text-xs text-muted mt-0.5">by Atexis</span>
          </div>

          <div className="card p-8">
            <div className="mb-6">
              <h2 className="font-display text-xl font-bold text-text">
                Welcome back
              </h2>
              <p className="text-sm text-muted mt-1">Sign in to your account</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="form-label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                  placeholder="you@company.com"
                  disabled={isLoading || isDemoLoading}
                />
              </div>

              <div>
                <label htmlFor="password" className="form-label">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input"
                  placeholder="••••••••"
                  disabled={isLoading || isDemoLoading}
                />
              </div>

              {error && (
                <div className="rounded-sm bg-red-sov-light border border-red-sov/20 px-3 py-2 text-sm text-red-sov">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || isDemoLoading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {isLoading && <Loader2 size={15} className="animate-spin" />}
                {isLoading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="mt-5 pt-5 border-t border-border text-center">
              <p className="text-xs text-muted mb-2">No account yet?</p>
              <button
                type="button"
                onClick={handleDemoSetup}
                disabled={isLoading || isDemoLoading}
                className="btn-secondary w-full flex items-center justify-center gap-2 text-xs"
              >
                {isDemoLoading && (
                  <Loader2 size={13} className="animate-spin" />
                )}
                {isDemoLoading
                  ? 'Setting up demo…'
                  : 'First time? Run demo setup'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
