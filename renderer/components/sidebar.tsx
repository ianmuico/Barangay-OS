'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AboutDialog } from './about-dialog';
import {
  LayoutDashboard, Users, UserCheck, HeartHandshake, Baby,
  GitBranch, FileSearch, FileText, Landmark,
  Settings, Building2, Shield, Database, Wifi, Info,
  ChevronDown, Loader2, Heart, Archive, Scale, Bell, FolderOpen, Flag, Store, UserPlus, Accessibility,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Demographic accent colors for specific tabs
const TAB_COLORS: Record<string, string> = {
  '/seniors': '#3b82f6',   // blue-500
  '/indigents': '#f59e0b', // amber-500
  '/youth': '#10b981',     // emerald-500
  '/residents': '#8b5cf6', // violet-500
  '/four-ps': '#ec4899',   // pink-500
  '/deceased': '#6b7280',  // gray-500
};

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Home',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/residents', label: 'Residents', icon: Users },
      { href: '/seniors', label: 'Senior Citizens', icon: UserCheck },
      { href: '/indigents', label: 'Indigents', icon: HeartHandshake },
      { href: '/youth', label: 'Youth', icon: Baby },
      { href: '/four-ps', label: '4Ps Beneficiaries', icon: Heart },
      { href: '/pwd', label: 'PWD', icon: Accessibility },
      { href: '/family-tree', label: 'Family Tree', icon: GitBranch },
      { href: '/deceased', label: 'Deceased', icon: Archive },
      { href: '/flagged', label: 'Flagged Residents', icon: Flag },
    ],
  },
  {
    label: 'Documents',
    items: [
      { href: '/cases', label: 'Cases & Summons', icon: Scale },
      { href: '/businesses', label: 'Businesses', icon: Store },
      { href: '/outsiders', label: 'Outside Owners', icon: UserPlus },
      { href: '/generator', label: 'Generator', icon: FileSearch },
      { href: '/documents', label: 'Saved Documents', icon: FolderOpen },
      { href: '/templates', label: 'Templates', icon: FileText },
      { href: '/officials', label: 'Officials', icon: Landmark },
    ],
  },
];

const settingsItems: NavItem[] = [
  { href: '/settings/barangay', label: 'Barangay Information', icon: Building2 },
  { href: '/settings/users', label: 'User Management', icon: Shield },
  { href: '/settings/backup', label: 'Backup & Restore', icon: Database },
  { href: '/settings/online', label: 'Online Mode', icon: Wifi },
  { href: '/settings/notifications', label: 'Notifications', icon: Bell },
];

function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  isLoading,
  onClick,
}: NavItem & { isActive: boolean; isLoading: boolean; onClick: (href: string) => void }) {
  const accentColor = TAB_COLORS[href];
  const useAccent = isActive && accentColor;

  return (
    <button
      onClick={() => onClick(href)}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors text-left',
        isActive
          ? useAccent
            ? 'text-white'
            : 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
      style={useAccent ? { backgroundColor: accentColor } : undefined}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
      {label}
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const isSettingsActive = pathname?.startsWith('/settings');
  const [loadingHref, setLoadingHref] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  // Clear loading state when pathname changes (navigation complete)
  useEffect(() => {
    setLoadingHref(null);
  }, [pathname]);

  const handleNav = (href: string) => {
    if (pathname?.startsWith(href)) return; // already on this page
    setLoadingHref(href);
    router.push(href);
  };

  return (
    <aside className="flex h-full w-60 flex-col border-r bg-card">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <h1 className="text-base font-semibold tracking-tight">Barangay System</h1>
        <span className="text-[10px] text-muted-foreground/50 font-medium">v1.3</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  {...item}
                  isActive={!!pathname?.startsWith(item.href)}
                  isLoading={loadingHref === item.href}
                  onClick={handleNav}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isSettingsActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Settings className="h-4 w-4" />
              Settings
              <ChevronDown className="ml-auto h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            {settingsItems.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href} className="flex items-center gap-2">
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => setAboutOpen(true)} className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              About
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </aside>
  );
}
