'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff, Shield, Smartphone, KeyRound } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleChip } from '@/components/ui/toggle-chip';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getAPI, type AppRole, type AppUser, type RolePerms } from '@/lib/ipc';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

const NO_PERMS: RolePerms = { search: false, read: false, create: false, delete: false };

function permsOf(r: AppRole): RolePerms {
  return { search: !!r.perm_search, read: !!r.perm_read, create: !!r.perm_create, delete: !!r.perm_delete };
}

export default function AppUsersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [roles, setRoles] = useState<AppRole[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [onlineEnabled, setOnlineEnabled] = useState(true);

  // Role dialog
  const [roleOpen, setRoleOpen] = useState(false);
  const [editRole, setEditRole] = useState<AppRole | null>(null);
  const [roleName, setRoleName] = useState('');
  const [rolePerms, setRolePerms] = useState<RolePerms>(NO_PERMS);
  const [deleteRoleId, setDeleteRoleId] = useState<number | null>(null);

  // User dialog
  const [userOpen, setUserOpen] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [uName, setUName] = useState('');
  const [uFull, setUFull] = useState('');
  const [uPass, setUPass] = useState('');
  const [uRole, setURole] = useState<string>('');
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Record<number, string>>({});

  const load = async () => {
    const api = getAPI();
    if (!api) return;
    try {
      setRoles(await api.listAppRoles());
      setUsers(await api.listAppUsers());
      setOnlineEnabled((await api.getSetting('online_enabled')) !== '0');
    } catch { /* not admin */ }
  };
  useEffect(() => { load(); }, []);

  // ── Roles ──
  const openNewRole = () => { setEditRole(null); setRoleName(''); setRolePerms({ ...NO_PERMS, search: true, read: true }); setRoleOpen(true); };
  const openEditRole = (r: AppRole) => { setEditRole(r); setRoleName(r.name); setRolePerms(permsOf(r)); setRoleOpen(true); };
  const saveRole = async () => {
    const api = getAPI();
    if (!api || !roleName.trim()) { toast.error('Role name is required'); return; }
    if (editRole) await api.updateAppRole(editRole.id, { name: roleName.trim(), perms: rolePerms });
    else await api.createAppRole(roleName.trim(), rolePerms);
    toast.success('Role saved');
    setRoleOpen(false);
    load();
  };
  const doDeleteRole = async () => {
    const api = getAPI();
    if (!api || !deleteRoleId) return;
    const res = await api.deleteAppRole(deleteRoleId);
    if (res.success) toast.success('Role deleted');
    else toast.error(res.error || 'Cannot delete role');
    setDeleteRoleId(null);
    load();
  };

  // ── Users ──
  const openNewUser = () => { setEditUser(null); setUName(''); setUFull(''); setUPass(''); setURole(roles[0] ? String(roles[0].id) : ''); setUserOpen(true); };
  const openEditUser = (u: AppUser) => { setEditUser(u); setUName(u.username); setUFull(u.full_name || ''); setUPass(''); setURole(u.role_id ? String(u.role_id) : ''); setUserOpen(true); };
  const saveUser = async () => {
    const api = getAPI();
    if (!api || !uName.trim()) { toast.error('Username is required'); return; }
    if (!editUser && !uPass) { toast.error('Password is required'); return; }
    if (editUser) {
      await api.updateAppUser(editUser.id, { username: uName.trim(), full_name: uFull.trim() || null, role_id: uRole ? Number(uRole) : null, ...(uPass ? { password: uPass } : {}) });
    } else {
      await api.createAppUser({ username: uName.trim(), full_name: uFull.trim() || null, password: uPass, role_id: uRole ? Number(uRole) : null });
    }
    toast.success('User saved');
    setUserOpen(false);
    load();
  };
  const doDeleteUser = async () => {
    const api = getAPI();
    if (!api || !deleteUserId) return;
    await api.deleteAppUser(deleteUserId);
    toast.success('User deleted');
    setDeleteUserId(null);
    load();
  };
  const toggleReveal = async (u: AppUser) => {
    if (revealed[u.id]) { setRevealed(prev => { const n = { ...prev }; delete n[u.id]; return n; }); return; }
    const api = getAPI();
    if (!api) return;
    const pw = await api.revealAppUserPassword(u.id);
    if (pw !== null) setRevealed(prev => ({ ...prev, [u.id]: pw }));
  };
  const toggleUserActive = async (u: AppUser) => {
    const api = getAPI();
    if (!api) return;
    await api.updateAppUser(u.id, { is_active: u.is_active ? 0 : 1 });
    load();
  };

  const setOnline = async (on: boolean) => {
    const api = getAPI();
    if (!api) return;
    await api.setSetting('online_enabled', on ? '1' : '0');
    setOnlineEnabled(on);
    toast.success(on ? 'Online access enabled' : 'Online access disabled — the mobile app cannot log in');
  };

  const permBadges = (r: AppRole) => {
    const list: string[] = [];
    if (r.perm_search) list.push('Search');
    if (r.perm_read) list.push('Read');
    if (r.perm_create) list.push('Create/Edit');
    if (r.perm_delete) list.push('Delete');
    return list.length ? list : ['No access'];
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mobile App Users & Roles" description="Manage who can use the mobile app." />
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Only administrators can manage mobile app users and roles.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Mobile App Users & Roles" description="Accounts and permissions for the mobile partner app (separate from desktop logins)." />

      {/* Online toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Smartphone className="h-4 w-4" />Online App Access</CardTitle>
          <CardDescription>Master switch — when off, no mobile user can log in even if the server is running.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{onlineEnabled ? 'Mobile app access is ON' : 'Mobile app access is OFF'}</p>
              <p className="text-xs text-muted-foreground">Configure the server itself under Settings → Online Mode.</p>
            </div>
            <Switch checked={onlineEnabled} onCheckedChange={setOnline} />
          </div>
        </CardContent>
      </Card>

      {/* Roles */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4" />Roles</CardTitle>
            <CardDescription>Each role grants any of: Search, Read, Create/Edit, Delete.</CardDescription>
          </div>
          <Button size="sm" onClick={openNewRole}><Plus className="mr-2 h-4 w-4" />New Role</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {roles.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {r.name}
                  {!!r.is_system && <Badge variant="secondary" className="text-[10px]">System</Badge>}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {permBadges(r).map(p => <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>)}
                </div>
              </div>
              <div className="flex shrink-0 gap-0.5">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditRole(r)}><Pencil className="h-4 w-4" /></Button>
                {!r.is_system && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteRoleId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Users */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" />Mobile Users</CardTitle>
            <CardDescription>These accounts log into the mobile app. Passwords are viewable (local-first).</CardDescription>
          </div>
          <Button size="sm" onClick={openNewUser} disabled={roles.length === 0}><Plus className="mr-2 h-4 w-4" />New User</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No mobile users yet.</p>
          ) : users.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="min-w-0">
                <p className={`text-sm font-medium ${u.is_active ? '' : 'text-muted-foreground line-through'}`}>
                  {u.full_name || u.username} <span className="font-normal text-muted-foreground">@{u.username}</span>
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">{u.role_name || 'No role'}</Badge>
                  <span className="font-mono">{revealed[u.id] !== undefined ? revealed[u.id] : '••••••••'}</span>
                  <button onClick={() => toggleReveal(u)} className="hover:text-foreground" title="Show/hide password">
                    {revealed[u.id] !== undefined ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Switch checked={!!u.is_active} onCheckedChange={() => toggleUserActive(u)} title="Active" />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditUser(u)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteUserId(u.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Role dialog */}
      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editRole ? 'Edit Role' : 'New Role'}</DialogTitle>
            <DialogDescription>Name the role and choose what it can do in the mobile app.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Role Name</Label>
              <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="e.g. Purok Leader" />
            </div>
            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="flex flex-wrap gap-1.5">
                <ToggleChip checked={rolePerms.search} onCheckedChange={(c) => setRolePerms(p => ({ ...p, search: c }))}>Search</ToggleChip>
                <ToggleChip checked={rolePerms.read} onCheckedChange={(c) => setRolePerms(p => ({ ...p, read: c }))}>Read</ToggleChip>
                <ToggleChip checked={rolePerms.create} onCheckedChange={(c) => setRolePerms(p => ({ ...p, create: c }))}>Create / Edit</ToggleChip>
                <ToggleChip checked={rolePerms.delete} onCheckedChange={(c) => setRolePerms(p => ({ ...p, delete: c }))}>Delete</ToggleChip>
              </div>
              <p className="text-[11px] text-muted-foreground">Read-only role = Search + Read (can view the list, cannot modify).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleOpen(false)}>Cancel</Button>
            <Button onClick={saveRole}>Save Role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User dialog */}
      <Dialog open={userOpen} onOpenChange={setUserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editUser ? 'Edit User' : 'New Mobile User'}</DialogTitle>
            <DialogDescription>The user logs into the mobile app with these credentials.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input value={uName} onChange={(e) => setUName(e.target.value)} placeholder="e.g. maria.leader" />
            </div>
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={uFull} onChange={(e) => setUFull(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{editUser ? 'New Password (leave blank to keep)' : 'Password'}</Label>
              <Input value={uPass} onChange={(e) => setUPass(e.target.value)} placeholder="Visible to admin later" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={uRole} onValueChange={setURole}>
                <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                <SelectContent>
                  {roles.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserOpen(false)}>Cancel</Button>
            <Button onClick={saveUser}>Save User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deletes */}
      <AlertDialog open={deleteRoleId !== null} onOpenChange={() => setDeleteRoleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>Roles in use by a user can&apos;t be deleted until those users are reassigned.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteRole} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteUserId !== null} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Mobile User</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the mobile account.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
