'use client';

import { useEffect, useRef } from 'react';
import { useScrollHeader } from '@/lib/scroll-header-context';

interface PageHeaderProps {
  title: string;
  description: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  const { setTitle, setIsScrolled } = useScrollHeader();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Register title with context and reset scroll state on mount
  useEffect(() => {
    setTitle(title, description);
    setIsScrolled(false);
  }, [title, description, setTitle, setIsScrolled]);

  // Intersection Observer to detect when heading scrolls out
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsScrolled(!entry.isIntersecting);
      },
      {
        // The main scroll container is the <main> element
        root: sentinel.closest('main'),
        threshold: 0,
        rootMargin: '0px',
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [setIsScrolled]);

  return (
    <div ref={sentinelRef}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
