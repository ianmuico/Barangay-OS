'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';

interface SearchState {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
}

interface ScrollHeaderState {
  title: string;
  description: string;
  isScrolled: boolean;
  search: SearchState | null;
}

interface ScrollHeaderContextType {
  state: ScrollHeaderState;
  setTitle: (title: string, description: string) => void;
  setIsScrolled: (scrolled: boolean) => void;
  setSearch: (search: SearchState | null) => void;
  reset: () => void;
}

const defaultState: ScrollHeaderState = {
  title: '',
  description: '',
  isScrolled: false,
  search: null,
};

const ScrollHeaderContext = createContext<ScrollHeaderContextType>({
  state: defaultState,
  setTitle: () => {},
  setIsScrolled: () => {},
  setSearch: () => {},
  reset: () => {},
});

export function ScrollHeaderProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ScrollHeaderState>(defaultState);

  const setTitle = useCallback((title: string, description: string) => {
    setState((prev) => ({ ...prev, title, description }));
  }, []);

  const setIsScrolled = useCallback((isScrolled: boolean) => {
    setState((prev) => ({ ...prev, isScrolled }));
  }, []);

  const setSearch = useCallback((search: SearchState | null) => {
    setState((prev) => ({ ...prev, search }));
  }, []);

  const reset = useCallback(() => {
    setState(defaultState);
  }, []);

  return (
    <ScrollHeaderContext.Provider value={{ state, setTitle, setIsScrolled, setSearch, reset }}>
      {children}
    </ScrollHeaderContext.Provider>
  );
}

export function useScrollHeader() {
  return useContext(ScrollHeaderContext);
}
