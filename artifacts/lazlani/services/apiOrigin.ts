import Constants from 'expo-constants';

/**
 * The published mobile binary has no workflow-injected EXPO_PUBLIC_DOMAIN.
 * Keep all absolute API URLs on the configured app.json origin instead of
 * silently producing relative URLs or pointing at a development host.
 */
export function apiOrigin(): string {
  const configured = Constants.expoConfig?.extra?.apiBaseUrl;
  if (typeof configured !== 'string' || !/^https?:\/\//i.test(configured.trim())) {
    throw new Error('API adresi yapılandırılmamış.');
  }
  return configured.trim().replace(/\/+$/, '');
}

export function apiUrl(path: string): string {
  return `${apiOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}