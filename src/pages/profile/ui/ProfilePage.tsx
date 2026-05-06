import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "@/app/providers/useAuth";
import {
    useLastRoutes,
    type LastRouteItem,
} from "@/entities/excursion/lib/last-routes";
import type {
    Excursion,
    SupportedLocale,
} from "@/entities/excursion/model/types";
import { useUserRoutes } from "@/features/user-routes/model/useUserRoutes";
import { useProfileOverview } from "@/shared/api/useProfileOverview";
import { appRoutes } from "@/shared/config/routes";
import {
    formatDistance,
    formatDuration,
    formatLocaleLabel,
    formatStopCount,
    formatTheme,
} from "@/shared/lib/format";
import "./ProfilePage.css";

const localeOptions: SupportedLocale[] = ["ru", "en", "de", "fr", "es"];
const defaultVisiblePersonalRoutesCount = 6;
const mobileVisiblePersonalRoutesCount = 3;

type ProfileToast = {
    message: string;
    tone: "success" | "error";
};

export function ProfilePage() {
    const navigate = useNavigate();
    const { changePassword, session, signOut, updateProfile } = useAuth();
    const {
        loadRouteForEditing,
        personalRoutes,
        removePersonalRoute,
        removeSavedRoute,
        savedRoutes,
        shareRoute,
    } = useUserRoutes();
    const isAuthenticated = Boolean(
        session?.isAuthenticated && session.profile,
    );
    const { error, isLoading, overview } = useProfileOverview(isAuthenticated);

    useEffect(() => {
        if (!error) return;
        const isAuthError =
            error.includes('401') ||
            error.toLowerCase().includes('authentication') ||
            error.toLowerCase().includes('unauthorized') ||
            error.toLowerCase().includes('access denied');
        if (isAuthError) {
            signOut().finally(() => {
                navigate(appRoutes.signIn, { replace: true });
            });
        }
    }, [error, navigate, signOut]);
    const profile = session?.profile ?? overview?.profile ?? null;
    const [name, setName] = useState(profile?.name ?? "");
    const [email, setEmail] = useState(profile?.email ?? "");
    const [language, setLanguage] = useState<SupportedLocale>(
        profile?.language ?? "ru",
    );
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [isOldPasswordVisible, setIsOldPasswordVisible] = useState(false);
    const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isPasswordSaving, setIsPasswordSaving] = useState(false);
    const [toast, setToast] = useState<ProfileToast | null>(null);
    const [toastKey, setToastKey] = useState(0);
    const [isMobileProfile, setIsMobileProfile] = useState(getIsMobileProfile);
    const [isLocaleMenuOpen, setIsLocaleMenuOpen] = useState(false);
    const [arePersonalRoutesExpanded, setArePersonalRoutesExpanded] =
        useState(false);
    const localeSelectRef = useRef<HTMLDivElement | null>(null);
    const historyItems = useLastRoutes();
    const visiblePersonalRoutesCount = isMobileProfile
        ? mobileVisiblePersonalRoutesCount
        : defaultVisiblePersonalRoutesCount;
    const visiblePersonalRoutes = personalRoutes.slice(
        0,
        visiblePersonalRoutesCount,
    );
    const extraPersonalRoutes = personalRoutes.slice(
        visiblePersonalRoutesCount,
    );
    const canTogglePersonalRoutes = extraPersonalRoutes.length > 0;

    useEffect(() => {
        if (!profile) {
            return;
        }

        setName(profile.name);
        setEmail(profile.email);
        setLanguage(profile.language);
    }, [profile]);

    useEffect(() => {
        function handlePointerDown(event: PointerEvent) {
            if (!localeSelectRef.current?.contains(event.target as Node)) {
                setIsLocaleMenuOpen(false);
            }
        }

        window.addEventListener("pointerdown", handlePointerDown);

        return () => {
            window.removeEventListener("pointerdown", handlePointerDown);
        };
    }, []);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 760px)");
        const handleChange = () => setIsMobileProfile(mediaQuery.matches);

        mediaQuery.addEventListener("change", handleChange);

        return () => {
            mediaQuery.removeEventListener("change", handleChange);
        };
    }, []);

    useEffect(() => {
        if (!toast) {
            return;
        }

        const timeoutId = window.setTimeout(() => setToast(null), 3000);

        return () => window.clearTimeout(timeoutId);
    }, [toast, toastKey]);

    function showToast(nextToast: ProfileToast) {
        setToast(nextToast);
        setToastKey((current) => current + 1);
    }

    async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSaving(true);

        try {
            await updateProfile({
                email,
                language,
                name,
            });
            showToast({
                message: "Профиль сохранен",
                tone: "success",
            });
        } catch (nextError) {
            showToast({
                message:
                    nextError instanceof Error
                        ? nextError.message
                        : "Не удалось сохранить профиль",
                tone: "error",
            });
        } finally {
            setIsSaving(false);
        }
    }

    async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (newPassword.length < 8) {
            showToast({
                message: "Новый пароль должен быть не короче 8 символов.",
                tone: "error",
            });
            return;
        }

        setIsPasswordSaving(true);

        try {
            await changePassword({
                newPassword,
                oldPassword,
            });
            setOldPassword("");
            setNewPassword("");
            showToast({
                message: "Пароль обновлен",
                tone: "success",
            });
        } catch (nextError) {
            showToast({
                message:
                    nextError instanceof Error
                        ? nextError.message
                        : "Не удалось изменить пароль",
                tone: "error",
            });
        } finally {
            setIsPasswordSaving(false);
        }
    }

    if (!isAuthenticated) {
        return (
            <section className="profile-page page-shell">
                <article className="profile-page__hero section-surface">
                    <div>
                        <p className="eyebrow">Личный кабинет</p>
                        <h1 className="profile-page__title">
                            Войдите в профиль
                        </h1>
                        <p className="profile-page__text">
                            Аккаунт нужен для личных маршрутов, истории прогулок
                            и настроек языка.
                        </p>
                    </div>
                    <Link
                        className="button button--primary"
                        to={appRoutes.signIn}>
                        Войти или зарегистрироваться
                    </Link>
                </article>
            </section>
        );
    }

    if (isLoading) {
        return <ProfileSkeleton />;
    }

    if (error) {
        return (
            <section className="status-card">
                <h1 className="status-card__title">
                    Не удалось открыть профиль
                </h1>
                <p className="status-card__text">{error}</p>
            </section>
        );
    }

    return (
        <section className="profile-page page-shell">
            {toast ? (
                <div className="profile-toast-layer" role="status">
                    <div
                        className={`profile-toast profile-toast--${toast.tone}`}
                        key={toastKey}>
                        {toast.message}
                    </div>
                </div>
            ) : null}

            <article className="profile-page__hero section-surface">
                <div>
                    <p className="eyebrow">Личный кабинет</p>
                    <h1 className="profile-page__title">
                        {profile?.name ?? "Профиль"}
                    </h1>
                    <p className="profile-page__text">
                        Управляйте языком аудиогида, личными маршрутами и
                        историей прохождения.
                    </p>
                </div>
                <button
                    className="button button--secondary"
                    onClick={() => void signOut()}
                    type="button">
                    Выйти
                </button>
            </article>

            <section className="profile-page__layout">
                <section className="profile-card profile-form">
                    <form
                        className="profile-form__section"
                        onSubmit={handleProfileSubmit}>
                        <div>
                            <p className="eyebrow">Настройки</p>
                            <h2 className="profile-card__title">
                                Данные профиля
                            </h2>
                        </div>

                        <label className="field">
                            <span className="field__label">Имя</span>
                            <input
                                className="field__input"
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                                value={name}
                            />
                        </label>

                        <label className="field">
                            <span className="field__label">Почта</span>
                            <input
                                className="field__input"
                                onChange={(event) =>
                                    setEmail(event.target.value)
                                }
                                type="email"
                                value={email}
                            />
                        </label>

                        <div
                            className="field profile-locale-field"
                            ref={localeSelectRef}>
                            <span className="field__label">Язык аудиогида</span>
                            <button
                                aria-expanded={isLocaleMenuOpen}
                                className="profile-select"
                                onClick={() =>
                                    setIsLocaleMenuOpen((isOpen) => !isOpen)
                                }
                                type="button">
                                <span>{formatLocaleLabel(language)}</span>
                                <span
                                    aria-hidden="true"
                                    className="profile-select__chevron"
                                />
                            </button>

                            <div
                                className={`profile-select__menu${isLocaleMenuOpen ? " profile-select__menu--open" : ""}`}
                                role="listbox">
                                {localeOptions.map((locale) => (
                                    <button
                                        aria-selected={locale === language}
                                        className={`profile-select__option${locale === language ? " profile-select__option--active" : ""}`}
                                        key={locale}
                                        onClick={() => {
                                            setLanguage(locale);
                                            setIsLocaleMenuOpen(false);
                                        }}
                                        role="option"
                                        type="button">
                                        {formatLocaleLabel(locale)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="profile-form__actions">
                            <button
                                className="button button--primary profile-form__submit"
                                disabled={isSaving}
                                type="submit">
                                {isSaving ? "Сохраняем" : "Сохранить изменения"}
                            </button>
                        </div>
                    </form>

                    <form
                        className="profile-form__section profile-password-form"
                        onSubmit={handlePasswordSubmit}>
                        <div>
                            <p className="eyebrow">Безопасность</p>
                            <h2 className="profile-card__title">Пароль</h2>
                        </div>

                        <label className="field">
                            <span className="field__label">Текущий пароль</span>
                            <span className="profile-password-field">
                                <input
                                    autoComplete="current-password"
                                    className="field__input profile-password-field__input"
                                    minLength={8}
                                    onChange={(event) =>
                                        setOldPassword(event.target.value)
                                    }
                                    type={
                                        isOldPasswordVisible
                                            ? "text"
                                            : "password"
                                    }
                                    value={oldPassword}
                                />
                                <PasswordVisibilityButton
                                    isVisible={isOldPasswordVisible}
                                    label={
                                        isOldPasswordVisible
                                            ? "Скрыть текущий пароль"
                                            : "Показать текущий пароль"
                                    }
                                    onClick={() =>
                                        setIsOldPasswordVisible(
                                            (current) => !current,
                                        )
                                    }
                                />
                            </span>
                        </label>

                        <label className="field">
                            <span className="field__label">Новый пароль</span>
                            <span className="profile-password-field">
                                <input
                                    autoComplete="new-password"
                                    className="field__input profile-password-field__input"
                                    minLength={8}
                                    onChange={(event) =>
                                        setNewPassword(event.target.value)
                                    }
                                    type={
                                        isNewPasswordVisible
                                            ? "text"
                                            : "password"
                                    }
                                    value={newPassword}
                                />
                                <PasswordVisibilityButton
                                    isVisible={isNewPasswordVisible}
                                    label={
                                        isNewPasswordVisible
                                            ? "Скрыть новый пароль"
                                            : "Показать новый пароль"
                                    }
                                    onClick={() =>
                                        setIsNewPasswordVisible(
                                            (current) => !current,
                                        )
                                    }
                                />
                            </span>
                        </label>

                        <div className="profile-form__actions">
                            <button
                                className="button button--primary profile-form__submit"
                                disabled={isPasswordSaving}
                                type="submit">
                                {isPasswordSaving
                                    ? "Обновляем"
                                    : "Изменить пароль"}
                            </button>
                        </div>
                    </form>
                </section>

                <section
                    className={`profile-card profile-card--large profile-card--saved${savedRoutes.length ? "" : " profile-card--empty-art"}`}>
                    <div className="profile-card__header">
                        <div>
                            <p className="eyebrow">Все маршруты</p>
                            <h2 className="profile-card__title">
                                Сохраненные прогулки
                            </h2>
                        </div>
                        <span className="chip chip--accent">
                            {savedRoutes.length}
                        </span>
                    </div>

                    <div
                        className={`profile-routes profile-routes--saved${savedRoutes.length ? " profile-routes--scrollable" : ""}`}>
                        {savedRoutes.length ? (
                            savedRoutes.map((route) => (
                                <ProfileRouteCard
                                    key={route.slug}
                                    onRemove={() =>
                                        removeSavedRoute(route.slug)
                                    }
                                    onShare={() => void shareRoute(route)}
                                    route={route}
                                />
                            ))
                        ) : (
                            <p className="profile-card__text">
                                Сохраняйте маршруты из каталога, чтобы быстро
                                возвращаться к ним.
                            </p>
                        )}
                    </div>
                </section>
            </section>

            <section
                className={`profile-card profile-card--large profile-card--personal${personalRoutes.length ? "" : " profile-card--empty-art profile-card--wide-art"}`}>
                <div className="profile-card__header">
                    <div>
                        <p className="eyebrow">Свои прогулки</p>
                        <h2 className="profile-card__title">
                            Пользовательские маршруты
                        </h2>
                    </div>
                    <span className="chip chip--accent">
                        {personalRoutes.length}
                    </span>
                </div>

                <div
                    className={`profile-routes profile-routes--grid${personalRoutes.length ? "" : " profile-routes--empty"}`}>
                    {personalRoutes.length ? (
                        visiblePersonalRoutes.map((route) => (
                            <ProfileRouteCard
                                key={route.slug}
                                onEdit={() => {
                                    loadRouteForEditing(route)
                                    navigate(appRoutes.excursions)
                                }}
                                onRemove={() => removePersonalRoute(route.slug)}
                                onShare={() => void shareRoute(route)}
                                route={route}
                            />
                        ))
                    ) : (
                        <p className="profile-card__text">
                            Соберите маршрут из точек рядом на главной странице.
                        </p>
                    )}
                </div>

                {canTogglePersonalRoutes ? (
                    <div
                        className={`profile-collapsible${arePersonalRoutesExpanded ? " profile-collapsible--open" : ""}`}>
                        <div className="profile-collapsible__inner">
                            <div className="profile-collapsible__content">
                                <div className="profile-routes profile-routes--grid">
                                    {extraPersonalRoutes.map((route) => (
                                        <ProfileRouteCard
                                            className="profile-collapsible__item"
                                            key={route.slug}
                                            onEdit={() => {
                                                loadRouteForEditing(route)
                                                navigate(appRoutes.excursions)
                                            }}
                                            onRemove={() =>
                                                removePersonalRoute(route.slug)
                                            }
                                            onShare={() =>
                                                void shareRoute(route)
                                            }
                                            route={route}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}

                {canTogglePersonalRoutes ? (
                    <div className="profile-card__footer">
                        <button
                            className="button button--secondary profile-card__toggle"
                            onClick={() =>
                                setArePersonalRoutesExpanded(
                                    (current) => !current,
                                )
                            }
                            type="button">
                            {arePersonalRoutesExpanded
                                ? "Скрыть"
                                : "Показать все"}
                        </button>
                    </div>
                ) : null}
            </section>

            <section className="profile-card profile-card--large">
                <div className="profile-card__header">
                    <div>
                        <p className="eyebrow">История</p>
                        <h2 className="profile-card__title">
                            Последние маршруты
                        </h2>
                    </div>
                </div>

                <div className="profile-history">
                    {historyItems.length ? (
                        historyItems.map((item) => (
                            <HistoryRouteCard item={item} key={item.id} />
                        ))
                    ) : (
                        <p className="profile-card__text">
                            Начните маршрут, чтобы здесь появился прогресс
                            последних прогулок.
                        </p>
                    )}
                </div>
            </section>
        </section>
    );
}

interface ProfileRouteCardProps {
    className?: string;
    route: Excursion;
    onEdit?: () => void;
    onRemove: () => void;
    onShare: () => void;
}

function ProfileRouteCard({
    className,
    route,
    onEdit,
    onRemove,
    onShare,
}: ProfileRouteCardProps) {
    return (
        <article
            className={["profile-route", className].filter(Boolean).join(" ")}>
            <Link
                className="profile-route__main"
                to={appRoutes.excursion(route.slug)}>
                <span className="profile-route__theme">
                    {formatTheme(route.theme)}
                </span>
                <h3 className="profile-route__title">{route.title}</h3>
                <p className="profile-route__text">{route.tagline}</p>
                <div className="profile-route__meta">
                    <span>{formatDuration(route.durationMinutes)}</span>
                    <span>{formatDistance(route.distanceKm)}</span>
                    <span>{formatStopCount(route.stops.length)}</span>
                </div>
            </Link>

            <div className="profile-route__actions">
                {onEdit ? (
                    <button
                        className="button button--secondary"
                        onClick={onEdit}
                        type="button">
                        Изменить
                    </button>
                ) : null}
                <button
                    className="button button--secondary"
                    onClick={onShare}
                    type="button">
                    Поделиться
                </button>
                <button
                    className="button button--ghost"
                    onClick={onRemove}
                    type="button">
                    Убрать
                </button>
            </div>
        </article>
    );
}

interface HistoryRouteCardProps {
    className?: string;
    item: LastRouteItem;
}

function HistoryRouteCard({ className, item }: HistoryRouteCardProps) {
    const progressPercent = item.totalPoints
        ? Math.round((item.completedPoints / item.totalPoints) * 100)
        : 0;

    return (
        <article
            className={["profile-history__item", className]
                .filter(Boolean)
                .join(" ")}>
            <div className="profile-history__route">
                <span className="profile-route__theme">
                    {item.totalPoints} точек
                </span>
                <h3 className="profile-history__title">{item.title}</h3>
            </div>
            <div
                className="profile-history__progress"
                aria-label={`Прогресс ${progressPercent}%`}>
                <span style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="chip">
                {item.isCompleted ? "Завершен" : "В процессе"}
            </span>
            <Link
                className="button button--secondary"
                to={appRoutes.excursion(item.id)}>
                {item.isCompleted ? "Повторить" : "Продолжить"}
            </Link>
        </article>
    );
}

interface PasswordVisibilityButtonProps {
    isVisible: boolean;
    label: string;
    onClick: () => void;
}

function PasswordVisibilityButton({
    isVisible,
    label,
    onClick,
}: PasswordVisibilityButtonProps) {
    return (
        <button
            aria-label={label}
            className="profile-password-field__toggle"
            onClick={onClick}
            type="button">
            {isVisible ? (
                <svg
                    aria-hidden="true"
                    fill="none"
                    height="20"
                    viewBox="0 0 24 24"
                    width="20">
                    <path
                        d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                    />
                    <circle
                        cx="12"
                        cy="12"
                        r="3"
                        stroke="currentColor"
                        strokeWidth="1.8"
                    />
                </svg>
            ) : (
                <svg
                    aria-hidden="true"
                    fill="none"
                    height="20"
                    viewBox="0 0 24 24"
                    width="20">
                    <path
                        d="M3 3l18 18"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="1.8"
                    />
                    <path
                        d="M10.7 5.2c.4-.1.8-.1 1.3-.1 6.1 0 9.5 6 9.5 6a17 17 0 0 1-2.8 3.4M6.5 6.7C3.9 8.3 2.5 12 2.5 12s3.4 6 9.5 6c1.7 0 3.1-.4 4.3-1"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                    />
                    <path
                        d="M9.9 9.9a3 3 0 0 0 4.2 4.2"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="1.8"
                    />
                </svg>
            )}
        </button>
    );
}

function getIsMobileProfile() {
    if (typeof window === "undefined") {
        return false;
    }

    return window.matchMedia("(max-width: 760px)").matches;
}

function ProfileSkeleton() {
    return (
        <section
            className="profile-page page-shell"
            aria-label="Загрузка профиля">
            <article className="profile-page__hero section-surface">
                <div className="profile-page__skeleton-copy">
                    <span className="profile-page__skeleton profile-page__skeleton--eyebrow" />
                    <span className="profile-page__skeleton profile-page__skeleton--title" />
                    <span className="profile-page__skeleton profile-page__skeleton--text" />
                </div>
                <span className="profile-page__skeleton profile-page__skeleton--button" />
            </article>

            <section className="profile-page__layout">
                <section className="profile-card profile-form">
                    <span className="profile-page__skeleton profile-page__skeleton--eyebrow" />
                    <span className="profile-page__skeleton profile-page__skeleton--section-title" />
                    <span className="profile-page__skeleton profile-page__skeleton--field" />
                    <span className="profile-page__skeleton profile-page__skeleton--field" />
                    <span className="profile-page__skeleton profile-page__skeleton--field" />
                    <span className="profile-page__skeleton profile-page__skeleton--button profile-page__skeleton--button-wide" />
                </section>

                <section className="profile-card profile-card--large">
                    <span className="profile-page__skeleton profile-page__skeleton--eyebrow" />
                    <span className="profile-page__skeleton profile-page__skeleton--section-title" />
                    <span className="profile-page__skeleton profile-page__skeleton--text" />
                    <span className="profile-page__skeleton profile-page__skeleton--route" />
                    <span className="profile-page__skeleton profile-page__skeleton--route" />
                </section>
            </section>

            <section className="profile-card profile-card--large">
                <span className="profile-page__skeleton profile-page__skeleton--eyebrow" />
                <span className="profile-page__skeleton profile-page__skeleton--section-title" />
                <span className="profile-page__skeleton profile-page__skeleton--route" />
                <span className="profile-page__skeleton profile-page__skeleton--route" />
            </section>
        </section>
    );
}
