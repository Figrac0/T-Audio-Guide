import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Link, NavLink } from "react-router-dom";

import { AppRouter } from "@/app/providers/AppRouter";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { useAuth } from "@/app/providers/useAuth";
import { UserRoutesProvider } from "@/features/user-routes/model/UserRoutesProvider";
import { appRoutes } from "@/shared/config/routes";
import "./App.css";

const NAV_LABELS = {
    closeMenu: "\u0417\u0430\u043a\u0440\u044b\u0442\u044c \u043c\u0435\u043d\u044e",
    home: "\u0413\u043b\u0430\u0432\u043d\u0430\u044f",
    login: "\u0412\u043e\u0439\u0442\u0438",
    openMenu: "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043c\u0435\u043d\u044e",
    profile: "\u041f\u0440\u043e\u0444\u0438\u043b\u044c",
    routes: "\u041c\u0430\u0440\u0448\u0440\u0443\u0442\u044b",
};

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <UserRoutesBoundary />
            </AuthProvider>
        </BrowserRouter>
    );
}

function UserRoutesBoundary() {
    const { session } = useAuth();
    const storageScope = session?.profile?.id ?? "guest";

    return (
        <UserRoutesProvider key={storageScope}>
            <AppFrame />
        </UserRoutesProvider>
    );
}

function AppFrame() {
    const { session } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const headerRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        function handlePointerDown(event: PointerEvent) {
            if (!headerRef.current?.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        }

        if (isMenuOpen) {
            window.addEventListener("pointerdown", handlePointerDown);
        }

        return () => {
            window.removeEventListener("pointerdown", handlePointerDown);
        };
    }, [isMenuOpen]);

    useEffect(() => {
        const close = () => setIsMenuOpen(false);
        window.addEventListener("app-sheet-open", close);
        return () => window.removeEventListener("app-sheet-open", close);
    }, []);

    const closeMenu = () => setIsMenuOpen(false);

    return (
        <div className="app-shell">
            <header className="app-header" ref={headerRef}>
                <div className="app-header__inner">
                    <div className="app-header__bar">
                        <Link
                            className="app-brand"
                            onClick={closeMenu}
                            to={appRoutes.home}>
                            <span className="app-brand__name">T-GUIDE</span>
                        </Link>

                        <button
                            aria-controls="app-navigation"
                            aria-expanded={isMenuOpen}
                            aria-label={
                                isMenuOpen
                                    ? NAV_LABELS.closeMenu
                                    : NAV_LABELS.openMenu
                            }
                            className={`app-header__toggle${isMenuOpen ? " app-header__toggle--active" : ""}`}
                            onClick={() => {
                                const next = !isMenuOpen;
                                setIsMenuOpen(next);
                                if (next) {
                                    window.dispatchEvent(
                                        new CustomEvent("app-menu-open"),
                                    );
                                }
                            }}
                            type="button">
                            <span />
                            <span />
                            <span />
                        </button>
                    </div>

                    <div
                        className={`app-header__panel${isMenuOpen ? " app-header__panel--open" : ""}`}>
                        <nav className="app-nav" id="app-navigation">
                            <NavLink
                                className={({ isActive }) =>
                                    `app-nav__link${isActive ? " app-nav__link--active" : ""}`
                                }
                                end
                                onClick={closeMenu}
                                to={appRoutes.home}>
                                {NAV_LABELS.home}
                            </NavLink>
                            <NavLink
                                className={({ isActive }) =>
                                    `app-nav__link${isActive ? " app-nav__link--active" : ""}`
                                }
                                onClick={closeMenu}
                                to={appRoutes.excursions}>
                                {NAV_LABELS.routes}
                            </NavLink>
                            <NavLink
                                className={({ isActive }) =>
                                    `app-nav__link${isActive ? " app-nav__link--active" : ""}`
                                }
                                onClick={closeMenu}
                                to={appRoutes.profile}>
                                {NAV_LABELS.profile}
                            </NavLink>
                        </nav>

                        {!session?.isAuthenticated || !session.profile ? (
                            <div className="app-header__actions">
                                <Link
                                    className="button button--primary"
                                    onClick={closeMenu}
                                    to={appRoutes.signIn}>
                                    {NAV_LABELS.login}
                                </Link>
                            </div>
                        ) : null}
                    </div>
                </div>
            </header>

            <main className="app-shell__content">
                <AppRouter />
            </main>
        </div>
    );
}

export default App;
