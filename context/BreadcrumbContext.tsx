'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface BreadcrumbItem {
  label: string;
  href: string;
}

interface BreadcrumbContextType {
  items: BreadcrumbItem[];
  setItems: (items: BreadcrumbItem[]) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextType>({
  items: [],
  setItems: () => {},
});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [items, setItemsState] = useState<BreadcrumbItem[]>([]);
  const setItems = useCallback((next: BreadcrumbItem[]) => setItemsState(next), []);
  return (
    <BreadcrumbContext.Provider value={{ items, setItems }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumb() {
  return useContext(BreadcrumbContext);
}
