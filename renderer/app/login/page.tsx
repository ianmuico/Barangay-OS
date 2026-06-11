'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { getAPI } from '@/lib/ipc';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  // Forced password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [loggedInUserId, setLoggedInUserId] = useState<number | null>(null);

  // Forgot-password recovery (uses a printed one-time recovery code)
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recUsername, setRecUsername] = useState('');
  const [recCode, setRecCode] = useState('');
  const [recPassword, setRecPassword] = useState('');
  const [recConfirm, setRecConfirm] = useState('');
  const [recovering, setRecovering] = useState(false);

  const handleRecovery = async () => {
    const api = getAPI();
    if (!api) return;
    if (!recUsername.trim() || !recCode.trim() || !recPassword) {
      toast.error('All fields are required');
      return;
    }
    if (recPassword !== recConfirm) {
      toast.error('Passwords do not match');
      return;
    }
    setRecovering(true);
    try {
      const result = await api.recoveryReset(recUsername.trim(), recCode.trim(), recPassword);
      if (result.success) {
        toast.success('Password reset — you can sign in with your new password. The code has been used up.');
        setRecoveryOpen(false);
        setUsername(recUsername.trim());
        setPassword('');
        setRecUsername(''); setRecCode(''); setRecPassword(''); setRecConfirm('');
      } else {
        toast.error(result.error || 'Recovery failed');
      }
    } finally {
      setRecovering(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error('Please enter both username and password');
      return;
    }

    setIsLoading(true);
    try {
      const result = await login(username, password);
      if (result.success) {
        // Check if forced password change is needed
        const resultAny = result as any;
        if (resultAny.mustChangePassword) {
          setLoggedInUserId(resultAny.user?.id || 1);
          setShowPasswordChange(true);
        } else {
          toast.success('Login successful');
          router.replace('/dashboard');
        }
      } else {
        toast.error(result.error || 'Login failed');
      }
    } catch {
      toast.error('An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    const api = getAPI();
    if (!api || !loggedInUserId) return;

    setChangingPassword(true);
    try {
      const result = await api.updatePassword(loggedInUserId, password, newPassword);
      if (result.success) {
        toast.success('Password changed successfully');
        setShowPasswordChange(false);
        router.replace('/dashboard');
      } else {
        toast.error(result.error || 'Failed to change password');
      }
    } catch {
      toast.error('An error occurred');
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel — dark with branding */}
      <div className="hidden lg:flex lg:w-[50%] relative flex-col justify-between bg-zinc-900 text-white p-10">
        {/* Top — logo + app name */}
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="Logo" className="w-8 h-8" />
          <span className="text-base font-semibold">Barangay Management System</span>
        </div>

        {/* Bottom — testimonial / quote */}
        <div>
          <blockquote className="text-lg leading-relaxed">
            &ldquo;A complete offline-first solution for managing resident records, generating reports, and streamlining barangay operations.&rdquo;
          </blockquote>
          <div className="mt-4">
            <p className="text-sm font-medium">Percival Ian Muico</p>
            <p className="text-sm text-zinc-400">The Boring Solutions</p>
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-[350px]">
          {/* Mobile-only header */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-zinc-900 mx-auto mb-4 flex items-center justify-center">
              <img src="/favicon.svg" alt="Logo" className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-bold">Barangay Management System</h1>
          </div>

          {/* Heading */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground mt-1.5">Enter your credentials below to sign in</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setRecoveryOpen(true)}
            className="mt-3 block w-full text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Forgot password?
          </button>

          {/* Bottom credit on mobile */}
          <div className="lg:hidden mt-10 text-center">
            <p className="text-[10px] text-muted-foreground/50 uppercase tracking-widest">Developed by</p>
            <p className="text-xs text-muted-foreground mt-0.5">The Boring Solutions</p>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            v1.3
          </p>
        </div>
      </div>

      {/* Forgot Password — recovery code dialog */}
      <Dialog open={recoveryOpen} onOpenChange={(open) => { if (!recovering) setRecoveryOpen(open); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Password with a Recovery Code</DialogTitle>
            <DialogDescription>
              Use one of the printed recovery codes kept by the barangay. Each code works once.
              No codes? An admin can generate them in Settings → User Management.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Username of the account to reset</Label>
              <Input value={recUsername} onChange={(e) => setRecUsername(e.target.value)} placeholder="e.g., admin" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Recovery Code</Label>
              <Input
                value={recCode}
                onChange={(e) => setRecCode(e.target.value.toUpperCase())}
                placeholder="XXXXX-XXXXX"
                className="font-mono tracking-widest"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">New Password</Label>
              <Input type="password" value={recPassword} onChange={(e) => setRecPassword(e.target.value)} placeholder="At least 6 characters" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Confirm New Password</Label>
              <Input type="password" value={recConfirm} onChange={(e) => setRecConfirm(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecoveryOpen(false)} disabled={recovering}>Cancel</Button>
            <Button onClick={handleRecovery} disabled={recovering}>
              {recovering ? 'Resetting...' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Forced Password Change Dialog */}
      <Dialog open={showPasswordChange} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm" hideClose>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Change Default Password
            </DialogTitle>
            <DialogDescription>
              You are using the default password. Please change it before continuing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Confirm Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handlePasswordChange}
              disabled={changingPassword || newPassword.length < 6 || newPassword !== confirmPassword}
            >
              {changingPassword ? 'Changing...' : 'Change Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
