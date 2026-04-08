import { createAuthClient } from "@boolean-systems-packages/api-auth";
import { getFingerprint, getOrCreateDeviceId } from "./device";
import type { AuthConfig, AuthState, LoginPayload, ResumePayload } from "./types";
import type { User, TokenPair } from "@boolean-systems-packages/api-auth";

// ─────────────────────────────────────────────
// Storage keys (con defaults)
// ─────────────────────────────────────────────

const DEFAULT_KEYS = {
  accessToken: "boolean_access_token",
  refreshToken: "boolean_refresh_token",
  user: "boolean_user",
  deviceId: "boolean_device_id",
};

type AuthChangeCallback = (state: AuthState) => void;

// ─────────────────────────────────────────────
// AuthManager
// ─────────────────────────────────────────────

/**
 * Manager central de autenticación para frontends Boolean.
 *
 * Responsabilidades:
 * - Autenticación con credenciales (login) o tokens existentes (resume)
 * - Persistencia de tokens en localStorage
 * - Refresh automático ante 401
 * - Generación automática de device context (fingerprint, deviceId)
 * - Notificación reactiva del estado de sesión
 *
 * @example
 * const auth = createAuth({
 *   baseURL: "https://portal.boolean.com.ar/api/auth/v3",
 *   onLogin: (user) => router.push("/dashboard"),
 *   onLogout: () => router.push("/login"),
 * });
 *
 * // Iniciar sesión
 * await auth.login({ email, password });
 *
 * // Recuperar sesión existente (al arrancar la app)
 * await auth.resume({ accessToken: "eyJ..." });
 *
 * // Para otros SDKs:
 * const inventory = createInventoryClient({
 *   getAuthHeader: () => auth.getAuthHeader(),
 * });
 */
export class AuthManager {
  private readonly config: AuthConfig;
  private readonly keys: Required<NonNullable<AuthConfig["storage"]>>;

  private _user: User | null = null;
  private _accessToken: string | null = null;
  private _refreshToken: string | null = null;

  private listeners: Set<AuthChangeCallback> = new Set();

  // El cliente de auth se crea de forma lazy porque necesita el fingerprint
  // (async) para el device context.
  private _client: ReturnType<typeof createAuthClient> | null = null;

  constructor(config: AuthConfig) {
    this.config = config;
    this.keys = {
      accessToken: config.storage?.accessToken ?? DEFAULT_KEYS.accessToken,
      refreshToken: config.storage?.refreshToken ?? DEFAULT_KEYS.refreshToken,
      user: config.storage?.user ?? DEFAULT_KEYS.user,
      deviceId: config.storage?.deviceId ?? DEFAULT_KEYS.deviceId,
    };

    // Intenta restaurar la sesión desde localStorage al instanciar
    this._restoreFromStorage();
  }

  // ─────────────────────────────────────────────
  // API pública
  // ─────────────────────────────────────────────

  /**
   * Inicia sesión con email y contraseña.
   * Persiste los tokens y notifica el cambio de estado.
   *
   * @example
   * const { data, errors } = await auth.login({ email, password });
   * if (errors.length) showErrors(errors);
   */
  async login(payload: LoginPayload) {
    const client = await this._getClient();
    const response = await client.sessions.login(payload);

    if (response.data) {
      this._handleSession(response.data.user, response.data.tokens);
    }

    return response;
  }

  /**
   * Reanuda una sesión con tokens existentes.
   * Útil cuando los tokens vienen de SSO, OAuth, o un storage propio.
   *
   * Si solo pasás el accessToken, el refresh automático no funcionará
   * hasta que el usuario vuelva a iniciar sesión.
   *
   * @example
   * // Al iniciar la app, restaurar sesión desde tu propio storage:
   * await auth.resume({
   *   accessToken: myStorage.get("token"),
   *   refreshToken: myStorage.get("refresh"),
   * });
   *
   * @returns `true` si el perfil se cargó; `false` si falló GET /me/ (tokens limpiados, no lanza).
   */
  async resume(payload: ResumePayload): Promise<boolean> {
    this._accessToken = payload.accessToken;
    this._refreshToken = payload.refreshToken ?? null;

    localStorage.setItem(this.keys.accessToken, payload.accessToken);
    if (payload.refreshToken) {
      localStorage.setItem(this.keys.refreshToken, payload.refreshToken);
    }

    // Trae el perfil del usuario con el token provisto
    try {
      const client = await this._getClient();
      const { data } = await client.me.get();
      this._user = data;
      localStorage.setItem(this.keys.user, JSON.stringify(data));
    } catch (err) {
      // 401, red, CORS, baseURL mal armada, etc. — limpia todo
      console.warn(
        "[@boolean-systems-packages/auth] resume: falló GET perfil (p. ej. /mi-usuario/). Revisá REACT_APP_API_AUTH, authScheme, CORS y el token.",
        err
      );
      this._clear();
      return false;
    }

    this._notify();
    return true;
  }

  /**
   * Cierra la sesión: limpia tokens del storage y notifica.
   */
  async logout() {
    try {
      const client = await this._getClient();
      await client.sessions.logout();
    } catch {
      // Si el logout falla (ej: token ya vencido), igual limpiamos local
    } finally {
      this._clear();
      this.config.onLogout?.();
    }
  }

  /**
   * Usuario autenticado actualmente. `null` si no hay sesión.
   */
  get user(): User | null {
    return this._user;
  }

  /**
   * `true` si hay una sesión activa.
   */
  get isLoggedIn(): boolean {
    return this._accessToken !== null;
  }

  /**
   * Retorna el accessToken actual. `null` si no hay sesión.
   */
  getAccessToken(): string | null {
    return this._accessToken;
  }

  /**
   * Retorna el header Authorization listo para usar en otros SDKs.
   * Retorna cadena vacía si no hay sesión (en vez de "Bearer null").
   *
   * @example
   * const inventory = createInventoryClient({
   *   baseURL: "...",
   *   getAuthHeader: () => auth.getAuthHeader(),
   * });
   */
  getAuthHeader(): string {
    if (!this._accessToken) return "";
    const scheme = this.config.authScheme ?? "Bearer";
    return `${scheme} ${this._accessToken}`;
  }

  /**
   * Suscribe un callback a los cambios de estado de auth.
   * Retorna una función para desuscribirse.
   *
   * @example
   * const unsub = auth.onAuthChange(({ loggedIn, user }) => {
   *   if (!loggedIn) router.push("/login");
   * });
   *
   * // Cleanup (en useEffect, onUnmounted, etc.)
   * unsub();
   */
  onAuthChange(callback: AuthChangeCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // ─────────────────────────────────────────────
  // Internals
  // ─────────────────────────────────────────────

  private get _state(): AuthState {
    return {
      loggedIn: this.isLoggedIn,
      user: this._user,
      accessToken: this._accessToken,
    };
  }

  private _notify() {
    const state = this._state;
    this.listeners.forEach((cb) => cb(state));
  }

  private _handleSession(user: User, tokens: TokenPair) {
    this._user = user;
    this._accessToken = tokens.accessToken;
    this._refreshToken = tokens.refreshToken;

    localStorage.setItem(this.keys.accessToken, tokens.accessToken);
    localStorage.setItem(this.keys.refreshToken, tokens.refreshToken);
    localStorage.setItem(this.keys.user, JSON.stringify(user));

    this.config.onLogin?.(user);
    this._notify();
  }

  private _clear() {
    this._user = null;
    this._accessToken = null;
    this._refreshToken = null;
    this._client = null; // fuerza recreación del cliente con estado limpio

    localStorage.removeItem(this.keys.accessToken);
    localStorage.removeItem(this.keys.refreshToken);
    localStorage.removeItem(this.keys.user);

    this._notify();
  }

  private _restoreFromStorage() {
    const accessToken = localStorage.getItem(this.keys.accessToken);
    const refreshToken = localStorage.getItem(this.keys.refreshToken);
    const rawUser = localStorage.getItem(this.keys.user);

    if (!accessToken) return;

    this._accessToken = accessToken;
    this._refreshToken = refreshToken;
    this._user = rawUser ? (JSON.parse(rawUser) as User) : null;
  }

  /**
   * Crea (o retorna) el cliente de auth con device context generado.
   * Es lazy porque el fingerprint requiere crypto.subtle (async).
   */
  private async _getClient(): Promise<ReturnType<typeof createAuthClient>> {
    if (this._client) return this._client;

    const [fingerprint, deviceId] = await Promise.all([
      getFingerprint(),
      Promise.resolve(getOrCreateDeviceId(this.keys.deviceId)),
    ]);

    this._client = createAuthClient({
      baseURL: this.config.baseURL,
      getAuthHeader: () => this.getAuthHeader(),
      deviceContext: {
        fingerprint,
        deviceId,
        language: navigator.language,
        platform: navigator.platform,
        screenResolution: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      // Refresh automático
      getRefreshToken: () => this._refreshToken,
      onTokensRefreshed: (tokens) => {
        this._accessToken = tokens.accessToken;
        this._refreshToken = tokens.refreshToken;
        localStorage.setItem(this.keys.accessToken, tokens.accessToken);
        localStorage.setItem(this.keys.refreshToken, tokens.refreshToken);
      },
      onAuthFailure: () => {
        this._clear();
        if (this.config.onAuthFailure) {
          this.config.onAuthFailure();
        } else {
          this.config.onLogout?.();
        }
      },
    });

    return this._client;
  }
}
