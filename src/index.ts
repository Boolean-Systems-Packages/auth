import { AuthManager } from "./auth-manager";
import { BooleanHttpClient } from "@boolean/http";
import type { AuthConfig } from "./types";

export function createAuth(config: AuthConfig): AuthManager {
  return new AuthManager(config);
}

export { AuthManager };
// Re-exportado para que los consumers no necesiten instalar @boolean/http por separado
export { BooleanHttpClient };
export type { AuthConfig, AuthState, LoginPayload, ResumePayload, User, TokenPair } from "./types";
