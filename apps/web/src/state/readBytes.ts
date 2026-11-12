/** Read a File's bytes; falls back where File.prototype.arrayBuffer is missing (older engines, jsdom). */
export async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  if (typeof Response !== 'undefined') return new Uint8Array(await new Response(file).arrayBuffer());
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}
