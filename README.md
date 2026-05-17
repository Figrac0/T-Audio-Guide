# T-Guide

<div align="center">
  <a href="https://t-audio-guide-f-b.vercel.app/" target="_blank">
    <img
      src="https://github.com/Figrac0/Figrac0/blob/main/href.svg"
      alt="Quick Access - Visit Site"
      width="50%"
    />
  </a>
</div>

T-Guide — SPA для поиска мест рядом, просмотра готовых аудиоэкскурсий, сборки личного маршрута и работы с профилем пользователя.

---

## Содержание

1. [Стек и структура](#1-стек-и-структура)
2. [Точка входа и корневые компоненты](#2-точка-входа-и-корневые-компоненты)
3. [Роутинг и защита роутов](#3-роутинг-и-защита-роутов)
4. [Аутентификация](#4-аутентификация)
5. [Страницы — что делает каждая](#5-страницы)
6. [API-слой — как работают запросы](#6-api-слой)
7. [Сервисы — конкретные эндпоинты](#7-сервисы)
8. [Маппинг данных — backend → frontend](#8-маппинг-данных)
9. [Типы данных (entities)](#9-типы-данных)
10. [Контекст пользовательских маршрутов](#10-контекст-пользовательских-маршрутов)
11. [Хуки](#11-хуки)
12. [Карта (Leaflet)](#12-карта-leaflet)
13. [Утилиты](#13-утилиты)
14. [CSS — переменные и глобальные классы](#14-css)
15. [Хранилища (localStorage / sessionStorage)](#15-хранилища)
16. [Переменные окружения](#16-переменные-окружения)
17. [Потоки данных — пошагово](#17-потоки-данных)
18. [Что сейчас не работает (проблемы бэка)](#18-известные-проблемы)

---

## 1. Стек и структура

| Технология        | Версия   | Зачем                   |
| ----------------- | -------- | ----------------------- |
| React             | 19.2     | UI                      |
| TypeScript        | 5.9      | Типобезопасность        |
| Vite              | 8.0      | Сборка                  |
| Leaflet           | 1.9      | Интерактивные карты     |
| React Router      | 7.13     | Навигация               |
| CSS (глобальный)  | —        | Стили без CSS-in-JS     |

### Архитектура: Feature-Sliced Design (FSD)

```
src/
├── app/            ← корень: роутер, провайдеры, глобальные стили
├── pages/          ← страницы (HomePage, ExcursionsPage, ExcursionPage, ProfilePage, ...)
├── features/       ← функциональные модули (карта, геолокация, пользовательские маршруты)
├── entities/       ← доменные модели + хуки данных (Excursion, NearbyPoint, ...)
└── shared/         ← API, утилиты, конфиги, константы
```

---

## 2. Точка входа и корневые компоненты

### `src/main.tsx`

Единственная задача — создать React-root и рендернуть `<App />`.
Импортирует глобальные стили и CSS Leaflet.

### `src/app/App.tsx`

Оборачивает всё приложение в провайдеры по порядку:

```
BrowserRouter
  └── AuthProvider              ← управляет сессией (токены, пользователь)
        └── UserRoutesBoundary  ← следит за изменением userId, перемонтирует UserRoutesProvider
              └── UserRoutesProvider  ← черновик и сохранённые маршруты
                    └── AppFrame      ← шапка + <main> + AppRouter
```

`AppFrame` рендерит:
- `<header>` с логотипом `T-GUIDE`, кнопкой меню, навигационными ссылками
- `<main>` с `<AppRouter />`

Шапка скрывает кнопку "Войти" когда пользователь авторизован.

---

## 3. Роутинг и защита роутов

### `src/shared/config/routes.ts` — константы путей

```typescript
export const appRoutes = {
    home: "/",
    excursions: "/excursions",
    excursion: (slug: string) => `/excursions/${slug}`,
    signIn: "/auth/sign-in",
    profile: "/profile",
    savedRoutes: "/profile/routes",
};
```

### `src/app/providers/AppRouter.tsx`

Все страницы загружаются **лениво** (`React.lazy`).
`ProtectedRoute` — обёртка, которая проверяет `useAuth().session`:

- Если не авторизован → редирект на `/auth/sign-in` (с сохранением откуда пришёл)
- Если авторизован → рендерит дочерний компонент

```
/                    → HomePage          (публичная)
/auth/sign-in        → SignInPage        (публичная)
/excursions          → ExcursionsPage    (защищённая)
/excursions/:slug    → ExcursionPage     (защищённая)
/profile             → ProfilePage       (защищённая)
/profile/routes      → ProfilePage       (защищённая)
*                    → NotFoundPage
```

---

## 4. Аутентификация

### `src/app/providers/AuthProvider.tsx`

**Что делает:**
- При монтировании вызывает `appApi.getSession()` → пробует загрузить профиль
- Хранит `session: SessionDto | null` и `isLoading: boolean`
- Предоставляет через контекст: `signIn`, `register`, `signOut`, `updateProfile`, `changePassword`, `requestPasswordReset`

**SessionDto:**

```typescript
{
    isAuthenticated: boolean;
    profile: UserProfileDto | null; // null если гость
}
```

**UserProfileDto:**

```typescript
{
  id: string           // backend присылает number, конвертируем в string
  username?: string
  name: string
  email: string
  lang?: SupportedLocale
  language: SupportedLocale
  role: 'guest' | 'user' | 'admin'
}
```

### Как хранятся токены

Файл: `src/shared/api/http.ts`

После логина бэк присылает `{ tokens: { accessToken, refreshToken } }`.
Сохраняем в localStorage под ключом `t-guide:auth:tokens`.

При каждом запросе:
1. Читаем токены из localStorage
2. Добавляем заголовок `Authorization: Bearer <accessToken>`
3. Если ответ 401 → вызываем `POST /auth/refresh` с refreshToken
4. Если refresh успешен → повторяем исходный запрос с новым токеном
5. Если refresh провалился → чистим токены, пользователь становится гостем

**Пути без авторизации** (токен НЕ добавляется):
- `/auth/login`
- `/auth/registration`
- `/auth/refresh`

---

## 5. Страницы

### HomePage — `src/pages/home/ui/HomePage.tsx`

**Путь:** `/`

**Что показывает:**
- Карта на весь экран (`DiscoveryMap`)
- Шторка снизу в трёх состояниях: закрыта / peek / раскрыта (drag-to-snap)

**Шторка содержит:**

_Фильтры точек:_ `Все | Музеи | Развлечения | История | Еда | Природа`
→ меняют `activePointCategory` → триггерят `useDiscoveryRoutes`

_Карточки точек "Рядом с вами":_ горизонтальный скролл, клик → маркер на карте

_Фильтры маршрутов:_ по теме и времени, фильтрация на фронте

_Готовые маршруты:_ показывает максимум 4, ссылка "Смотреть все" → `/excursions`

**Состояние** хранится в sessionStorage: `t-guide:discovery-context`
(центр карты, радиус, категория, локаль)

---

### ExcursionsPage — `src/pages/excursions/ui/ExcursionsPage.tsx`

**Путь:** `/excursions` (защищённая)

**Что показывает:**
- Карта + шторка с drag-to-snap (три позиции: закрыта / peek / раскрыта)
- Конструктор маршрута: добавляй точки → нажми "Сохранить"
- Каталог готовых маршрутов с фильтрами
- Панель подробностей точки (`PointDetailPanel`)

**Панель подробностей точки** (`PointDetailPanel`):
- Изображение, метрики (расстояние, время ходьбы, рейтинг)
- Полное описание (разбито на параграфы)
- Кнопка "Прослушать аудиогид" — воспроизводит аудио через HTML5 Audio API
- Кнопка "Прочитать" — раскрывает полный текст транскрипта с плавной анимацией
- Кнопки "Добавить в маршрут" / "Убрать из маршрута"

Данные точки обогащаются через `/points/{id}` — добавляется полное описание, фото, URL аудио и транскрипт.

**Состояние** вынесено в `src/pages/excursions/model/useExcursionsPageState.ts`

---

### ExcursionPage — `src/pages/excursion/ui/ExcursionPage.tsx`

**Путь:** `/excursions/:slug` (защищённая)

**Три фазы:**

**1. InfoPhase** — обзор маршрута
- Обложка, заголовок, сложность, тема
- Статистика: время, точки, длина, формат
- Текстовое описание маршрута
- Список карточек остановок с индикатором наличия аудиогида
- Кнопки "Начать маршрут", "Сохранить", "Поделиться"

**2. NavigationPhase** — пошаговая навигация
- Карта на весь экран с текущей остановкой и маркером пользователя
- Перетаскиваемая шторка (drag-to-snap: закрыта / peek / раскрыта)
- Карточка текущей остановки: фото, название, рейтинг, расписание, описание
- **Блок аудиогида:**
  - Заголовок с длительностью (загружается из файла через `preload="metadata"`) и языком
  - Кнопка "Прослушать" / "Пауза" — воспроизводит аудио
  - Кнопка "Прочитать" / "Скрыть" — раскрывает транскрипт с плавной анимацией
- Навигация между точками: "Предыдущая" / "Следующая" / "Завершить"
- Кнопка геолокации

**3. CompleteScreen** — экран завершения
- Конфетти, статистика пройденного маршрута
- Форма отзыва (звёзды + текст)
- Кнопки "Сохранить маршрут", "Поделиться", "Все маршруты"

**Загрузка данных:**
`useRouteBySlug({ slug })` → `GET /excursions/{id}` → маппинг в `Excursion`.
Затем каждая остановка обогащается через `usePointDetailsMap` — добавляется полное описание, фото, URL аудио и полный текст транскрипта.

---

### ProfilePage — `src/pages/profile/ui/ProfilePage.tsx`

**Путь:** `/profile` (защищённая)

**Что показывает:**
- Форма профиля (имя, email, язык)
- Форма смены пароля
- Сохранённые маршруты (из избранного)
- Созданные маршруты (личные)

**Автовыход:** если `/profile` возвращает 401 → `signOut()` → редирект на `/auth/sign-in`.

---

### SignInPage — `src/pages/sign-in/ui/SignInPage.tsx`

**Путь:** `/auth/sign-in` (публичная)

**Три режима** в одном компоненте:
- `sign-in` — email + пароль → `appApi.signIn()`
- `register` — email + имя + пароль + язык → `appApi.register()`
- `reset` — email → `appApi.requestPasswordReset()`

После успешного входа/регистрации → редирект на `/` или на страницу откуда пришли.

---

## 6. API-слой

### Схема вызовов

```
Компонент/Хук
    ↓ вызывает
appApi (src/shared/api/client.ts)
    ↓ делегирует в
authService / profileService / excursionsService / pointsService
    ↓ вызывают
request<T>(path, init) (src/shared/api/http.ts)
    ↓ делает
fetch(VITE_API_URL + path, { headers: { Authorization: Bearer ... } })
    ↓ возвращает
JSON → маппинг (src/shared/api/mappers.ts) → фронтовый тип
```

### `src/shared/api/client.ts` — главный фасад

```typescript
export const appApi: FrontendApi = useMockApi ? mockApi : httpApi;
```

`useMockApi = true` когда `VITE_USE_MOCK_API !== 'false'` или нет `VITE_API_URL`.

**Методы `httpApi`:**

| Метод                          | Что делает                                                              |
| ------------------------------ | ----------------------------------------------------------------------- |
| `getDiscoveryFeed(payload)`    | Параллельно: `/points/search` + `/excursions/search`, маппит результат  |
| `getProfileOverview()`         | Параллельно: `/profile` + `/excursions/my` + `/excursions/favorites`    |
| `getRouteBySlug(payload)`      | Парсит id из slug → `/excursions/{id}`                                  |
| `getRoutesCatalog(payload)`    | `/excursions/search` по текущей локации                                 |
| `getSession()`                 | `/profile` → `{isAuthenticated, profile}`                               |
| `signIn(payload)`              | `authService.login()`                                                   |
| `register(payload)`            | `authService.register()`                                                |
| `signOut()`                    | `authService.logout()`                                                  |
| `createPersonalRoute(payload)` | `POST /excursions` с массивом точек                                     |
| `updateProfile(payload)`       | `profileService.updateProfile()`                                        |
| `changePassword(payload)`      | `authService.changePassword()`                                          |

### `src/shared/api/http.ts` — HTTP-клиент

```typescript
export async function request<T>(path: string, init?: RequestInit): Promise<T>;
```

- Добавляет `Content-Type: application/json`
- Добавляет `Authorization: Bearer <token>` (если токен есть и путь не в whitelist)
- При 401 → пробует refresh → повторяет запрос
- Парсит ошибку из JSON-тела (`body.message || body.error`)
- При 204 или пустом ответе возвращает `undefined`

---

## 7. Сервисы

### `src/shared/api/authService.ts`

```typescript
authService.login({ login, password });
// POST /auth/login → { tokens, user } → сохраняет токены, возвращает SessionDto

authService.register({ name, email, password, language });
// POST /auth/registration → { tokens, user } → сохраняет токены, возвращает SessionDto

authService.logout();
// POST /auth/logout { refreshToken } → чистит токены, возвращает гостевую сессию

authService.changePassword({ oldPassword, newPassword });
// POST /profile/change-password
```

### `src/shared/api/profileService.ts`

```typescript
profileService.getProfile();
// GET /profile → UserResponse → нормализует: id в string, lang в lowercase

profileService.updateProfile({ name, email, language });
// PATCH /profile { name, email, lang: language.toUpperCase() }
```

### `src/shared/api/excursionsService.ts`

```typescript
excursionsService.searchExcursions({ location, radiusKilometers });
// POST /excursions/search → { excursions: ExcursionShortItem[] }

excursionsService.getExcursionById(id);
// GET /excursions/{id} → ExcursionDetailResponse { ..., points: { points: PointShortItem[] } }

excursionsService.createExcursion({ title, description, points });
// POST /excursions { title, description, points: [{pointId, order}] }

excursionsService.getMyExcursions();   // GET /excursions/my
excursionsService.getFavoriteExcursions(); // GET /excursions/favorites
excursionsService.addFavorite(id);     // POST /excursions/{id}/favorite
excursionsService.removeFavorite(id);  // POST /excursions/{id}/unfavorite
excursionsService.deleteExcursion(id); // DELETE /excursions/{id}
```

### `src/shared/api/pointsService.ts`

```typescript
pointsService.searchPoints({ location, radiusKilometers, categorySlugs })
// POST /points/search → { points: PointShortItem[] }
// categorySlugs: [] если нет фильтра (НЕ undefined — иначе 500)

pointsService.getPointDetail(id)
// GET /points/{id} → PointDetailResponse { ..., media: [{url, type, sortOrder, transcript?}] }

pointsService.getCategories()
// GET /points/categories → { categories: [{id, name, slug}] }
```

---

## 8. Маппинг данных

### `src/shared/api/mappers.ts`

**Backend-типы:**

```typescript
ApiPointMedia {
  url: string
  type: string          // 'IMAGE', 'VIDEO', 'AUDIO'
  sortOrder: number
  transcript?: string | null  // текст для AUDIO-медиа (транскрипт)
}

ApiPointDetail {
  id: number
  title: string
  description?: string | null
  shortDescription?: string | null
  address?: string | null
  workingHours?: string | null
  media?: ApiPointMedia[]
}

ApiExcursionDetail {
  id: number
  title: string
  description?: string
  distance?: number         // метры
  durationMin?: number      // минуты
  pointsCount?: number
  points?: { points: ApiExcursionPoint[] }
}
```

**Функции маппинга:**

```typescript
mapNearbyPointFromShort(point, centerLat, centerLng): NearbyPoint
// ApiPointShort → NearbyPoint
// imageUrl: '' (нет медиа в кратком ответе), audioGuideUrl: null

mapNearbyPointFromDetail(point, centerLat, centerLng): NearbyPoint
// ApiPointDetail → NearbyPoint
// imageUrl: первое медиа с type=IMAGE*, audioGuideUrl: первое медиа с type=AUDIO*

mapRouteStopFromApiPoint(point, index, locale): RouteStop
// ApiExcursionPoint → RouteStop
// imageUrl: '' (нет медиа), audio.hasAudioGuide: false (бэк отдаёт только PointShortItem)
// Аудио обогащается отдельно через usePointDetailsMap

mapExcursionFromShort(exc): Excursion
mapExcursionFromDetail(exc, locale): Excursion

extractPointDetailData(detail: ApiPointDetail): PointDetailData
// Извлекает описание, фото, URL аудио и транскрипт из detail-ответа
// audioUrl: первое AUDIO-медиа по sortOrder
// audioTranscript: audio?.transcript ?? null

haversineDistance(lat1, lng1, lat2, lng2): number
// Расстояние в метрах по сферической формуле Хаверсина
```

---

## 9. Типы данных

### `src/entities/excursion/model/types.ts`

```typescript
// Точка интереса (с дистанцией)
NearbyPoint {
  id: string
  title: string
  category: PointCategory       // 'museum' | 'food' | 'park' | 'entertainment' | 'landmark'
  categoryName?: string         // оригинальное название категории с бэка
  shortDescription: string
  description: string
  coordinates: GeoPoint         // { lat, lng }
  imageUrl: string
  expectedVisitMinutes: number
  rating: number
  scheduleLabel: string
  distanceMeters: number
  addressLabel?: string
  googleMapsUrl?: string
  audioGuideUrl: string | null
  audioTranscript?: string | null  // полный текст аудиогида (из /points/{id})
}

// Остановка маршрута
RouteStop {
  id: string
  order: number
  title: string
  category: PointCategory
  categoryName?: string
  shortDescription: string
  description: string
  coordinates: GeoPoint
  imageUrl: string
  expectedVisitMinutes: number
  rating: number
  scheduleLabel: string
  audio: AudioStory
}

// Аудиогид остановки
AudioStory {
  id: string
  hasAudioGuide: boolean
  audioGuideUrl: string | null   // основной URL
  audioDuration: number          // секунды (из бэка, обычно 0; реальное время грузится через HTML5 Audio)
  audioLanguage: SupportedLocale
  url: string | null             // запасной URL
  durationSeconds: number        // запасная длительность
  language: SupportedLocale
  transcriptPreview: string      // полный текст транскрипта (backfill из /points/{id})
}

// Маршрут/экскурсия
Excursion {
  id: number
  slug: string                   // формат: "excursion-{id}"
  title: string
  tagline: string
  description: string
  theme: ExcursionTheme          // 'walk' | 'food' | 'nature' | 'fun' | 'mixed'
  district: string
  durationMinutes: number
  distanceKm: number
  pointsCount?: number
  startLabel: string
  finishLabel: string
  coverImageUrl: string
  routeColor: string
  difficulty: ExcursionDifficulty  // 'easy' | 'medium' | 'hard'
  audienceLabel: string
  stops: RouteStop[]
}
```

---

## 10. Контекст пользовательских маршрутов

### `src/features/user-routes/model/UserRoutesProvider.tsx`

**Хранит:**

```typescript
draftStops: RouteStop[]     // черновик (макс 10 остановок)
savedRoutes: Excursion[]    // избранные маршруты
personalRoutes: Excursion[] // созданные пользователем
```

**Ключ localStorage:** `t-guide:user-routes:{userId}`

**Методы:**

```typescript
addPointToDraft(point: NearbyPoint): void
// NearbyPoint → RouteStop, добавляет если ещё нет и < 10 остановок

removeDraftStop(stopId: string): void
reorderDraftStop(fromIndex: number, toIndex: number): void
clearDraftRoute(): void

saveDraftRoute(): SaveDraftRouteResult
// Вычисляет distance, duration, difficulty из stops
// → POST /excursions → personalRoutes.push(excursion)

toggleSavedRoute(route: Excursion): void
shareRoute(route: Excursion): Promise<void>

isPointInDraft(pointId: string): boolean
isRouteSaved(slug: string): boolean
```

---

## 11. Хуки

### `useDiscoveryRoutes` — `src/entities/excursion/model/useDiscoveryRoutes.ts`

```typescript
function useDiscoveryRoutes(params: {
    activePointCategory: PointCategory | 'all';
    center: GeoPoint;
    enabled?: boolean;
    locale: SupportedLocale;
    radiusMeters: number;
}): {
    error: string | null;
    excursions: Excursion[];
    isLoading: boolean;
    nearbyPoints: NearbyPoint[];
};
```

Параллельно запрашивает `/points/search` + `/excursions/search` с debounce 300ms.

---

### `useRouteBySlug` — `src/entities/excursion/model/useRouteBySlug.ts`

```typescript
function useRouteBySlug(params: {
    slug: string;
    locale: SupportedLocale;
    // + остальные из useDiscoveryRoutes
}): {
    error: string | null;
    isLoading: boolean;
    route: Excursion | null;
};
```

Парсит `id` из `slug` → `GET /excursions/{id}` → маппит в `Excursion`.

---

### `usePointDetailsMap` — `src/entities/excursion/model/usePointDetailsMap.ts`

```typescript
function usePointDetailsMap(ids: string[]): Map<string, PointDetailData>

interface PointDetailData {
  description: string
  shortDescription: string
  imageUrl: string
  audioUrl: string | null       // URL аудиофайла
  audioTranscript: string | null  // полный текст транскрипта
  address: string
  workingHours: string
}
```

Загружает полные данные точек через `GET /points/{id}` параллельно.
Результаты кешируются на уровне сессии (Map на уровне модуля).
Используется для обогащения остановок маршрута в `ExcursionPage` и точек в `ExcursionsPage`.

---

### `useAudioGuide` — `src/pages/excursion/model/useAudioGuide.ts`

```typescript
function useAudioGuide(
    currentStop: RouteStop,
    currentStopIndex: number
): {
    isAudioPlaying: boolean;
    isAudioAvailable: boolean;
    toggleAudio: () => void;
    loadedDurationSeconds: number | null;  // реальная длина из HTML5 Audio метаданных
};
```

**Как работает:**
- При наличии `audioUrl` создаёт скрытый `Audio` с `preload="metadata"` → получает реальную длину трека без загрузки всего файла
- При воспроизведении создаёт основной `Audio` и запускает его
- При смене `currentStopIndex` автоматически останавливает и освобождает аудио
- `loadedDurationSeconds` — точная длительность в секундах, обновляется по событию `loadedmetadata`

---

### `useUserGeolocation` — `src/features/route-map/model/useUserGeolocation.ts`

```typescript
function useUserGeolocation(): {
    error: string | null;
    requestLocation: () => void;
    status: 'idle' | 'loading' | 'tracking' | 'blocked' | 'unsupported';
    userPosition: GeoPoint | null;
};
```

Использует `navigator.geolocation.watchPosition()` для непрерывного отслеживания.

---

### `useProfileOverview` — `src/shared/api/useProfileOverview.ts`

```typescript
function useProfileOverview(enabled: boolean): {
    error: string | null;
    isLoading: boolean;
    overview: ProfileOverviewDto | null;
};
```

Параллельно загружает `/profile` + `/excursions/my` + `/excursions/favorites`.

---

### `useAuth` — `src/app/providers/useAuth.ts`

```typescript
function useAuth(): {
    isLoading: boolean;
    session: SessionDto | null;
    signIn(payload): Promise<SessionDto>;
    register(payload): Promise<SessionDto>;
    signOut(): Promise<void>;
    updateProfile(payload): Promise<UserProfileDto>;
    changePassword(payload): Promise<void>;
    requestPasswordReset(payload): Promise<void>;
};
```

---

## 12. Карта (Leaflet)

### `src/features/route-map/ui/RouteMap.tsx` + `LeafletRouteMap.tsx`

Оборачивает Leaflet. В режиме навигации показывает только текущую остановку.

### `src/features/route-map/ui/DiscoveryMap.tsx`

Карта для режима открытия: маркеры всех ближних точек, радиус поиска, черновик маршрута.

### `src/features/route-map/ui/RouteBuilderMap.tsx`

Карта для ExcursionsPage: поддерживает выбор точек, popup с краткими данными, кнопку "Подробнее".

### `src/features/route-map/lib/leaflet-map.ts`

Низкоуровневые функции:
```typescript
createLeafletMap(container, options)
createUserIcon()
createPoiIcon(category, isSelected)
createDiscoveryRadiusCircle(map, center, radiusMeters)
createGuidePolyline(map, points, color)
```

### `src/features/route-map/lib/route-geometry.ts`

```typescript
getDistanceMetersBetween(p1: GeoPoint, p2: GeoPoint): number
formatMeters(meters: number): string  // "150 м" или "1.2 км"
```

**Центр карты по умолчанию** (`src/shared/config/map.ts`):
```typescript
defaultCenter: { lat: 55.751244, lng: 37.618423 }  // Москва
defaultZoom: 14
discoveryRadiusMeters: 1200
```

---

## 13. Утилиты

### `src/shared/lib/format.ts`

```typescript
formatDuration(minutes: number): string
// 25 → "25 мин", 90 → "1 ч 30 мин", 60 → "1 ч"

formatDistance(km: number): string
// 2.5 → "2,5 км", 0.15 → "150 м"

formatMeters(meters: number): string
// 150 → "150 м", 1200 → "1,2 км"

formatStopCount(count: number): string
// 1 → "1 точка", 3 → "3 точки", 5 → "5 точек"

formatLocaleLabel(locale: SupportedLocale): string
// 'ru' → "Русский", 'en' → "English", 'de' → "Deutsch"

formatDifficulty(difficulty: ExcursionDifficulty): string
// 'easy' → "Легко", 'medium' → "Средне", 'hard' → "Насыщенно"

formatTheme(theme: ExcursionTheme): string
// 'walk' → "Прогулка", 'food' → "Еда", 'nature' → "Природа"
```

### `src/shared/lib/discovery-context.ts`

```typescript
getDefaultDiscoveryContext(): DiscoveryContext
getStoredDiscoveryContext(): DiscoveryContext  // читает из sessionStorage, при ошибке → default
saveDiscoveryContext(ctx: DiscoveryContext): void
detectSupportedLocale(candidate?: string): SupportedLocale
```

### `src/entities/excursion/lib/audio-guide.ts`

```typescript
getAudioGuideUrl(audio: AudioStory): string | null
// Возвращает audioGuideUrl ?? url ?? null

getAudioGuideDuration(audio: AudioStory): number
// Возвращает audioDuration ?? durationSeconds

getAudioGuideLanguage(audio: AudioStory): SupportedLocale
// Возвращает audioLanguage ?? language

hasAudioGuideAvailable(audio: AudioStory): boolean
// true если hasAudioGuide && getAudioGuideUrl !== null
```

---

## 14. CSS

### Переменные — `src/app/styles/tokens.css`

```css
/* Цвета */
--color-bg: #f4f6fb
--color-bg-elevated: #ffffff
--color-text: #1f2533
--color-text-secondary: #5d6679
--color-text-tertiary: ...
--color-line: #e6e9f0
--color-brand: #1f8a70          /* основной зелёный */
--color-brand-strong: #0f766e
--color-brand-soft: #e8faf4
--color-accent: #ffdd2d         /* жёлтый */
--color-danger: #c2514b

/* Скругления */
--radius-pill: 999px
--radius-2xl: 32px
--radius-xl: 28px
--radius-lg: 22px
--radius-md: 16px

/* Тени */
--shadow-card: 0 8px 24px rgba(31, 37, 51, 0.07)
--shadow-pill: 0 4px 12px rgba(31, 37, 51, 0.1)
```

### Глобальные классы — `src/app/styles/global.css`

```css
/* Кнопки */
.button              /* базовая кнопка */
.button--primary     /* жёлтый градиент */
.button--secondary   /* белый */
.button--ghost       /* полупрозрачный */
.button--danger      /* красный */
.button--wide        /* width: 100% */

/* Чипы */
.chip
.chip--accent

/* Фильтры */
.filter-pill
.filter-pill--active

/* Поля формы */
.field / .field__label / .field__input

/* Карточки состояний */
.status-card
.status-card--error

/* Секции */
.section-surface / .section-title / .page-title / .eyebrow
```

### Стили по страницам

| CSS-файл | Компонент | Ключевые классы |
| --- | --- | --- |
| `ExcursionPage.css` | ExcursionPage | `.ep-info__*`, `.ep-nav__*`, `.ep-complete__*`, `.ep-stop-card__*` |
| `ExcursionsPage.css` | ExcursionsPage | `.ep__*`, `.ep-sheet__*`, `.ep-detail__*`, `.ep-draft__*`, `.ep-card__*` |
| `ProfilePage.css` | ProfilePage | `.profile__*` |
| `map-marker-skin.css` | LeafletRouteMap | маркеры и оверлеи карты |

---

## 15. Хранилища

| Ключ                           | Тип хранилища  | Что хранит                                    |
| ------------------------------ | -------------- | --------------------------------------------- |
| `t-guide:auth:tokens`          | localStorage   | `{ accessToken, refreshToken }`               |
| `t-guide:user-routes:{userId}` | localStorage   | `{ draftStops, savedRoutes, personalRoutes }` |
| `t-guide:discovery-context`    | sessionStorage | `{ center, radiusMeters, category, locale }`  |
| `t-guide:last-route`           | localStorage   | прогресс текущего прохождения маршрута        |

---

## 16. Переменные окружения

Файл: `.env.local` (не коммитится в git)

```env
VITE_API_URL=https://...
VITE_USE_MOCK_API=false
```

Если `VITE_USE_MOCK_API=false` и `VITE_API_URL` задан → используется реальный бэк.
Иначе → `mockApi` (статические тестовые данные).

---

## 17. Потоки данных

### Загрузка главной страницы

```
HomePage монтируется
  → useDiscoveryRoutes({ center: Москва, radius: 1200, category: 'all' })
  → debounce 300ms
  → appApi.getDiscoveryFeed()
  → Promise.all([
      POST /points/search  { location, radiusKilometers: 1, categorySlugs: [] },
      POST /excursions/search { location, radiusKilometers: 1 }
    ])
  → mapNearbyPointFromShort() × N точек
  → mapExcursionFromShort() × M маршрутов
  → nearbyPoints + excursions → рендер
```

### Прохождение экскурсии с аудиогидом

```
ExcursionPage монтируется (/excursions/:slug)
  → useRouteBySlug → GET /excursions/{id} → Excursion с stops[]
  → usePointDetailsMap(stopIds) → GET /points/{id} × N (параллельно, с кешем)
  → Каждая остановка обогащается:
      description, imageUrl, audioUrl, audioTranscript

Пользователь нажимает "Начать маршрут" → NavigationPhase
  → useAudioGuide(currentStop, currentStopIndex)
      → создаёт Audio(preload='metadata') → loadedmetadata → loadedDurationSeconds
  → Чип длительности показывает реальное время из аудиофайла

Пользователь нажимает "Прослушать"
  → toggleAudio() → new Audio(audioUrl).play()
  → кнопка меняется на "Пауза"

Пользователь нажимает "Прочитать"
  → измеряется scrollHeight контейнера транскрипта
  → maxHeight анимируется 0 → scrollHeight (cubic-bezier)
  → кнопка меняется на "Скрыть"

Пользователь переходит на следующую остановку
  → useAudioGuide останавливает и освобождает предыдущее аудио
  → isTranscriptOpen сбрасывается в false
```

### Обогащение точки данными (PointDetailPanel)

```
Пользователь кликает на маркер → state.handleShowDetail(point)
  → detailPoint = base NearbyPoint (краткие данные)
  → usePointDetailsMap([point.id]) → GET /points/{id} (с кешем)
  → detailPoint обогащается: description, imageUrl, audioGuideUrl, audioTranscript
  → PointDetailPanel рендерится с полными данными
  → Кнопка "Прочитать аудиогид" появляется если audioTranscript !== null
```

### Автообновление токена

```
Любой запрос → 401
  → request() перехватывает
  → POST /auth/refresh { refreshToken }
  → если 200: writeAuthTokens(newTokens), повторяем исходный запрос
  → если не 200: clearAuthTokens(), пользователь становится гостем
```

---

## 18. Известные проблемы

| Проблема                                               | Статус                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `POST /excursions/search` → 500 на некоторых запросах  | Ошибка на бэке, запрос правильный                                     |
| `GET /profile` → 401 после логина                      | Возможно бэк не принимает свои же токены                              |
| `GET /excursions/my` и `/favorites` без пагинации      | Бэк добавит `?page=0&size=25`                                         |
| `coverImageUrl` у маршрутов часто пустой               | Ждём от бэка или берём из первой точки маршрута                       |
| `rating` у точек всегда 0                              | Ждём эндпоинт отзывов                                                 |
| `difficulty` маршрута всегда `'easy'`                  | Бэк не присылает, заглушка                                            |
| `audioDuration` у остановок всегда 0                   | Бэк не отдаёт длину; реальная длина загружается из аудиофайла на клиенте |

---
