export async function apiJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(url, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error((data as { error?: string }).error || `请求失败 (${res.status})`);
    (e as Error & { code?: string }).code = (data as { code?: string }).code;
    throw e;
  }
  return data as T;
}
