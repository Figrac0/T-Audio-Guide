import { useState } from "react";
import { Link } from "react-router-dom";

import { CategoriesSection } from "@/pages/admin/ui/CategoriesSection";
import { ExcursionsSection } from "@/pages/admin/ui/ExcursionsSection";
import { PointsSection } from "@/pages/admin/ui/PointsSection";
import { UsersSection } from "@/pages/admin/ui/UsersSection";
import { appRoutes } from "@/shared/config/routes";
import "./AdminPage.css";

type Section = "categories" | "points" | "excursions" | "users";

const sectionTitles: Record<Section, string> = {
    categories: "Категории",
    points: "Точки",
    excursions: "Экскурсии",
    users: "Пользователи",
};

export function AdminPage() {
    const [section, setSection] = useState<Section>("categories");

    return (
        <div className="admin-page">
            <header className="admin-page__header">
                <div className="admin-page__header-row">
                    <Link className="admin-page__back" to={appRoutes.profile}>
                        ← К профилю
                    </Link>
                    <h1 className="admin-page__title">Админ-панель</h1>
                </div>
                <p className="admin-page__hint">
                    Редактируйте и добавляйте категории, точки интереса (с
                    медиа), готовые экскурсии, пользователи.
                </p>
            </header>

            <nav className="admin-page__tabs" role="tablist">
                {(Object.keys(sectionTitles) as Section[]).map((key) => (
                    <button
                        aria-selected={section === key}
                        className={`admin-page__tab${section === key ? " admin-page__tab--active" : ""}`}
                        key={key}
                        onClick={() => setSection(key)}
                        role="tab"
                        type="button">
                        {sectionTitles[key]}
                    </button>
                ))}
            </nav>

            <main className="admin-page__content">
                {section === "categories" ? <CategoriesSection /> : null}
                {section === "points" ? <PointsSection /> : null}
                {section === "excursions" ? <ExcursionsSection /> : null}
                {section === "users" ? <UsersSection /> : null}
            </main>
        </div>
    );
}
