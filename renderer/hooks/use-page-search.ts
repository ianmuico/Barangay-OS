'use client';

import { useEffect, useRef } from 'react';
import { useScrollHeader } from '@/lib/scroll-header-context';

/**
 * Register search state with the scroll header context.
 * When the page header scrolls out of view, the search appears in the topbar.
 */
export function usePageSearch(
  value: string,
  onChange: (val: string) => void,
  placeholder: string
) {
  const { setSearch } = useScrollHeader();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Stable callback ref to avoid infinite effect loops
  useEffect(() => {
    setSearch({
      value,
      onChange: (val: string) => onChangeRef.current(val),
      placeholder,
    });
  }, [value, placeholder, setSearch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => setSearch(null);
  }, [setSearch]);
}
