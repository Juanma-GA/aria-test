import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get the basePath for API calls - works with IIS deployment
 * Uses NEXT_PUBLIC_BASE_PATH from .env.local (dev) or .env.production.local (prod)
 */
export function getBasePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH || '';
}

/**
 * Build full API URL with basePath support
 * @param path - API path (e.g., '/api/auth/login')
 * @returns Full URL with basePath included
 */
export function apiUrl(path: string): string {
  const base = getBasePath();
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
