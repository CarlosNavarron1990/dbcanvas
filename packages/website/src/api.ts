const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000';

export async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem('dbc_token');
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function register(email: string, name: string, password: string) {
  const data = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, name, password }),
  });
  if (data.token) localStorage.setItem('dbc_token', data.token);
  return data;
}

export async function login(email: string, password: string) {
  const data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data.token) localStorage.setItem('dbc_token', data.token);
  return data;
}

export function logout() {
  localStorage.removeItem('dbc_token');
  window.location.href = '/';
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem('dbc_token');
}

export async function getMyLicense() {
  return apiFetch('/api/license/me');
}

export async function createSubscription(tier: string) {
  return apiFetch('/api/payments/create-subscription', {
    method: 'POST',
    body: JSON.stringify({ tier }),
  });
}

export async function activateSubscription(subscriptionId: string, tier: string) {
  return apiFetch('/api/payments/activate', {
    method: 'POST',
    body: JSON.stringify({ subscriptionId, tier }),
  });
}

export async function cancelSubscription() {
  return apiFetch('/api/payments/cancel', { method: 'POST' });
}

export async function getPayPalConfig() {
  return apiFetch('/api/payments/config');
}

// Account
export async function getProfile() { return apiFetch('/api/account/profile'); }
export async function updateProfile(data: { name?: string }) {
  return apiFetch('/api/account/profile', { method: 'PATCH', body: JSON.stringify(data) });
}
export async function changePassword(currentPassword: string, newPassword: string) {
  return apiFetch('/api/account/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
}
export async function getBilling() { return apiFetch('/api/account/billing'); }
export async function getLicense() { return apiFetch('/api/account/license'); }
export async function getUsageStats() { return apiFetch('/api/account/usage'); }
