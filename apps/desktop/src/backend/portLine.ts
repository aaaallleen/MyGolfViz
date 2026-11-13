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
