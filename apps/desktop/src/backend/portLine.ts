export function parsePortLine(line: string): { port: number; url: string } | null {
  let data: unknown;
  try {
    data = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { port, url } = data as { port?: unknown; url?: unknown };
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (typeof url !== 'string' || !url.startsWith(`http://127.0.0.1:${port}/`)) return null;
  return { port, url };
}

/** A status announcement the backend prints before its port line, e.g. while it upgrades the database. */
export function parseStatusLine(line: string): 'migrating' | null {
  let data: unknown;
  try {
    data = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  return (data as { status?: unknown }).status === 'migrating' ? 'migrating' : null;
}
