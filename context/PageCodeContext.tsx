'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface PageCodeContextType {
  pageCode: string | null;
  setPageCode: (code: string | null) => void;
}

const PageCodeContext = createContext<PageCodeContextType>({
  pageCode: null,
  setPageCode: () => {},
});

export function PageCodeProvider({ children }: { children: ReactNode }) {
  const [pageCode, setPageCodeState] = useState<string | null>(null);
  const setPageCode = useCallback((code: string | null) => setPageCodeState(code), []);
  return (
    <PageCodeContext.Provider value={{ pageCode, setPageCode }}>
      {children}
    </PageCodeContext.Provider>
  );
}

export function usePageCode() {
  return useContext(PageCodeContext);
}
