export interface HostEnv {
  APP_URL?: string;
  SHARED_APP_URL?: string;
  NG_ALLOWED_HOSTS?: string;
  VITE_ALLOWED_HOSTS?: string;
  __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS?: string;
}

function isValidSpecificHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!h || h === '*' || h === 'true') return false;
  // Disallow overly broad domain wildcards such as .run.app
  if (h.startsWith('.')) return false;
  return /^[a-z0-9.-]+$/.test(h);
}

function extractHostname(urlOrHost: string | undefined): string | null {
  if (!urlOrHost) return null;
  const trimmed = urlOrHost.trim();
  if (!trimmed) return null;
  try {
    const parsed = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return isValidSpecificHost(parsed.hostname) ? parsed.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function resolveAllowedHosts(env: HostEnv = process.env): string[] {
  const hosts = new Set<string>(['localhost', '127.0.0.1']);

  const appHost = extractHostname(env.APP_URL);
  if (appHost) {
    hosts.add(appHost);
    // Include the matching Cloud Run shared preview host for the exact same deployment ID
    if (appHost.startsWith('ais-dev-')) {
      hosts.add(`ais-pre-${appHost.slice('ais-dev-'.length)}`);
    }
  }

  const sharedHost = extractHostname(env.SHARED_APP_URL);
  if (sharedHost) {
    hosts.add(sharedHost);
  }

  const listVars = [
    env.NG_ALLOWED_HOSTS,
    env.VITE_ALLOWED_HOSTS,
    env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS,
  ];

  for (const raw of listVars) {
    if (!raw) continue;
    for (const part of raw.split(',')) {
      const h = extractHostname(part);
      if (h) hosts.add(h);
    }
  }

  return Array.from(hosts);
}
