import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/app/providers/useAuth";
import type { SupportedLocale } from "@/entities/excursion/model/types";
import { appRoutes } from "@/shared/config/routes";
import { formatLocaleLabel } from "@/shared/lib/format";
import "./SignInPage.css";

type AuthMode = "sign-in" | "register" | "reset";
type ValidatedField = "email" | "name" | "password" | "phone" | "username";
type TouchedFields = Partial<Record<ValidatedField, boolean>>;

interface RedirectState {
    from?: unknown;
}

const localeOptions: SupportedLocale[] = ["ru", "en", "de", "fr", "es"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+7 \d{3}-\d{3}-\d{2}-\d{2}$/;
const authCopy = {
    account: "\u0410\u043a\u043a\u0430\u0443\u043d\u0442 T Guide",
    alreadyHasProfile:
        "\u041f\u0440\u043e\u0444\u0438\u043b\u044c \u0443\u0436\u0435 \u0441\u043e\u0437\u0434\u0430\u043d?",
    checking:
        "\u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c \u0434\u0430\u043d\u043d\u044b\u0435",
    createAccount:
        "\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0430\u043a\u043a\u0430\u0443\u043d\u0442",
    createProfile:
        "\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043f\u0440\u043e\u0444\u0438\u043b\u044c",
    email: "\u041f\u043e\u0447\u0442\u0430",
    forgotPassword:
        "\u0417\u0430\u0431\u044b\u043b\u0438 \u043f\u0430\u0440\u043e\u043b\u044c?",
    home: "\u041d\u0430 \u0433\u043b\u0430\u0432\u043d\u0443\u044e",
    invalidForm:
        "\u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u043f\u043e\u0434\u0441\u0432\u0435\u0447\u0435\u043d\u043d\u044b\u0435 \u043f\u043e\u043b\u044f \u0438 \u043f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0435 \u0440\u0430\u0437.",
    language:
        "\u042f\u0437\u044b\u043a \u0430\u0443\u0434\u0438\u043e\u0433\u0438\u0434\u0430",
    name: "\u0418\u043c\u044f",
    namePlaceholder: "\u0410\u043d\u043d\u0430 (\u043c\u0438\u043d. 3 \u0441\u0438\u043c\u0432\u043e\u043b\u0430)",
    noProfile:
        "\u0415\u0449\u0435 \u043d\u0435\u0442 \u043f\u0440\u043e\u0444\u0438\u043b\u044f?",
    password: "\u041f\u0430\u0440\u043e\u043b\u044c",
    passwordPlaceholder:
        "\u041c\u0438\u043d\u0438\u043c\u0443\u043c 8 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432",
    phone: "\u0422\u0435\u043b\u0435\u0444\u043e\u043d",
    register:
        "\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f",
    resetSuccess:
        "\u0418\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0438 \u0434\u043b\u044f \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u044b. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u043f\u043e\u0447\u0442\u0443.",
    resetTitle:
        "\u0412\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435 \u0434\u043e\u0441\u0442\u0443\u043f\u0430",
    returnToSignIn:
        "\u0412\u0435\u0440\u043d\u0443\u0442\u044c\u0441\u044f \u043a\u043e \u0432\u0445\u043e\u0434\u0443",
    sendInstructions:
        "\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0438\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0438",
    signIn: "\u0412\u043e\u0439\u0442\u0438",
    signInTab: "\u0412\u0445\u043e\u0434",
    signInTitle:
        "\u0412\u0445\u043e\u0434 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442",
    unknownError:
        "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u044b\u043f\u043e\u043b\u043d\u0438\u0442\u044c \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435.",
    username: "\u0418\u043c\u044f",
    usernamePlaceholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0432\u0430\u0448\u0435 \u0438\u043c\u044f",
};

export function SignInPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { register, requestPasswordReset, signIn } = useAuth();
    const [mode, setMode] = useState<AuthMode>("sign-in");
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [loginUsername, setLoginUsername] = useState("");
    const [password, setPassword] = useState("");
    const [language, setLanguage] = useState<SupportedLocale>("ru");
    const [touchedFields, setTouchedFields] = useState<TouchedFields>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isLocaleMenuOpen, setIsLocaleMenuOpen] = useState(false);
    const localeSelectRef = useRef<HTMLDivElement | null>(null);

    const redirectPath = getRedirectPath(location.state);
    const isEmailValid = isValidEmail(email);
    const isNameValid = name.trim().length >= 3;
    const isPasswordValid = isValidPassword(password);
    const isPhoneValid = isValidPhone(phone);
    const isLoginEmailValid = isValidEmail(loginUsername);
    const title =
        mode === "sign-in"
            ? authCopy.signInTitle
            : mode === "register"
              ? authCopy.register
              : authCopy.resetTitle;
    const submitLabel =
        mode === "sign-in"
            ? authCopy.signIn
            : mode === "register"
              ? authCopy.createProfile
              : authCopy.sendInstructions;
    const modeActionLabel =
        mode === "sign-in"
            ? authCopy.createAccount
            : authCopy.alreadyHasProfile;

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

    function switchMode(nextMode: AuthMode) {
        setMode(nextMode);
        setTouchedFields({});
        setError(null);
        setSuccessMessage(null);
        setLoginUsername("");
        setEmail("");
        setPassword("");
    }

    function markFieldTouched(field: ValidatedField) {
        setTouchedFields((current) => ({
            ...current,
            [field]: true,
        }));
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setSuccessMessage(null);

        const isFormValid =
            (mode === "sign-in" ? isLoginEmailValid : isEmailValid) &&
            (mode === "reset" || isPasswordValid) &&
            (mode !== "register" || isPhoneValid) &&
            (mode !== "register" || isNameValid);

        if (!isFormValid) {
            setTouchedFields({
                email: true,
                password: mode !== "reset",
                phone: mode === "register",
                name: mode === "register",
            });
            setError(authCopy.invalidForm);
            return;
        }

        setIsSubmitting(true);

        try {
            if (mode === "sign-in") {
                await signIn({
                    login: loginUsername.trim(),
                    password,
                });
                navigate(redirectPath, { replace: true });
                return;
            }

            if (mode === "register") {
                await register({
                    email: email.trim(),
                    language,
                    name: name.trim(),
                    password,
                    phone,
                });
                navigate(redirectPath, { replace: true });
                return;
            }

            await requestPasswordReset({
                login: email.trim(),
            });
            setSuccessMessage(authCopy.resetSuccess);
            setMode("sign-in");
        } catch (nextError) {
            setError(
                nextError instanceof Error
                    ? nextError.message
                    : authCopy.unknownError,
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <section className="auth-page">
            <div className="auth-page__panel">
                <p className="eyebrow">{authCopy.account}</p>
                <h1 className="auth-page__title">{title}</h1>

                <div className="auth-page__mode-switch" role="tablist">
                    <button
                        className={`auth-page__mode-button${mode === "sign-in" ? " auth-page__mode-button--active" : ""}`}
                        onClick={() => switchMode("sign-in")}
                        type="button">
                        {authCopy.signInTab}
                    </button>
                    <button
                        className={`auth-page__mode-button${mode === "register" ? " auth-page__mode-button--active" : ""}`}
                        onClick={() => switchMode("register")}
                        type="button">
                        {authCopy.register}
                    </button>
                </div>

                <form className="auth-form" onSubmit={handleSubmit} noValidate>
                    {mode === "register" ? (
                        <>
                            <label
                                className={getFieldClassName({
                                    isTouched: Boolean(touchedFields.name),
                                    isValid: isNameValid,
                                    value: name,
                                })}>
                                <span className="field__label">
                                    {authCopy.name}
                                </span>
                                <input
                                    className="field__input"
                                    onBlur={() => markFieldTouched("name")}
                                    onChange={(event) =>
                                        setName(event.target.value)
                                    }
                                    placeholder={authCopy.namePlaceholder}
                                    required
                                    type="text"
                                    value={name}
                                />
                            </label>
                            <label
                                className={getFieldClassName({
                                    isTouched: Boolean(touchedFields.phone),
                                    isValid: isPhoneValid,
                                    value: phone,
                                })}>
                                <span className="field__label">
                                    {authCopy.phone}
                                </span>
                                <input
                                    className="field__input"
                                    inputMode="numeric"
                                    onBlur={() => markFieldTouched("phone")}
                                    onChange={(event) =>
                                        setPhone(
                                            formatRussianPhone(
                                                event.target.value,
                                            ),
                                        )
                                    }
                                    placeholder="+7 927-687-12-14"
                                    required
                                    type="tel"
                                    value={phone}
                                />
                            </label>
                        </>
                    ) : null}

                    {mode === "sign-in" ? (
                        <label
                            className={getFieldClassName({
                                isTouched: Boolean(touchedFields.email),
                                isValid: isLoginEmailValid,
                                value: loginUsername,
                            })}>
                            <span className="field__label">
                                {authCopy.email}
                            </span>
                            <input
                                autoComplete="email"
                                className="field__input"
                                inputMode="email"
                                onBlur={() => markFieldTouched("email")}
                                onChange={(event) =>
                                    setLoginUsername(event.target.value)
                                }
                                placeholder="test@example.com"
                                required
                                type="email"
                                value={loginUsername}
                            />
                        </label>
                    ) : mode === "reset" ? (
                        <p className="auth-page__reset-help">
                            Здравствуйте, если вы забыли или потеряли свои данные то напишите нам на почту{" "}
                            <a href="mailto:taudioguide@gmail.com">TAudioGuide@gmail.com</a>{" "}
                            и мы поможем вернуть вам ваши данные.
                        </p>
                    ) : (
                        <label
                            className={getFieldClassName({
                                isTouched: Boolean(touchedFields.email),
                                isValid: isEmailValid,
                                value: email,
                            })}>
                            <span className="field__label">
                                {authCopy.email}
                            </span>
                            <input
                                autoComplete="email"
                                className="field__input"
                                inputMode="email"
                                onBlur={() => markFieldTouched("email")}
                                onChange={(event) =>
                                    setEmail(event.target.value)
                                }
                                placeholder="test@example.com"
                                required
                                type="email"
                                value={email}
                            />
                        </label>
                    )}

                    {mode !== "reset" ? (
                        <>
                            <label
                                className={getFieldClassName({
                                    isTouched: Boolean(touchedFields.password),
                                    isValid: isPasswordValid,
                                    value: password,
                                })}>
                                <span className="field__label">
                                    {authCopy.password}
                                </span>
                                <input
                                    className="field__input"
                                    minLength={8}
                                    onBlur={() => markFieldTouched("password")}
                                    onChange={(event) =>
                                        setPassword(event.target.value)
                                    }
                                    placeholder={authCopy.passwordPlaceholder}
                                    required
                                    type="password"
                                    value={password}
                                />
                            </label>

                            {mode === "sign-in" ? (
                                <div className="auth-form__aux">
                                    <button
                                        className="auth-page__inline-action"
                                        onClick={() => switchMode("reset")}
                                        type="button">
                                        {authCopy.forgotPassword}
                                    </button>
                                </div>
                            ) : null}
                        </>
                    ) : null}

                    {mode === "register" ? (
                        <div
                            className="field auth-select"
                            ref={localeSelectRef}>
                            <span className="field__label">
                                {authCopy.language}
                            </span>
                            <button
                                aria-expanded={isLocaleMenuOpen}
                                className="auth-select__trigger"
                                onClick={() =>
                                    setIsLocaleMenuOpen((current) => !current)
                                }
                                type="button">
                                <span>{formatLocaleLabel(language)}</span>
                                <span
                                    aria-hidden="true"
                                    className="auth-select__chevron"
                                />
                            </button>

                            <div
                                className={`auth-select__menu${isLocaleMenuOpen ? " auth-select__menu--open" : ""}`}
                                role="listbox">
                                {localeOptions.map((locale) => (
                                    <button
                                        aria-selected={locale === language}
                                        className={`auth-select__option${locale === language ? " auth-select__option--active" : ""}`}
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
                    ) : null}

                    {error ? <p className="auth-page__error">{error}</p> : null}
                    {successMessage ? (
                        <p className="auth-page__success">{successMessage}</p>
                    ) : null}

                    {mode !== "reset" ? (
                        <button
                            className="button button--primary button--wide"
                            disabled={isSubmitting}
                            type="submit">
                            {isSubmitting ? authCopy.checking : submitLabel}
                        </button>
                    ) : null}
                </form>

                {mode === "reset" ? (
                    <div className="auth-page__footer auth-page__footer--center">
                        <button
                            className="button button--secondary"
                            onClick={() => switchMode("sign-in")}
                            type="button">
                            {authCopy.returnToSignIn}
                        </button>
                    </div>
                ) : (
                    <div className="auth-page__footer">
                        <span>
                            {mode === "sign-in"
                                ? authCopy.noProfile
                                : authCopy.alreadyHasProfile}
                        </span>
                        <button
                            className="button button--secondary"
                            onClick={() =>
                                switchMode(
                                    mode === "sign-in" ? "register" : "sign-in",
                                )
                            }
                            type="button">
                            {modeActionLabel}
                        </button>
                    </div>
                )}

                <Link className="inline-link" to={appRoutes.home}>
                    {authCopy.home}
                </Link>
            </div>
        </section>
    );
}

function getFieldClassName({
    isTouched,
    isValid,
    value,
}: {
    isTouched: boolean;
    isValid: boolean;
    value: string;
}) {
    if (!value) {
        return isTouched ? "field field--invalid" : "field";
    }

    if (isValid) {
        return "field field--valid";
    }

    return isTouched ? "field field--invalid" : "field";
}

function getRedirectPath(state: unknown) {
    const from = (state as RedirectState | null)?.from;

    return typeof from === "string" && from !== appRoutes.signIn
        ? from
        : appRoutes.profile;
}

function isValidEmail(value: string) {
    return emailPattern.test(value.trim());
}

function isValidPassword(value: string) {
    return value.length >= 8;
}

function isValidPhone(value: string) {
    return phonePattern.test(value);
}

function formatRussianPhone(value: string) {
    const digits = value.replace(/\D/g, "");
    const localDigits = digits.replace(/^[78]/, "").slice(0, 10);

    if (!digits) {
        return "";
    }

    if (!localDigits) {
        return "+7 ";
    }

    const city = localDigits.slice(0, 3);
    const first = localDigits.slice(3, 6);
    const second = localDigits.slice(6, 8);
    const third = localDigits.slice(8, 10);

    let formatted = `+7 ${city}`;

    if (first) {
        formatted += `-${first}`;
    }

    if (second) {
        formatted += `-${second}`;
    }

    if (third) {
        formatted += `-${third}`;
    }

    return formatted;
}
