import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get the basePath for API calls - works with IIS deployment
 * Extracts '/Customizations/Aria' from current URL if present
 */
export function getBasePath(): string {
  if (typeof window === "undefined") return "";
  const pathname = window.location.pathname;
  const match = pathname.match(/^\/Customizations\/Aria/);
  return match ? match[0] : "";
}

/**
 * Build full API URL with basePath support
 * @param path - API path (e.g., '/api/auth/login')
 * @returns Full URL with basePath included
 */
export function apiUrl(path: string): string {
  const base = getBasePath();
  // Ensure path starts with /
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
