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

  // Forced password change state (shown after signing in with the default password)
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [loggedInUserId, setLoggedInUserId] = useState<number | null>(null);

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
        const resultAny = result as any;
        if (resultAny.mustChangePassword) {
          setLoggedInUserId(resultAny.user?.id || 1);
          setShowPasswordChange(true);
        } else {
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
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-[320px] space-y-3">
        <Input
          id="username"
          aria-label="Username"
          placeholder="Username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <Input
          id="password"
          type="password"
          aria-label="Password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Logging in...' : 'Login'}
        </Button>
      </form>

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
