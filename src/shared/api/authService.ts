import {
    clearAuthTokens,
    readAuthTokens,
    request,
    writeAuthTokens,
} from "@/shared/api/http";
import type {
    AuthResponseDto,
    AuthTokensDto,
    BackendUserDto,
    ChangePasswordRequestDto,
    RegisterRequestDto,
    SessionDto,
    SignInRequestDto,
    UserProfileDto,
    UserRole,
} from "@/shared/api/contracts";
import type { SupportedLocale } from "@/entities/excursion/model/types";

export const authService = {
    /**
     * POST /profile/change-password → TokenPairResponse
     *
     * Backend returns a fresh pair of tokens on success. Persist them right
     * away so subsequent authenticated requests use the new credentials.
     */
    async changePassword(payload: ChangePasswordRequestDto) {
        const tokens = await request<AuthTokensDto>("/profile/change-password", {
            body: JSON.stringify(payload),
            method: "POST",
        });
        if (tokens?.accessToken && tokens?.refreshToken) {
            writeAuthTokens({
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
            });
        }
    },

    /** POST /auth/login — AuthRequest is { email, password } per swagger. */
    async login(payload: SignInRequestDto) {
        const response = await request<AuthResponseDto>("/auth/login", {
            body: JSON.stringify({
                email: payload.login.trim(),
                password: payload.password,
            }),
            method: "POST",
        });

        return createAuthenticatedSession(response);
    },

    async logout() {
        const tokens = readAuthTokens();
        if (tokens?.refreshToken) {
            await request<void>("/auth/logout", {
                body: JSON.stringify({ refreshToken: tokens.refreshToken }),
                method: "POST",
            }).catch(() => undefined);
        }
        clearAuthTokens();
        return createGuestSession();
    },

    /**
     * POST /auth/registration
     *
     * Swagger RegistrationRequest: { email, name, password, lang }.
     * `phone` exists on the UI form but is dropped here — backend has no
     * such field.
     */
    async register(payload: RegisterRequestDto) {
        const response = await request<AuthResponseDto>("/auth/registration", {
            body: JSON.stringify({
                email: payload.email.trim(),
                name: payload.name.trim(),
                password: payload.password,
                lang: (payload.language ?? "ru").toUpperCase(),
            }),
            method: "POST",
        });

        return createAuthenticatedSession(response);
    },
};

function createAuthenticatedSession(response: AuthResponseDto): SessionDto {
    // Swagger AuthResponse / RegistrationResponse both wrap tokens under a
    // `tokens` key. Old flat shape is kept as a fallback.
    const tokens =
        response.tokens ??
        (response.accessToken && response.refreshToken
            ? {
                  accessToken: response.accessToken,
                  refreshToken: response.refreshToken,
              }
            : null);

    if (tokens) {
        writeAuthTokens(tokens);
    }

    return {
        isAuthenticated: true,
        profile: normalizeProfile(response.user ?? response.profile),
    };
}

function createGuestSession(): SessionDto {
    return {
        isAuthenticated: false,
        profile: null,
    };
}

function normalizeProfile(
    profile: BackendUserDto | UserProfileDto | undefined,
): UserProfileDto {
    if (!profile) {
        throw new Error("Профиль не найден в ответе сервера.");
    }

    // Backend sends lang as uppercase "RU"/"EN"; normalize to internal lowercase.
    // For UserProfileDto inputs `language` may already exist — prefer it.
    const rawLang =
        ("language" in profile && profile.language) ||
        ("lang" in profile && profile.lang) ||
        "ru";
    const language = (
        typeof rawLang === "string" ? rawLang.toLowerCase() : "ru"
    ) as SupportedLocale;

    const role = (
        typeof profile.role === "string" ? profile.role.toLowerCase() : "user"
    ) as UserRole;

    return {
        email: profile.email,
        id: String(profile.id),
        lang: language,
        language,
        name: profile.name,
        role,
    };
}
