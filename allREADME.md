# T-Guide — Полная документация фронтенда

> Этот файл описывает **каждый файл, каждый хук, каждый эндпоинт и каждый поток данных** в проекте.

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
13. [Виджеты](#13-виджеты)
14. [Утилиты](#14-утилиты)
15. [CSS — переменные и глобальные классы](#15-css)
16. [Хранилища (localStorage / sessionStorage)](#16-хранилища)
17. [Переменные окружения](#17-переменные-окружения)
18. [Потоки данных — пошагово](#18-потоки-данных)
19. [Что сейчас не работает (проблемы бэка)](#19-известные-проблемы)

---

## 1. Стек и структура

| Технология                   | Зачем               |
| ---------------------------- | ------------------- |
| React 18                     | UI                  |
| TypeScript                   | Типобезопасность    |
| Vite                         | Сборка              |
| Leaflet                      | Интерактивные карты |
| React Router v6              | Навигация           |
| CSS Modules + глобальный CSS | Стили               |

### Архитектура: Feature-Sliced Design (FSD)

```
src/
├── app/            ← корень: роутер, провайдеры, глобальные стили
├── pages/          ← страницы (HomePage, ExcursionsPage, ...)
├── widgets/        ← крупные переиспользуемые блоки (ExcursionCatalog, RouteOverview)
├── features/       ← функциональные модули (карта, геолокация, маршруты)
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
  └── AuthProvider          ← управляет сессией (токены, пользователь)
        └── UserRoutesBoundary  ← следит за изменением userId, перемонтирует UserRoutesProvider
              └── UserRoutesProvider  ← управляет черновиком и сохранёнными маршрутами
                    └── AppFrame      ← шапка + <main> + AppRouter
```

### `src/app/App.tsx` → `AppFrame`

Рендерит:

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
  id: string           // backend присылает number, мы конвертируем в string
  username?: string
  name: string
  email: string
  lang?: SupportedLocale
  language: SupportedLocale
  role: 'guest' | 'user' | 'admin'
}
```

### `src/app/providers/auth-context.ts`

Определяет интерфейс `AuthContextValue` — то, что возвращает `useAuth()`.

### `src/app/providers/useAuth.ts`

```typescript
export function useAuth(): AuthContextValue;
// Бросает ошибку если вызвать вне AuthProvider
```

### Как хранятся токены

Файл: `src/shared/api/http.ts`

После логина бэк присылает `{ tokens: { accessToken, refreshToken } }`.
Мы сохраняем в localStorage под ключом `t-guide:auth:tokens`.

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

_Фильтры точек:_
`Все | Музеи | Развлечения | История | Еда | Природа`
→ меняют `activePointCategory` → триггерят `useDiscoveryRoutes`

_Карточки точек "Рядом с вами":_

- Горизонтальный скролл
- Клик на карточку → маркер на карте + детали точки

_Фильтры маршрутов:_
По теме: `Все | Прогулка | Еда | Природа | Развлечения | Разное`
По времени: `Любое | До 30 мин | До 60 мин | До 90 мин | До 120 мин`
→ фильтрация **на фронте** из уже загруженного массива

_Готовые маршруты:_

- `ExcursionCatalog` — показывает максимум 4
- Ссылка "Смотреть все" → `/excursions`

**Хуки которые использует:**

```typescript
useDiscoveryRoutes(); // ← главные данные: nearbyPoints + excursions
useUserGeolocation(); // ← позиция пользователя на карте
useUserRoutes(); // ← черновик маршрута
useAuth(); // ← проверка авторизации
```

**Состояние хранится** в sessionStorage: `t-guide:discovery-context`
(центр карты, радиус, категория, локаль)

---

### ExcursionsPage — `src/pages/excursions/ui/ExcursionsPage.tsx`

**Путь:** `/excursions` (защищённая)

**Что показывает:**

- Карта + шторка (аналогично Home)
- Конструктор маршрута: добавляй точки → нажми "Сохранить"
- Каталог готовых маршрутов с фильтрами

**Состояние** вынесено в `src/pages/excursions/model/useExcursionsPageState.ts`

---

### ExcursionPage — `src/pages/excursion/ui/ExcursionPage.tsx`

**Путь:** `/excursions/:slug` (защищённая)

**Три фазы:**

1. **InfoPhase** — обзор маршрута, список остановок, кнопки "Начать", "Сохранить", "Поделиться"
2. **NavigationPhase** — пошаговая навигация, аудиогид, геолокация
3. **CompleteScreen** — экран завершения, оценка

**Загрузка данных:** `useRouteBySlug({ slug })` → `appApi.getRouteBySlug()` → `GET /excursions/{id}`

Slug имеет формат `excursion-{id}`, например `excursion-42`.
Мы парсим id из slug и запрашиваем бэк.

---

### ProfilePage — `src/pages/profile/ui/ProfilePage.tsx`

**Путь:** `/profile` (защищённая)

**Что показывает:**

- Форма профиля (имя, email, язык)
- Форма смены пароля
- Сохранённые маршруты (из избранного)
- Созданные маршруты (личные)
- История посещений

**Автовыход при ошибке авторизации:**
Если `GET /profile` возвращает 401 → `useEffect` определяет ошибку авторизации →
вызывает `signOut()` → редирект на `/auth/sign-in`.

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

| Метод                          | Что делает                                                             |
| ------------------------------ | ---------------------------------------------------------------------- |
| `getDiscoveryFeed(payload)`    | Параллельно: `/points/search` + `/excursions/search`, маппит результат |
| `getProfileOverview()`         | Параллельно: `/profile` + `/excursions/my` + `/excursions/favorites`   |
| `getRouteBySlug(payload)`      | Парсит id из slug → `/excursions/{id}`                                 |
| `getRoutesCatalog(payload)`    | `/excursions/search` по текущей локации                                |
| `getSession()`                 | `/profile` → `{isAuthenticated, profile}`                              |
| `signIn(payload)`              | `authService.login()`                                                  |
| `register(payload)`            | `authService.register()`                                               |
| `signOut()`                    | `authService.logout()`                                                 |
| `createPersonalRoute(payload)` | `POST /excursions` с массивом точек                                    |
| `updateProfile(payload)`       | `profileService.updateProfile()`                                       |
| `changePassword(payload)`      | `authService.changePassword()`                                         |

### `src/shared/api/http.ts` — HTTP-клиент

```typescript
export async function request<T>(path: string, init?: RequestInit): Promise<T>;
```

- Добавляет `Content-Type: application/json`
- Добавляет `Authorization: Bearer <token>` (если токен есть и путь не в whitelist)
- При 401 → пробует refresh → повторяет запрос
- Парсит ошибку из JSON-тела (`body.message || body.error`)
- При 204 или пустом ответе возвращает `undefined`

**Управление токенами:**

```typescript
readAuthTokens(): AuthTokensDto | null   // читает из localStorage
writeAuthTokens(tokens): void            // пишет в localStorage
clearAuthTokens(): void                  // удаляет из localStorage
```

Токен считается невалидным и удаляется если:

- длина < 16 символов
- равен строке `'mocked_access_token'`

---

## 7. Сервисы

### `src/shared/api/authService.ts`

```typescript
authService.login({ login, password });
// POST /auth/login
// body: { username: login, password }
// response: { tokens: { accessToken, refreshToken }, user: {...} }
// → сохраняет токены, возвращает SessionDto

authService.register({ name, email, password, language });
// POST /auth/registration
// body: { username (из email), email, name, password, lang: "RU" }
// response: { tokens: {...}, user: {...} }
// → сохраняет токены, возвращает SessionDto

authService.logout();
// POST /auth/logout
// body: { refreshToken } — только если токен есть!
// → чистит токены, возвращает гостевую сессию

authService.changePassword({ oldPassword, newPassword });
// POST /profile/change-password
```

### `src/shared/api/profileService.ts`

```typescript
profileService.getProfile();
// GET /profile
// response: UserResponse { id, username, email, name, lang, role }
// → нормализует: id в string, lang в lowercase

profileService.updateProfile({ name, email, language });
// PATCH /profile
// body: { name, email, lang: language.toUpperCase() }
```

### `src/shared/api/excursionsService.ts`

```typescript
excursionsService.searchExcursions({ location, radiusKilometers });
// POST /excursions/search
// body: { location: {latitude, longitude}, radiusKilometers }
// radiusKilometers — целое число [1, 15]
// response: { excursions: ExcursionShortItem[] }

excursionsService.getExcursionById(id);
// GET /excursions/{id}
// response: ExcursionDetailResponse { ..., points: { points: PointShortItem[] } }

excursionsService.createExcursion({ title, description, points });
// POST /excursions
// body: { title, description, points: [{pointId, order}] }

excursionsService.getMyExcursions();
// GET /excursions/my
// (скоро: ?page=0&size=25)

excursionsService.getFavoriteExcursions();
// GET /excursions/favorites
// (скоро: ?page=0&size=25)

excursionsService.addFavorite(id);
// POST /excursions/{id}/favorite

excursionsService.removeFavorite(id);
// POST /excursions/{id}/unfavorite

excursionsService.deleteExcursion(id);
// DELETE /excursions/{id}
```

### `src/shared/api/pointsService.ts`

```typescript
pointsService.searchPoints({ location, radiusKilometers, categorySlugs, visitTime? })
// POST /points/search
// body: { location: {latitude, longitude}, radiusKilometers, categorySlugs: [] }
// categorySlugs: [] — пустой массив если нет фильтра (НЕ undefined — иначе 500)
// radiusKilometers — целое число [1, 15]
// response: { points: PointShortItem[] }

pointsService.getPointDetail(id)
// GET /points/{id}
// response: PointDetailResponse { ..., media: [{url, type, sortOrder}] }

pointsService.getCategories()
// GET /points/categories
// response: { categories: [{id, name, slug}] }
```

---

## 8. Маппинг данных

### `src/shared/api/mappers.ts`

Бэк и фронт используют разные форматы. Маппинг происходит здесь.

### Backend-типы (как приходит от бэка)

```typescript
// Краткая точка (из /points/search)
ApiPointShort {
  id: number
  title: string
  shortDescription?: string | null   // ← swagger добавил
  categoryId: number
  categoryName: string               // напр. "Музей", "museum", "restaurant"
  coordinates: { latitude, longitude }
  visitTime?: number | null          // минуты
}

// Детальная точка (из /points/{id})
ApiPointDetail extends ApiPointShort {
  description?: string | null
  shortDescription?: string | null
  address?: string | null
  workingHours?: string | null
  media?: ApiPointMedia[]            // фото/видео/аудио
}

ApiPointMedia {
  url: string
  type: string    // 'IMAGE', 'VIDEO', 'AUDIO'
  sortOrder: number
}

// Краткая экскурсия (из /excursions/search)
ApiExcursionShort {
  id: number
  title: string
  description?: string
  shortDescription?: string
  distance?: number          // метры!
  durationMin?: number       // минуты
  pointsCount?: number
  coordinates?: { latitude, longitude }
  categoryIds?: number[]
  owner?: boolean
  routeType?: string         // 'PREBUILT' | 'CUSTOM'
  visibility?: string        // 'PUBLIC' | 'PRIVATE'
}

// Детальная экскурсия (из /excursions/{id})
ApiExcursionDetail extends ApiExcursionShort {
  duration?: number          // альтернативное поле (используем если нет durationMin)
  points?: { points: ApiExcursionPoint[] }  // двойная вложенность!
}

// Точка внутри экскурсии (PointShortItem)
ApiExcursionPoint extends ApiPointShort {
  order?: number
}
```

### Функции маппинга

```typescript
mapNearbyPointFromShort(point, centerLat, centerLng): NearbyPoint
// ApiPointShort → NearbyPoint
// shortDescription: point.shortDescription ?? ''
// imageUrl: ''  (нет медиа в кратком ответе)
// distanceMeters: haversineDistance(center, point.coordinates)

mapNearbyPointFromDetail(point, centerLat, centerLng): NearbyPoint
// ApiPointDetail → NearbyPoint
// shortDescription: point.shortDescription ?? point.description ?? ''
// imageUrl: getImageUrl(point.media)  ← ищет type=IMAGE*, сортирует по sortOrder
// audioGuideUrl: getAudioUrl(point.media)  ← ищет type=AUDIO*

mapRouteStopFromApiPoint(point, index, locale): RouteStop
// ApiExcursionPoint → RouteStop
// shortDescription: point.shortDescription ?? ''
// imageUrl: ''  (нет медиа в PointShortItem)
// audio.url: null  (нет медиа, нужен отдельный GET /points/{id})

mapExcursionFromShort(exc): Excursion
// ApiExcursionShort → Excursion
// tagline: exc.shortDescription ?? ''
// durationMinutes: exc.durationMin ?? 60
// distanceKm: (exc.distance ?? 0) / 1000  ← конвертируем метры в км
// theme: inferTheme(title, description)  ← угадываем по ключевым словам
// coverImageUrl: ''  ← пока пустой (бэк не отдаёт)
// difficulty: 'easy'  ← заглушка

mapExcursionFromDetail(exc, locale): Excursion
// то же что выше + парсит stops из exc.points.points[]
// startLabel: stops[0].title
// finishLabel: stops[stops.length-1].title

mapCategoryName(name: string): PointCategory
// "Музей" | "museum" | "gallery" → 'museum'
// "Ресторан" | "cafe" | "food" → 'food'
// "Парк" | "природа" | "nature" → 'park'
// "Развлечения" | "театр" | "cinema" → 'entertainment'
// всё остальное → 'landmark'

haversineDistance(lat1, lng1, lat2, lng2): number
// Вычисляет расстояние в метрах между двумя точками по сферической формуле
```

---

## 9. Типы данных

### `src/entities/excursion/model/types.ts`

```typescript
// Фронтовый тип точки интереса (с дистанцией)
NearbyPoint {
  id: string             // String(backendId)
  title: string
  category: PointCategory
  shortDescription: string
  description: string
  coordinates: GeoPoint  // { lat, lng }
  imageUrl: string
  expectedVisitMinutes: number
  rating: number         // всегда 0 (бэк не отдаёт пока)
  scheduleLabel: string  // workingHours
  distanceMeters: number
  addressLabel?: string
  audioGuideUrl: string | null
}

// Фронтовый тип остановки маршрута
RouteStop {
  id: string
  order: number
  title: string
  category: PointCategory
  shortDescription: string
  description: string
  coordinates: GeoPoint
  imageUrl: string
  expectedVisitMinutes: number
  rating: number
  scheduleLabel: string
  audio: AudioStory
}

AudioStory {
  id: string
  hasAudioGuide: boolean
  audioGuideUrl: string | null
  audioDuration: number        // секунды
  audioLanguage: SupportedLocale
  url: string | null           // то же что audioGuideUrl
  durationSeconds: number
  language: SupportedLocale
  transcriptPreview: string    // пока всегда ''
}

// Фронтовый тип маршрута/экскурсии
Excursion {
  id: number
  slug: string           // формат: "excursion-{id}"
  createdAt: string      // ISO 8601 (заглушка: new Date().toISOString())
  title: string
  tagline: string        // = shortDescription
  description: string
  theme: ExcursionTheme  // 'walk' | 'food' | 'nature' | 'fun' | 'mixed'
  district: string       // пока '' (бэк не отдаёт)
  durationMinutes: number
  distanceKm: number
  startLabel: string     // title первой остановки
  finishLabel: string    // title последней остановки
  coverImageUrl: string  // пока '' (бэк не отдаёт)
  routeColor: string     // '#0f766e'
  difficulty: ExcursionDifficulty   // пока всегда 'easy'
  audienceLabel: string  // пока всегда 'Все'
  stops: RouteStop[]
}
```

---

## 10. Контекст пользовательских маршрутов

### `src/features/user-routes/model/UserRoutesProvider.tsx`

**Хранит:**

```typescript
draftStops: RouteStop[]     // черновик (макс 6 остановок)
savedRoutes: Excursion[]    // избранные маршруты
personalRoutes: Excursion[] // созданные пользователем
```

**Ключ localStorage:** `t-guide:user-routes:{userId}`
(при смене пользователя весь контекст пересоздаётся)

**Методы:**

```typescript
addPointToDraft(point: NearbyPoint): void
// Конвертирует NearbyPoint → RouteStop, добавляет в draftStops
// Ничего не делает если уже 6 остановок или точка уже добавлена

removeDraftStop(stopId: string): void
// Удаляет остановку, пересчитывает order

clearDraftRoute(): void
// Очищает весь черновик

saveDraftRoute(): SaveDraftRouteResult
// Создаёт Excursion из draftStops:
//   - distance: сумма расстояний между точками (Haversine)
//   - duration: 8 мин базово + 12 мин/км + сумма visitTime
//   - difficulty: easy (<3 точек) | medium (3-4) | hard (>4)
//   - theme: 'mixed'
//   - slug: 'custom-route-{uuid}'
// → вызывает appApi.createPersonalRoute({ route })
// → добавляет в personalRoutes

toggleSavedRoute(route: Excursion): void
// Если маршрут уже в savedRoutes → removeSavedRoute
// Иначе → appApi.saveRoute({ route })

isPointInDraft(pointId: string): boolean
isRouteSaved(slug: string): boolean
```

### `src/features/user-routes/model/useUserRoutes.ts`

```typescript
export function useUserRoutes(): UserRoutesContextValue;
// Бросает ошибку если вне UserRoutesProvider
```

---

## 11. Хуки

### `useDiscoveryRoutes` — `src/entities/excursion/model/useDiscoveryRoutes.ts`

```typescript
function useDiscoveryRoutes(params: {
    activePointCategory: PointCategory | "all";
    center: GeoPoint;
    enabled?: boolean; // default: true
    locale: SupportedLocale;
    radiusMeters: number;
    search?: string;
}): {
    error: string | null;
    excursions: Excursion[];
    isLoading: boolean;
    nearbyPoints: NearbyPoint[];
};
```

**Как работает:**

1. При изменении любого параметра — запускает таймер 300ms (debounce)
2. После 300ms вызывает `appApi.getDiscoveryFeed(params)`
3. `getDiscoveryFeed` параллельно делает:
    - `POST /points/search` (с `categorySlugs`)
    - `POST /excursions/search` (без категорий)
4. Результат маппится и кладётся в `nearbyPoints` + `excursions`
5. При новом запросе до завершения предыдущего — предыдущий игнорируется (`isActive` флаг)

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

### `useUserGeolocation` — `src/features/route-map/model/useUserGeolocation.ts`

```typescript
function useUserGeolocation(): {
    error: string | null;
    requestLocation: () => void;
    status: "idle" | "loading" | "tracking" | "blocked" | "unsupported";
    userPosition: GeoPoint | null;
};
```

Использует `navigator.geolocation.watchPosition()` для непрерывного отслеживания.

### `useProfileOverview` — `src/shared/api/useProfileOverview.ts`

```typescript
function useProfileOverview(enabled: boolean): {
    error: string | null;
    isLoading: boolean;
    overview: ProfileOverviewDto | null;
};
```

Параллельно загружает: `/profile` + `/excursions/my` + `/excursions/favorites`.
Используется только на ProfilePage, только для авторизованных.

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

### `src/features/route-map/ui/DiscoveryMap.tsx`

**Props:**

```typescript
{
  activeCategory: PointCategory | 'all'
  nearbyPoints: NearbyPoint[]
  selectedPointId: string
  userPosition: GeoPoint | null
  radiusMeters: number
  draftStops?: RouteStop[]          // черновик маршрута
  onSelectPoint(id: string): void
  onSelectCategory(cat): void
  onChangeRadius(meters: number): void
  onLocateUser(): void
  onBuildRoute(): void
  onAddPointToDraft?(point: NearbyPoint): void
  onClearDraftRoute?(): void
  onSaveDraftRoute?(): void
}
```

### `src/features/route-map/lib/leaflet-map.ts`

Низкоуровневые функции для работы с Leaflet:

```typescript
createLeafletMap(container, options); // создаёт L.Map
createUserIcon(); // маркер синего цвета (позиция юзера)
createPoiIcon(category, isSelected); // маркер POI с иконкой категории
createDiscoveryRadiusCircle(map, center, radiusMeters); // круг поиска
createGuidePolyline(map, points, color); // линия маршрута
```

### `src/features/route-map/lib/route-geometry.ts`

```typescript
getDistanceMetersBetween(p1: GeoPoint, p2: GeoPoint): number
buildOsmWalkingRouteGeometryFromPoints(stops): Promise<Geometry>
getBoundsFromPoints(points): LatLngBounds
formatMeters(meters: number): string  // "150 м" или "1.2 км"
```

**Центр карты по умолчанию** (`src/shared/config/map.ts`):

```typescript
defaultCenter: { lat: 55.751244, lng: 37.618423 }  // Москва
defaultZoom: 14
discoveryRadiusMeters: 1200
```

---

## 13. Виджеты

### `src/widgets/excursion-catalog/ui/ExcursionCatalog.tsx`

```typescript
Props {
  excursions: Excursion[]
  emptyTitle?: string           // default: 'Маршруты пока не найдены'
  emptyDescription?: string
  isError?: boolean             // default: false
}
```

- Рендерит сетку карточек `ExcursionCard`
- При `excursions.length === 0 && !isError` → пустое состояние с текстом
- При `isError === true` → ошибочное состояние с красной рамкой

### `src/widgets/route-overview/ui/RouteOverview.tsx`

Объединяет `RouteMap` (карта) + `RouteStopList` (список остановок).
Используется на странице ExcursionPage.

---

## 14. Утилиты

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

formatPointCategory(category: PointCategory): string
// 'museum' → "Музей", 'food' → "Еда", 'park' → "Природа"
// 'entertainment' → "Развлечения", 'landmark' → "История"

formatTheme(theme: ExcursionTheme): string
// 'walk' → "Прогулка", 'food' → "Еда", 'nature' → "Природа"
// 'fun' → "Развлечения", 'mixed' → "Разное"

formatDifficulty(difficulty: ExcursionDifficulty): string
// 'easy' → "Легко", 'medium' → "Средне", 'hard' → "Насыщенно"

formatLocaleLabel(locale: SupportedLocale): string
// 'ru' → "Русский", 'en' → "English", 'de' → "Deutsch"
// 'fr' → "Français", 'es' → "Español"
```

### `src/shared/lib/discovery-context.ts`

```typescript
interface DiscoveryContext {
  activePointCategory: PointCategory | 'all'
  center: GeoPoint
  locale: SupportedLocale
  radiusMeters: number
}

getDefaultDiscoveryContext(): DiscoveryContext
// { center: Москва, radiusMeters: 1200, locale: 'ru', category: 'all' }

getStoredDiscoveryContext(): DiscoveryContext
// Читает из sessionStorage['t-guide:discovery-context']
// При ошибке возвращает default

saveDiscoveryContext(ctx: DiscoveryContext): void
// Записывает в sessionStorage

detectSupportedLocale(candidate?: string): SupportedLocale
// 'ru-RU' → 'ru', 'de-DE' → 'de', всё остальное → 'ru'
```

---

## 15. CSS

### Переменные — `src/app/styles/tokens.css`

```css
/* Цвета */
--color-bg: #f4f6fb --color-bg-elevated: #ffffff --color-bg-soft: #f7f8fc
    --color-text: #1f2533 --color-text-secondary: #5d6679 --color-line: #e6e9f0
    --color-brand: #1f8a70 /* основной зелёный */ --color-brand-strong: #0f766e
    --color-brand-soft: #e8faf4 --color-accent: #ffdd2d /* жёлтый T-банка */
    --color-accent-strong: #fcc521 --color-danger: #c2514b /* Скругления */
    --radius-pill: 999px --radius-2xl: 32px --radius-xl: 28px --radius-lg: 22px
    --radius-md: 16px /* Тени */ --shadow-card: 0 8px 24px
    rgba(31, 37, 51, 0.07) --shadow-pill: 0 4px 12px rgba(31, 37, 51, 0.1);
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
.chip                /* маленький бейдж */
.chip--accent        /* зелёный */

/* Фильтры */
.filter-pill         /* кнопка-таблетка */
.filter-pill--active /* активное состояние */

/* Поля формы */
.field               /* обёртка: label + input */
.field__label
.field__input        /* с focus-ring */

/* Карточки состояний */
.status-card         /* центрированная карточка с анимацией появления */
.status-card--error  /* красная рамка */

/* Секции */
.section-surface     /* белый блок с тенью */
.section-title
.page-title
.eyebrow             /* маленькая заглавная метка */
```

---

## 16. Хранилища

| Ключ                           | Тип хранилища  | Что хранит                                    |
| ------------------------------ | -------------- | --------------------------------------------- |
| `t-guide:auth:tokens`          | localStorage   | `{ accessToken, refreshToken }`               |
| `t-guide:user-routes:{userId}` | localStorage   | `{ draftStops, savedRoutes, personalRoutes }` |
| `t-guide:discovery-context`    | sessionStorage | `{ center, radiusMeters, category, locale }`  |

---

## 17. Переменные окружения

Файл: `.env.local` (не коммитится в git)

```env
VITE_API_URL=https://tguide.enzolu.ru/api
VITE_USE_MOCK_API=false
```

Если `VITE_USE_MOCK_API=false` и `VITE_API_URL` задан → используется реальный бэк.
Иначе → `mockApi` (статические тестовые данные из `src/shared/api/mock/`).

---

## 18. Потоки данных

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
  → nearbyPoints + excursions → рендер карточек и маркеров на карте
```

### Смена категории фильтра

```
Пользователь нажимает "Музеи"
  → setActivePointCategory('museum')
  → useDiscoveryRoutes получает новый параметр
  → debounce 300ms
  → appApi.getDiscoveryFeed({ category: 'museum' })
  → POST /points/search { categorySlugs: ['museum'] }
  → новые nearbyPoints → карточки "Музеи" + секция меняется без перемонтирования
    (opacity transition пока грузится)
```

### Вход в систему

```
Пользователь вводит email + пароль → нажимает "Войти"
  → useAuth().signIn({ login: email, password })
  → authService.login()
  → POST /auth/login { username: email, password }
  → { tokens: { accessToken, refreshToken }, user: {...} }
  → writeAuthTokens(tokens) → localStorage['t-guide:auth:tokens']
  → session обновляется в AuthProvider
  → ProtectedRoute разблокирует все защищённые роуты
  → редирект на '/' или на страницу откуда пришли
```

### Добавление точки в черновик маршрута

```
Пользователь кликает "Добавить в маршрут" на карточке точки
  → useUserRoutes().addPointToDraft(point: NearbyPoint)
  → NearbyPoint конвертируется в RouteStop
  → draftStops.push(stop) [max 6]
  → UserRoutesProvider сохраняет в localStorage
  → DiscoveryMap показывает точку с отметкой
  → Шторка показывает кнопку "Сохранить маршрут"
```

### Сохранение маршрута

```
Пользователь нажимает "Сохранить маршрут"
  → useUserRoutes().saveDraftRoute()
  → вычисляет distanceKm, durationMinutes, difficulty из stops
  → appApi.createPersonalRoute({ route })
  → POST /excursions { title, description, points: [{pointId, order}] }
  → response: ExcursionDetailResponse
  → mapExcursionFromDetail(response)
  → personalRoutes.push(excursion)
  → маршрут появляется в ProfilePage
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

## 19. Известные проблемы

| Проблема                                          | Статус                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `POST /excursions/search` → 500                   | Ошибка на бэке, запрос правильный                                   |
| `GET /profile` → 401 после логина                 | Возможно бэк не принимает свои же токены                            |
| `GET /excursions/my` и `/favorites` без пагинации | Бэк добавит `?page=0&size=25`                                       |
| `coverImageUrl` у маршрутов всегда пустой         | Ждём от бэка или будем брать из первой точки                        |
| `rating` у точек всегда 0                         | Ждём эндпоинт отзывов (обсуждение на созвоне)                       |
| `difficulty` маршрута всегда `'easy'`             | Бэк не присылает, заглушка                                          |
| Аудиогид у остановок маршрута всегда null         | `PointShortItem` не имеет медиа, нужен отдельный `GET /points/{id}` |

---

_Последнее обновление: 2026-05-04_
