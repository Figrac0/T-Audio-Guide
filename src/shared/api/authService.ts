import {
    clearAuthTokens,
    readAuthTokens,
    request,
    writeAuthTokens,
} from "@/shared/api/http";
import type {
    AuthResponseDto,
    ChangePasswordRequestDto,
    RegisterRequestDto,
    SessionDto,
    SignInRequestDto,
    UserProfileDto,
    UserRole,
} from "@/shared/api/contracts";
import type { SupportedLocale } from "@/entities/excursion/model/types";

export const authService = {
    async changePassword(payload: ChangePasswordRequestDto) {
        await request<void>("/profile/change-password", {
            body: JSON.stringify(payload),
            method: "POST",
        });
    },

    async login(payload: SignInRequestDto) {
        const response = await request<AuthResponseDto>("/auth/login", {
            body: JSON.stringify({
                username: payload.login.trim(),
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

    async register(payload: RegisterRequestDto) {
        const response = await request<AuthResponseDto>("/auth/registration", {
            body: JSON.stringify({
                username: payload.name.trim(),
                email: payload.email.trim(),
                name: payload.name.trim(),
                password: payload.password,
                lang: (payload.language ?? 'ru').toUpperCase(),
            }),
            method: "POST",
        });

        return createAuthenticatedSession(response);
    },
};

function createAuthenticatedSession(response: AuthResponseDto): SessionDto {
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
        profile: normalizeProfile(response.profile ?? response.user),
    };
}

function createGuestSession(): SessionDto {
    return {
        isAuthenticated: false,
        profile: null,
    };
}

function normalizeProfile(
    profile: AuthResponseDto["profile"] | AuthResponseDto["user"],
): UserProfileDto {
    if (!profile) {
        throw new Error("Профиль не найден в ответе сервера.");
    }

    // Backend sends lang as "RU" (uppercase) and role as "USER" (uppercase)
    const rawLang = "language" in profile ? profile.language : profile.lang;
    const language = (rawLang?.toLowerCase() ?? "ru") as SupportedLocale;

    return {
        email: profile.email,
        id: String(profile.id), // backend sends int64 (number)
        lang: language,
        language,
        name: profile.name,
        role: (profile.role?.toLowerCase() ?? "user") as UserRole,
        username: "username" in profile ? profile.username : undefined,
    };
}
