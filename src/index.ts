import { AuthManager } from "./auth-manager";
import type { AuthConfig } from "./types";

/**
 * @boolean/auth
 *
 * Auth manager completo para frontends Boolean.
 * Maneja tokens, refresh automático, estado de sesión y device context.
 *
 * @example
 * import { createAuth } from "@boolean/auth";
 *
 * const auth = createAuth({
 *   baseURL: "https://portal.boolean.com.ar/api/auth/v3",
 *   onLogin: (user) => router.push("/dashboard"),
 *   onLogout: () => router.push("/login"),
 * });
 *
 * // Login con credenciales
 * const { data, errors } = await auth.login({ email, password });
 *
 * // Resumir sesión existente (tokens propios)
 * await auth.resume({ accessToken: "eyJ...", refreshToken: "..." });
 *
 * // Estado (sincrónico)
 * auth.isLoggedIn   // → true / false
 * auth.user         // → User | null
 *
 * // Para otros SDKs
 * const inventory = createInventoryClient({
 *   getAuthHeader: () => auth.getAuthHeader(),
 * });
 */
export function createAuth(config: AuthConfig): AuthManager {
  return new AuthManager(config);
}

export { AuthManager };
export type { AuthConfig, AuthState, LoginPayload, ResumePayload, User, TokenPair } from "./types";
