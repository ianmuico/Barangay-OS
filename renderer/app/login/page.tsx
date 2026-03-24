'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

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
        toast.success('Login successful');
        router.replace('/dashboard');
      } else {
        toast.error(result.error || 'Login failed');
      }
    } catch {
      toast.error('An error occurred during login');
    } finally {
      setIsLoading(false);
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
    </div>
  );
}
