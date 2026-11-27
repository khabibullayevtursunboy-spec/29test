let memoryToken: string | null = null;

// Vercel'dagi VITE_API_BASE_URL dan olinadi (masalan: https://apitest-h266.onrender.com)
const RAW_API_BASE: string = (((import.meta as any).env?.VITE_API_BASE_URL as string) || '').replace(/\/+$/, '');
const API_ORIGIN: string = RAW_API_BASE.replace(/\/api$/, '');

function resolveUrl(url: string): string {
  // To'liq manzil bo'lsa, o'zgartirmaymiz
  if (/^https?:\/\//i.test(url)) return url;
  // Env berilmagan bo'lsa (lokal ishlash), eski holat
  if (!RAW_API_BASE) return url;
  // "/api/..." ko'rinishidagi so'rovlar backend domeniga yo'naltiriladi
  if (url === '/api' || url.startsWith('/api/')) return API_ORIGIN + url;
  // Boshqa nisbiy yo'llar
  return RAW_API_BASE + (url.startsWith('/') ? url : '/' + url);
}

export function setAuthToken(token: string | null): void {
  memoryToken = token;
}

export function getAuthToken(): string | null {
  return memoryToken;
}

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (memoryToken) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
  }

  const response = await fetch(resolveUrl(url), {
    ...options,
    headers,
  });

  let payload: any = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }

  if (!response.ok) {
    throw new ApiError(payload?.error || 'Server bilan aloqada xatolik yuz berdi.', response.status, payload);
  }

  return payload as T;
}