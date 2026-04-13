'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'consultant' | 'viewer';
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  setUser: (user: AuthUser, token: string) => void;
  clearAuth: () => void;
  setLoading: (v: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isLoading: false,
      setUser: (user, accessToken) => set({ user, accessToken }),
      clearAuth: () => set({ user: null, accessToken: null }),
      setLoading: (isLoading) => set({ isLoading }),
    }),
    { name: 'aria-auth', partialize: (s) => ({ user: s.user, accessToken: s.accessToken }) }
  )
);
