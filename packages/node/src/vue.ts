import { computed, readonly, ref, type ComputedRef, type Ref } from 'vue';
import type { SsoUser } from './user.js';

export interface UseSsoOptions {
  /** Where the backend mounted the SSO router. Default `/sso`. */
  baseUrl?: string;
  /** CSRF token sent with logout (form field, or header when `csrfHeaderName` is set). */
  csrfToken?: string | (() => string | undefined | null);
  /** Form field name for the CSRF token. Default `_csrf`. */
  csrfFieldName?: string;
  /** Send the CSRF token in this header (logout then uses `fetch` and follows `{ redirectTo }`). */
  csrfHeaderName?: string;
  /** Load the user immediately (browser only). Default true. */
  immediate?: boolean;
  /** fetch implementation. Default `globalThis.fetch`. */
  fetch?: typeof fetch;
}

export interface UseSsoReturn {
  user: Readonly<Ref<SsoUser | null>>;
  loading: Readonly<Ref<boolean>>;
  error: Readonly<Ref<Error | null>>;
  isAuthenticated: ComputedRef<boolean>;
  /** Reloads the current user from `GET {baseUrl}/user`. */
  refresh(): Promise<SsoUser | null>;
  /** Full page redirect to the SSO login. `returnTo` defaults to the current path. */
  login(returnTo?: string): void;
  /** Ends the backend session and the SSO session. */
  logout(): Promise<void>;
}

/**
 * Vue composable for apps using a backend-for-frontend (e.g. `@gorontalokota/sso/express`).
 * Only talks to your own backend with the session cookie: tokens never reach the browser.
 */
export function useSso(options: UseSsoOptions = {}): UseSsoReturn {
  const baseUrl = (options.baseUrl ?? '/sso').replace(/\/+$/, '');
  const fetchImpl = options.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const user = ref<SsoUser | null>(null) as Ref<SsoUser | null>;
  const loading = ref(false);
  const error = ref<Error | null>(null);
  const isAuthenticated = computed(() => user.value !== null);
  const csrfToken = (): string | undefined =>
    (typeof options.csrfToken === 'function' ? options.csrfToken() : options.csrfToken) ?? undefined;

  async function refresh(): Promise<SsoUser | null> {
    loading.value = true;
    error.value = null;

    try {
      const response = await fetchImpl(`${baseUrl}/user`, {
        credentials: 'include',
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      });

      if (response.status === 401) {
        user.value = null;
      } else if (!response.ok) {
        throw new Error(`Gagal memuat pengguna SSO (HTTP ${response.status}).`);
      } else {
        const body = (await response.json()) as { user?: SsoUser | null };
        user.value = body.user ?? null;
      }
    } catch (caught) {
      error.value = caught instanceof Error ? caught : new Error(String(caught));
      user.value = null;
    } finally {
      loading.value = false;
    }

    return user.value;
  }

  function login(returnTo?: string): void {
    const target = returnTo ?? `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`${baseUrl}/login?returnTo=${encodeURIComponent(target)}`);
  }

  async function logout(): Promise<void> {
    const token = csrfToken();

    if (options.csrfHeaderName) {
      const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

      if (token) {
        headers[options.csrfHeaderName] = token;
      }

      const response = await fetchImpl(`${baseUrl}/logout`, { method: 'POST', credentials: 'include', headers });

      if (!response.ok) {
        throw new Error(`Logout gagal (HTTP ${response.status}).`);
      }

      const body = (await response.json()) as { redirectTo?: string };
      user.value = null;
      window.location.assign(body.redirectTo ?? '/');

      return;
    }

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${baseUrl}/logout`;
    form.style.display = 'none';

    if (token) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = options.csrfFieldName ?? '_csrf';
      input.value = token;
      form.appendChild(input);
    }

    document.body.appendChild(form);
    user.value = null;
    form.submit();
  }

  if ((options.immediate ?? true) && typeof window !== 'undefined') {
    void refresh();
  }

  return {
    user: readonly(user) as Readonly<Ref<SsoUser | null>>,
    loading: readonly(loading),
    error: readonly(error) as Readonly<Ref<Error | null>>,
    isAuthenticated,
    refresh,
    login,
    logout,
  };
}
