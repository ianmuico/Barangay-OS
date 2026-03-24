'use client';

import { getGradientForId, getInitials } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface SquircleAvatarProps {
  name: string;
  id: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  sm: { outer: 'w-8 h-8', text: 'text-xs' },
  md: { outer: 'w-10 h-10', text: 'text-sm' },
  lg: { outer: 'w-14 h-14', text: 'text-lg' },
  xl: { outer: 'w-16 h-16', text: 'text-xl' },
};

export function SquircleAvatar({ name, id, size = 'md', className }: SquircleAvatarProps) {
  const [from, to] = getGradientForId(id);
  const initials = getInitials(name);
  const s = sizeMap[size];

  return (
    <div
      className={cn(
        s.outer,
        'relative flex items-center justify-center text-white font-semibold shrink-0',
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${from}, ${to})`,
        borderRadius: '22%',
      }}
    >
      <span className={s.text}>{initials}</span>
    </div>
  );
}
