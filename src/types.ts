// ─────────────────────────────────────────────
// Tipos del Auth Manager
// ─────────────────────────────────────────────

import type { User, TokenPair } from "@boolean-systems-packages/api-auth";

export type { User, TokenPair };

export interface AuthState {
  loggedIn: boolean;
  user: User | null;
  accessToken: string | null;
}

export interface AuthConfig {
  /**
   * URL base del microservicio de auth.
   * @example "https://portal.boolean.com.ar/api/auth/v3"
   */
  baseURL: string;

  /**
   * Esquema del header `Authorization` hacia authapi.
   * Django REST + JWT de Boolean suele usar `Token`; otras APIs usan `Bearer`.
   * @default "Bearer"
   */
  authScheme?: "Bearer" | "Token";

  /**
   * Claves de localStorage. Opcionales — tiene defaults razonables.
   */
  storage?: {
    accessToken?: string;
    refreshToken?: string;
    user?: string;
    deviceId?: string;
  } | undefined;

  /**
   * Llamado cuando el usuario inicia sesión exitosamente.
   */
  onLogin?: ((user: User) => void) | undefined;

  /**
   * Llamado cuando el usuario cierra sesión (manual o por token vencido).
   */
  onLogout?: (() => void) | undefined;

  /**
   * Llamado cuando el refresh falla y no hay forma de recuperar la sesión.
   * Por defecto: llama a logout().
   */
  onAuthFailure?: (() => void) | undefined;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ResumePayload {
  accessToken: string;
  refreshToken?: string | undefined;
}
