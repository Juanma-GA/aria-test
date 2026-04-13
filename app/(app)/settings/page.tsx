'use client';
import { useState, useEffect } from 'react';
import { Settings, User, Lock, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';

export default function SettingsPage() {
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  // password change state
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setUser(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd !== confirmPwd) { toast.error('Passwords do not match'); return; }
    if (newPwd.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed'); }
      toast.success('Password updated');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-text flex items-center gap-2">
          <Settings size={22} className="text-blue-aria" /> Settings
        </h1>
        <p className="text-sm text-muted mt-0.5">Manage your account and preferences</p>
      </div>

      {/* Profile section */}
      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-sm flex items-center gap-2"><User size={16} className="text-blue-aria" /> Profile</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Name</label>
            <input className="form-input" value={user?.name ?? ''} readOnly />
          </div>
          <div>
            <label className="form-label">Email</label>
            <input className="form-input" value={user?.email ?? ''} readOnly />
          </div>
        </div>
        <p className="text-xs text-muted">Contact your administrator to update profile information.</p>
      </div>

      {/* Password section */}
      <div className="card p-6">
        <h2 className="font-semibold text-sm flex items-center gap-2 mb-4"><Lock size={16} className="text-blue-aria" /> Change Password</h2>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          <div>
            <label className="form-label">Current Password</label>
            <input type="password" className="form-input" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} required />
          </div>
          <div>
            <label className="form-label">New Password</label>
            <input type="password" className="form-input" value={newPwd} onChange={e => setNewPwd(e.target.value)} required minLength={8} />
          </div>
          <div>
            <label className="form-label">Confirm New Password</label>
            <input type="password" className="form-input" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* About section */}
      <div className="card p-6">
        <h2 className="font-semibold text-sm flex items-center gap-2 mb-3"><Info size={16} className="text-blue-aria" /> About</h2>
        <div className="text-xs text-muted space-y-1">
          <div><span className="text-text font-medium">Application:</span> ARIA — AI Readiness &amp; Implementation Audit</div>
          <div><span className="text-text font-medium">Version:</span> 0.1.0</div>
          <div><span className="text-text font-medium">Framework:</span> Next.js 14 · MongoDB · Mistral AI</div>
        </div>
      </div>
    </div>
  );
}
