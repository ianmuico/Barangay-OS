'use client';

import { useState, useMemo } from 'react';
import { LogOut, Pencil, ScrollText, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useScrollHeader } from '@/lib/scroll-header-context';
import { ThemeToggle } from './theme-toggle';
import { SquircleAvatar } from './squircle-avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { getAPI, type AuditEntry } from '@/lib/ipc';
import { getGradientForId, getInitials } from '@/lib/constants';
import { toast } from 'sonner';

// Avatar with matching squircle border (not round)
function AvatarWithBorder({ name, id, size }: { name: string; id: number; size: number }) {
  const [c1, c2] = getGradientForId(id);
  const initials = getInitials(name);
  const borderWidth = size > 48 ? 3 : 2;
  const innerSize = size - borderWidth * 2;

  return (
    <div
      className="flex items-center justify-center bg-card"
      style={{ width: size, height: size, borderRadius: '22%' }}
    >
      <div
        className="flex items-center justify-center text-white font-semibold"
        style={{
          width: innerSize,
          height: innerSize,
          borderRadius: '22%',
          background: `linear-gradient(135deg, ${c1}, ${c2})`,
          fontSize: innerSize > 48 ? 20 : innerSize > 36 ? 16 : 12,
        }}
      >
        {initials}
      </div>
    </div>
  );
}

export function Topbar() {
  const { user, logout } = useAuth();
  const { state: scrollState } = useScrollHeader();
  const [editOpen, setEditOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [editName, setEditName] = useState('');
  const [editOldPassword, setEditOldPassword] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const [c1, c2] = getGradientForId(user?.id || 0);

  const openEdit = () => {
    setEditName(user?.full_name || '');
    setEditOldPassword('');
    setEditPassword('');
    setPasswordError('');
    setEditOpen(true);
  };

  const handleSaveProfile = async () => {
    const api = getAPI();
    if (!api || !user) return;
    setPasswordError('');

    // If changing password, old password is required
    if (editPassword.trim() && !editOldPassword.trim()) {
      setPasswordError('Current password is required');
      return;
    }

    setSaving(true);
    try {
      if (editName !== user.full_name) {
        await api.updateUser(user.id, { full_name: editName });
      }
      if (editPassword.trim()) {
        const result = await api.updatePassword(user.id, editOldPassword, editPassword);
        if (!result.success) {
          setPasswordError(result.error || 'Failed to update password');
          setSaving(false);
          return;
        }
      }
      toast.success('Profile updated');
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const openLogs = async () => {
    setLogsOpen(true);
    setLogsLoading(true);
    setLogSearch('');
    try {
      const api = getAPI();
      if (!api) return;
      const data = await api.getAuditLog(500);
      // Filter to last 30 days
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      setLogs(data.filter((log: AuditEntry) => new Date(log.created_at).getTime() >= cutoff));
    } finally {
      setLogsLoading(false);
    }
  };

  const filteredLogs = useMemo(() => {
    if (!logSearch.trim()) return logs;
    const q = logSearch.toLowerCase();
    return logs.filter(
      (log) =>
        log.action.toLowerCase().includes(q) ||
        (log.details && log.details.toLowerCase().includes(q)) ||
        (log.username && log.username.toLowerCase().includes(q))
    );
  }, [logs, logSearch]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const actionLabels: Record<string, string> = {
    RESIDENT_CREATED: 'Created',
    RESIDENT_UPDATED: 'Updated',
    RESIDENT_DELETED: 'Deleted',
    REPORT_GENERATED: 'Report',
    LOGIN: 'Login',
    LOGOUT: 'Logout',
    BACKUP_CREATED: 'Backup',
    BACKUP_RESTORED: 'Restored',
    USER_CREATED: 'User Added',
    USER_UPDATED: 'User Edit',
    OFFICIAL_CREATED: 'Official',
    TEMPLATE_CREATED: 'Template',
  };

  const actionDots: Record<string, string> = {
    RESIDENT_CREATED: 'bg-emerald-500',
    RESIDENT_UPDATED: 'bg-blue-500',
    RESIDENT_DELETED: 'bg-red-500',
    REPORT_GENERATED: 'bg-purple-500',
    LOGIN: 'bg-amber-500',
    LOGOUT: 'bg-gray-400',
    BACKUP_CREATED: 'bg-teal-500',
    BACKUP_RESTORED: 'bg-orange-500',
  };

  return (
    <>
      <header className="flex h-14 items-center border-b bg-card px-6 gap-2">
        {/* Scroll-aware page title + search */}
        <div
          className={`flex items-center gap-3 flex-1 min-w-0 transition-all duration-200 ${
            scrollState.isScrolled ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none'
          }`}
        >
          <div className="shrink-0">
            <h3 className="text-sm font-semibold leading-tight truncate">{scrollState.title}</h3>
          </div>
          {scrollState.search && (
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder={scrollState.search.placeholder}
                value={scrollState.search.value}
                onChange={(e) => scrollState.search?.onChange(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
        <ThemeToggle />

        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors">
              <SquircleAvatar name={user?.full_name || user?.username || 'U'} id={user?.id || 0} size="sm" />
              <span className="text-sm font-medium">{user?.full_name || user?.username || 'User'}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-0 overflow-hidden">
            {/* Cover gradient */}
            <div className="h-16 relative" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
              <div className="absolute -bottom-7 left-1/2 -translate-x-1/2">
                <AvatarWithBorder name={user?.full_name || user?.username || 'U'} id={user?.id || 0} size={56} />
              </div>
            </div>

            {/* Profile info */}
            <div className="pt-9 pb-3 text-center px-4">
              <p className="text-sm font-semibold">{user?.full_name || user?.username || 'User'}</p>
              <p className="text-xs text-muted-foreground">@{user?.username}</p>
              <Badge variant="outline" className="mt-1.5 text-[10px] capitalize">
                {user?.role}
              </Badge>
              <p className="text-[10px] text-muted-foreground mt-1">
                Joined {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }) : '—'}
              </p>
            </div>

            {/* Actions */}
            <div className="border-t px-2 py-2 space-y-0.5">
              <button
                onClick={openEdit}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                Edit Profile
              </button>
              <button
                onClick={openLogs}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <ScrollText className="h-3.5 w-3.5 text-muted-foreground" />
                Activity Logs
              </button>
            </div>

            <div className="border-t px-2 py-2">
              <button
                onClick={logout}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                Logout
              </button>
            </div>
          </PopoverContent>
        </Popover>
        </div>
      </header>

      {/* Edit Profile Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden" closeClassName="text-white">
          <DialogDescription className="sr-only">Edit your profile details</DialogDescription>
          <div className="h-20 relative" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
              <AvatarWithBorder name={user?.full_name || user?.username || 'U'} id={user?.id || 0} size={68} />
            </div>
          </div>
          <div className="pt-10 pb-2 text-center">
            <DialogHeader>
              <DialogTitle className="text-center">Edit Profile</DialogTitle>
            </DialogHeader>
          </div>
          <div className="px-6 pb-6 space-y-4">
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Your full name" />
            </div>
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input
                type="password"
                value={editOldPassword}
                onChange={(e) => { setEditOldPassword(e.target.value); setPasswordError(''); }}
                placeholder="Required to change password"
              />
              {passwordError && (
                <p className="text-xs text-destructive">{passwordError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Leave blank to keep current" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Activity Logs Dialog */}
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Activity Logs</DialogTitle>
            <DialogDescription>Last 30 days · {filteredLogs.length} entries</DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              className="pl-9"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto -mx-6">
            {logsLoading ? (
              <div className="space-y-0 px-6">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-0 py-3 border-b animate-pulse">
                    <div className="h-2 w-2 rounded-full bg-muted" />
                    <div className="flex-1 flex items-center gap-4">
                      <div className="h-3 w-24 bg-muted rounded" />
                      <div className="h-3 w-48 bg-muted rounded" />
                    </div>
                    <div className="h-3 w-20 bg-muted rounded" />
                  </div>
                ))}
              </div>
            ) : filteredLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {logSearch ? 'No matching logs found.' : 'No activity logs in the last 30 days.'}
              </p>
            ) : (
              <div className="divide-y">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 px-6 py-2.5 hover:bg-muted/30 transition-colors"
                  >
                    {/* Dot */}
                    <div className={`h-2 w-2 rounded-full shrink-0 ${actionDots[log.action] || 'bg-muted-foreground'}`} />

                    {/* Action label */}
                    <span className="text-xs font-medium w-16 shrink-0 truncate">
                      {actionLabels[log.action] || log.action.replace(/_/g, ' ')}
                    </span>

                    {/* Details */}
                    <p className="text-xs text-muted-foreground flex-1 min-w-0 truncate">
                      {log.details || '—'}
                    </p>

                    {/* User */}
                    {log.username && (
                      <span className="text-[10px] text-muted-foreground shrink-0 w-16 text-right truncate">
                        {log.username}
                      </span>
                    )}

                    {/* Date & time */}
                    <div className="text-right shrink-0 w-24">
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(log.created_at)}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 ml-1.5">
                        {formatTime(log.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
