function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function resolveBackendOrigin(): string {
  const metaEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
  const configuredOrigin = String(
    metaEnv.VITE_NEXUS_API_ORIGIN || metaEnv.VITE_BACKEND_URL || '',
  ).trim();
  if (configuredOrigin) {
    return trimTrailingSlash(configuredOrigin);
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:4000';
  }

  const { protocol, hostname, origin } = window.location;
  if (/^https?:$/i.test(protocol) && hostname) {
    return trimTrailingSlash(origin);
  }

  return 'http://localhost:4000';
}

export const BACKEND_ORIGIN = resolveBackendOrigin();

export function apiUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${BACKEND_ORIGIN}${normalizedPath}`;
}
