'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Camera } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { SquircleAvatar } from '@/components/squircle-avatar';
import { getAPI, type User } from '@/lib/ipc';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'staff'>('staff');
  const [currentPassword, setCurrentPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const [photos, setPhotos] = useState<Record<number, string>>({});

  const fetchUsers = async () => {
    const api = getAPI();
    if (!api) return;
    const list = await api.getUsers();
    setUsers(list);
    // Load avatar photos for users that have one
    const entries = await Promise.all(
      list.filter(u => u.avatar_path).map(async (u) => {
        const dataUrl = await api.getImageBase64(u.avatar_path!);
        return [u.id, dataUrl] as const;
      })
    );
    setPhotos(Object.fromEntries(entries.filter(([, v]) => v) as [number, string][]));
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleUploadPhoto = async (u: User) => {
    const api = getAPI();
    if (!api) return;
    const result = await api.selectFile({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (result.canceled || !result.filePaths?.length) return;
    await api.saveAvatar(u.id, result.filePaths[0]);
    toast.success('Photo updated');
    fetchUsers();
  };

  const openNew = () => {
    setEditUser(null); setUsername(''); setFullName(''); setPassword(''); setCurrentPassword(''); setRole('staff'); setFormOpen(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u); setUsername(u.username); setFullName(u.full_name || ''); setPassword(''); setCurrentPassword(''); setRole(u.role); setFormOpen(true);
  };

  const handleSave = async () => {
    const api = getAPI();
    if (!api || !username.trim()) { toast.error('Username is required'); return; }
    setSaving(true);
    try {
      if (editUser) {
        await api.updateUser(editUser.id, { username, full_name: fullName, role });
        if (password) {
          if (!currentPassword) {
            toast.error('Your current password is required to change a password');
            setSaving(false);
            return;
          }
          // Verify admin's own password first
          if (currentUser) {
            const verify = await api.updatePassword(currentUser.id, currentPassword, currentPassword);
            if (!verify.success) {
              toast.error('Your current password is incorrect');
              setSaving(false);
              return;
            }
          }
          await api.resetPassword(editUser.id, password);
        }
        toast.success('User updated');
      } else {
        if (!password) { toast.error('Password is required'); return; }
        await api.createUser({ username, full_name: fullName, password, role });
        toast.success('User created');
      }
      setFormOpen(false);
      fetchUsers();
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const api = getAPI();
    if (!api) return;
    await api.deleteUser(deleteId);
    toast.success('User deleted');
    setDeleteId(null);
    fetchUsers();
  };

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="User Management" description="Manage system users and their roles." />
        {isAdmin && (
          <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Add User</Button>
        )}
      </div>

      <div className="space-y-3">
        {users.map((u) => (
          <Card key={u.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="group relative">
                  <SquircleAvatar name={u.full_name || u.username} id={u.id} size="md" src={photos[u.id]} />
                  {(isAdmin || u.id === currentUser?.id) && (
                    <button
                      type="button"
                      onClick={() => handleUploadPhoto(u)}
                      title="Upload photo"
                      className="absolute inset-0 flex items-center justify-center rounded-[22%] bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Camera className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div>
                  <p className="font-medium">{u.full_name || u.username}</p>
                  <p className="text-sm text-muted-foreground">@{u.username}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
                {isAdmin && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></Button>
                    {u.id !== currentUser?.id && (
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(u.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editUser ? 'Edit User' : 'Add User'}</DialogTitle>
            <DialogDescription>{editUser ? 'Update user details.' : 'Create a new user account.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Username</Label><Input value={username} onChange={(e) => setUsername(e.target.value)} /></div>
            <div className="space-y-2"><Label>Full Name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
            <div className="space-y-2"><Label>{editUser ? 'New Password (leave blank to keep)' : 'Password'}</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            {editUser && password && (
              <div className="space-y-2">
                <Label>Your Current Password</Label>
                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Required to confirm password change" />
              </div>
            )}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'staff')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this user account.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
