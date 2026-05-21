import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Link } from "react-router-dom";

import type {
    ExcursionTheme,
    NearbyPoint,
    PointCategory,
    RouteStop,
    SupportedLocale,
} from "@/entities/excursion/model/types";
import { useDiscoveryRoutes } from "@/entities/excursion/model/useDiscoveryRoutes";
import { usePointDetail } from "@/entities/excursion/model/usePointDetail";
import { usePointDetailsMap } from "@/entities/excursion/model/usePointDetailsMap";
import { formatMeters } from "@/features/route-map/lib/route-geometry";
import { useUserGeolocation } from "@/features/route-map/model/useUserGeolocation";
import type { DiscoveryCategoryOption } from "@/features/route-map/ui/DiscoveryMap";
import { DiscoveryMap } from "@/features/route-map/ui/DiscoveryMap";
import { useAuth } from "@/app/providers/useAuth";
import { useUserRoutes } from "@/features/user-routes/model/useUserRoutes";
import { useCategories } from "@/shared/api/categoriesStore";
import type { ApiCategory } from "@/shared/api/mappers";
import { appMapConfig } from "@/shared/config/map";
import { appRoutes } from "@/shared/config/routes";
import { clampDiscoveryRadius } from "@/shared/lib/discovery-radius";
import {
    detectSupportedLocale,
    getStoredDiscoveryContext,
    saveDiscoveryContext,
} from "@/shared/lib/discovery-context";
import { useManualPosition } from "@/shared/lib/ManualPositionContext";
import { useRadiusLock } from "@/shared/lib/useRadiusLock";
import {
    formatDuration,
    formatTheme,
    getPointCategoryLabel,
} from "@/shared/lib/format";
import { matchesExcursionThemeFilter } from "@/shared/lib/excursion-theme";
import { CATEGORY_SVG, getCategorySvg } from "@/shared/lib/category-icon-svg";
import { SmartPlaceImage } from "@/shared/ui/SmartPlaceImage";
import { FooterFeatureIcon } from "@/shared/ui/FooterFeatureIcon";
import { ExcursionCatalog } from "@/widgets/excursion-catalog/ui/ExcursionCatalog";
import "./HomePage.css";

const CLOSED_HEIGHT = 52; // drag handle bar only
const DRAG_MIN = 10;

type SheetState = "closed" | "peek" | "preview" | "full";

function getSnapTranslate(
    state: SheetState,
    sheetHeight: number,
    peekHeight: number,
    previewHeight: number = 400,
): number {
    if (state === "full") return DRAG_MIN;
    if (state === "preview") return Math.max(DRAG_MIN, sheetHeight - previewHeight);
    if (state === "peek") return Math.max(DRAG_MIN, sheetHeight - peekHeight);
    return Math.max(DRAG_MIN, sheetHeight - CLOSED_HEIGHT);
}

function getSheetTranslateY(el: HTMLElement): number {
    const t = window.getComputedStyle(el).transform;
    if (!t || t === "none") return 0;
    const m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return 0;
    return parseFloat(m[1].split(",")[5] ?? "0");
}

function snapSheet(
    sheet: HTMLElement,
    toY: number,
    durationMs: number,
    easing = "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
): void {
    const fromY = getSheetTranslateY(sheet);
    sheet.style.willChange = "transform";
    sheet.style.transition = "none";
    sheet.style.transform = `translateY(${fromY}px)`;
    void sheet.offsetHeight;
    sheet.style.transition = `transform ${durationMs}ms ${easing}`;
    sheet.style.transform = `translateY(${toY}px)`;
    const clear = () => {
        sheet.style.willChange = "";
    };
    sheet.addEventListener("transitionend", clear, { once: true });
    setTimeout(clear, durationMs + 100);
}

const categoryIcons: Record<string, string> = CATEGORY_SVG

function pickCategoryIcon(slug: string | undefined, name: string | undefined): string {
    if (slug && categoryIcons[slug]) return categoryIcons[slug]
    const text = `${slug ?? ''} ${name ?? ''}`.toLowerCase()
    if (/музе|museum|gallery|галер/.test(text)) return CATEGORY_SVG.museum
    if (/ресторан|кафе|еда|food|restaurant|cafe/.test(text)) return CATEGORY_SVG.food
    if (/парк|сад|приро|park|garden|nature/.test(text)) return CATEGORY_SVG.park
    if (/развле|театр|кино|entert|theat|cinema|fun/.test(text)) return CATEGORY_SVG.entertainment
    if (/истор|достоприм|памят|history|landmark|monument/.test(text)) return CATEGORY_SVG.landmark
    return getCategorySvg('landmark')
}

const routeThemeOptions: Array<ExcursionTheme | "all"> = [
    "all",
    "walk",
    "food",
    "nature",
    "fun",
    "mixed",
];

const durationOptions = [30, 45, 60, 90, 120];

export function HomePage() {
    const { session } = useAuth();
    const {
        addPointToDraft,
        clearDraftRoute,
        draftStops,

        saveDraftRoute,
    } = useUserRoutes();

    const storedContext = useMemo(() => getStoredDiscoveryContext(), []);
    const detectedLocale = useMemo(() => {
        if (typeof window === "undefined") return storedContext.locale;
        return detectSupportedLocale(
            navigator.languages?.[0] ??
                navigator.language ??
                storedContext.browserLocale,
        );
    }, [storedContext.browserLocale, storedContext.locale]);

    const [audioLocale] = useState<SupportedLocale>(
        storedContext.locale ?? detectedLocale,
    );
    // Category filter accepts backend categoryId (number) or 'all'.
    // Legacy frontend slugs from older sessions auto-convert to 'all' below.
    const [activePointCategory, setActivePointCategory] = useState<
        PointCategory | "all" | number
    >(() => {
        const stored = storedContext.activePointCategory
        return stored ?? "all"
    });

    // Load backend categories — used for tabs and slug→icon mapping.
    const { categories: backendCategories } = useCategories();

    // Build category tabs dynamically from backend. "Все" is always first.
    const nearbyCategoryOptions = useMemo<DiscoveryCategoryOption[]>(() => {
        return [
            { id: "all" as const, label: "Все" },
            ...backendCategories.map((c: ApiCategory) => ({
                id: c.id,
                label: c.name,
            })),
        ];
    }, [backendCategories]);

    // Precompute tab icon Map so rendering each button is a O(1) Map.get()
    // instead of a O(n) backendCategories.find() per button per render.
    const tabIconMap = useMemo<Map<PointCategory | "all" | number, string>>(() => {
        const m = new Map<PointCategory | "all" | number, string>();
        m.set("all", categoryIcons.all);
        for (const c of backendCategories) {
            m.set(c.id, pickCategoryIcon(c.slug, c.name));
        }
        return m;
    }, [backendCategories]);

    // If the stored category slug is stale (no longer a valid frontend enum
    // value AND not a backend id), drop it to 'all' or pick a matching id.
    useEffect(() => {
        if (
            typeof activePointCategory === "string" &&
            activePointCategory !== "all"
        ) {
            if (backendCategories.length === 0) return;
            const match = backendCategories.find(
                (c: ApiCategory) =>
                    c.slug === activePointCategory ||
                    pickCategoryIcon(c.slug, c.name) ===
                        categoryIcons[activePointCategory],
            );
            setActivePointCategory(match ? match.id : "all");
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [backendCategories]);
    const [radiusMeters, setRadiusMeters] = useState<number>(
        clampDiscoveryRadius(
            storedContext.radiusMeters ?? appMapConfig.defaultDiscoveryRadiusMeters,
        ),
    );
    const [debouncedRadiusMeters, setDebouncedRadiusMeters] =
        useState<number>(radiusMeters);
    const [activeRouteTheme, setActiveRouteTheme] = useState<
        ExcursionTheme | "all"
    >("all");
    const [maxRouteDuration, setMaxRouteDuration] = useState<number | null>(
        null,
    );
    const [selectedPointId, setSelectedPointId] = useState<string>("");
    const [panOnlyId, setPanOnlyId] = useState<string>("");
    const [routeTargetId, setRouteTargetId] = useState<string | null>(null);
    const [savedDraftPreviewStops, setSavedDraftPreviewStops] = useState<
        RouteStop[]
    >([]);
    const [draftRouteNotice, setDraftRouteNoticeValue] = useState<
        string | null
    >(null);
    const [draftRouteNoticeKey, setDraftRouteNoticeKey] = useState(0);
    const [draftRouteNoticeTone, setDraftRouteNoticeTone] = useState<
        "success" | "warning"
    >("success");
    const [recenterTrigger, setRecenterTrigger] = useState(0);

    // Tracks the last dismissed geolocation error string. The banner re-appears
    // if a different error arrives, but stays dismissed for the current one.
    const [dismissedGeoError, setDismissedGeoError] = useState<string | null>(null);

    // Tracks whether data has ever arrived; set during render so it's instant.
    const hasHadDataRef = useRef(false);
    // Fallback: show empty state after 3 s even if no data arrived yet.
    const [emptyAllowedByTimeout, setEmptyAllowedByTimeout] = useState(false);

    const nearbyListRef = useRef<HTMLDivElement | null>(null);
    const shouldScrollNearbyListRef = useRef(false);
    const nearbyScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const nearbyScrollRafRef = useRef<number | null>(null);
    const nearbyScrollDirRef = useRef<0 | 1 | -1>(0);
    const nearbyScrollIsHoldRef = useRef(false);
    const isAuthenticated = Boolean(
        session?.isAuthenticated && session.profile,
    );

    useEffect(() => {
        document.body.classList.add("app-body--home-page");
        return () => document.body.classList.remove("app-body--home-page");
    }, []);

    useEffect(() => {
        return () => {
            if (nearbyScrollTimerRef.current !== null) clearTimeout(nearbyScrollTimerRef.current);
            if (nearbyScrollRafRef.current !== null) cancelAnimationFrame(nearbyScrollRafRef.current);
        };
    }, []);

    const nearbyScrollDown = useCallback((dir: 1 | -1) => {
        nearbyScrollDirRef.current = dir;
        nearbyScrollIsHoldRef.current = false;
        nearbyScrollTimerRef.current = setTimeout(() => {
            nearbyScrollIsHoldRef.current = true;
            const el = nearbyListRef.current;
            if (!el) return;
            const tick = () => {
                if (nearbyScrollDirRef.current === 0) return;
                el.scrollLeft += nearbyScrollDirRef.current * 5;
                nearbyScrollRafRef.current = requestAnimationFrame(tick);
            };
            nearbyScrollRafRef.current = requestAnimationFrame(tick);
        }, 300);
    }, []);

    const nearbyScrollUp = useCallback(() => {
        const dir = nearbyScrollDirRef.current;
        nearbyScrollDirRef.current = 0;
        if (nearbyScrollTimerRef.current !== null) {
            clearTimeout(nearbyScrollTimerRef.current);
            nearbyScrollTimerRef.current = null;
        }
        if (nearbyScrollRafRef.current !== null) {
            cancelAnimationFrame(nearbyScrollRafRef.current);
            nearbyScrollRafRef.current = null;
        }
        if (!nearbyScrollIsHoldRef.current && dir !== 0) {
            const el = nearbyListRef.current;
            if (el) el.scrollBy({ left: dir * 480, behavior: "smooth" });
        }
    }, []);

    const {
        error: geolocationError,
        requestLocation,
        status: geolocationStatus,
        userPosition,
    } = useUserGeolocation();

    const {
        isOverrideActive,
        manualPosition,
        mode: overrideMode,
        setManualPosition,
        toggleOverride,
    } = useManualPosition();
    const { isLocked: isRadiusLocked, toggle: toggleRadiusLock } = useRadiusLock();

    const effectiveUserPosition = isOverrideActive ? manualPosition : userPosition;
    const currentCenter = effectiveUserPosition ?? storedContext.center;
    const canLoadNearbyPlaces =
        Boolean(userPosition) ||
        geolocationStatus === "blocked" ||
        geolocationStatus === "unsupported";

    // Debounce radius changes — avoids triggering an API request and full
    // marker re-render on every pixel of slider/zoom movement.
    useEffect(() => {
        const timerId = window.setTimeout(() => {
            setDebouncedRadiusMeters(radiusMeters);
        }, 600);
        return () => window.clearTimeout(timerId);
    }, [radiusMeters]);

    const {
        error: discoveryError,
        excursions,
        isLoading,
        nearbyPoints,
    } = useDiscoveryRoutes({
        activePointCategory,
        center: currentCenter,
        enabled: canLoadNearbyPlaces,
        locale: audioLocale,
        radiusMeters: debouncedRadiusMeters,
        search: "",
    });

    // Search results carry no photos — backfill them from /points/{id} so the
    // "Рядом с вами" cards show real uploaded images instead of placeholders.
    const nearbyPointIds = useMemo(
        () => nearbyPoints.map((point) => point.id),
        [nearbyPoints],
    );
    const pointDetailsMap = usePointDetailsMap(nearbyPointIds);

    useEffect(() => {
        saveDiscoveryContext({
            activePointCategory,
            center: currentCenter,
            locale: audioLocale,
            browserLocale:
                typeof window === "undefined"
                    ? storedContext.browserLocale
                    : (navigator.languages?.[0] ??
                      navigator.language ??
                      storedContext.browserLocale),
            radiusMeters,
            updatedAt: new Date().toISOString(),
        });
    }, [
        activePointCategory,
        audioLocale,
        currentCenter,
        radiusMeters,
        storedContext.browserLocale,
    ]);

    // Once data arrives, latch the ref so canShowEmpty flips true immediately.
    // The ref is set during render (not in an effect) to avoid the
    // react-hooks/set-state-in-effect lint rule.
    if (!hasHadDataRef.current && (nearbyPoints.length > 0 || excursions.length > 0)) {
        hasHadDataRef.current = true;
    }
    // canShowEmpty is true once we've ever seen data OR after the 3-s timeout.
    const canShowEmpty = hasHadDataRef.current || emptyAllowedByTimeout;

    // Start a 3-s timer on first render. If data arrives first, hasHadDataRef
    // flips to true during render and canShowEmpty becomes true instantly.
    useEffect(() => {
        if (hasHadDataRef.current || emptyAllowedByTimeout) return;
        const id = setTimeout(() => setEmptyAllowedByTimeout(true), 3000);
        return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keep the selected state when the point is pinned outside the API radius
    // (either as the current route target or via draftStops).
    const effectiveSelectedPointId =
        selectedPointId &&
        (nearbyPoints.some((p) => p.id === selectedPointId) ||
            selectedPointId === routeTargetId ||
            draftStops.some((s) => s.id.replace(/-draft-stop(?:-\d+)?$/, '') === selectedPointId))
            ? selectedPointId
            : "";
    const selectedPointFallback = effectiveSelectedPointId
        ? (nearbyPoints.find((p) => p.id === effectiveSelectedPointId) ?? null)
        : null;
    // Fetches /points/{id} once per selection — gives us full description,
    // address and media (photo/audio) which /points/search omits.
    const selectedPoint = usePointDetail(
        effectiveSelectedPointId || null,
        selectedPointFallback,
        currentCenter.lat,
        currentCenter.lng,
    );
    // displayedPoint: holds the card data to render, including during leave animation.
    const [displayedPoint, setDisplayedPoint] = useState<typeof selectedPoint>(null);
    const [isPlaceLeaving, setIsPlaceLeaving] = useState(false);
    const placeLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const effectiveRouteTargetId = routeTargetId;
    const visibleRoutes = useMemo(
        () =>
            excursions.filter((e) => {
                const matchesDuration =
                    maxRouteDuration === null ||
                    e.durationMinutes <= maxRouteDuration;
                return (
                    matchesExcursionThemeFilter(e, activeRouteTheme) &&
                    matchesDuration
                );
            }),
        [activeRouteTheme, excursions, maxRouteDuration],
    );

    useEffect(() => {
        if (!shouldScrollNearbyListRef.current) return;
        const list = nearbyListRef.current;
        if (!list || !effectiveSelectedPointId) return;
        const card = list.querySelector<HTMLElement>(
            `[data-point-id="${effectiveSelectedPointId}"]`,
        );
        if (card) scrollIntoHorizontalView(list, card);
        shouldScrollNearbyListRef.current = false;
    }, [effectiveSelectedPointId]);

    useEffect(() => {
        if (!draftRouteNotice) return;
        const id = window.setTimeout(
            () => setDraftRouteNoticeValue(null),
            3200,
        );
        return () => window.clearTimeout(id);
    }, [draftRouteNotice, draftRouteNoticeKey]);

    // Enable mouse drag-to-scroll on the nearby cards strip
    useEffect(() => {
        const el = nearbyListRef.current;
        if (!el) return;
        let isDown = false;
        let startX = 0;
        let scrollLeft = 0;
        let hasDragged = false;

        const onMouseDown = (e: MouseEvent) => {
            isDown = true;
            hasDragged = false;
            startX = e.pageX - el.offsetLeft;
            scrollLeft = el.scrollLeft;
            el.style.cursor = "grabbing";
        };
        const onMouseLeave = () => {
            isDown = false;
            el.style.cursor = "";
        };
        const onMouseUp = () => {
            isDown = false;
            el.style.cursor = "";
        };
        const onMouseMove = (e: MouseEvent) => {
            if (!isDown) return;
            const x = e.pageX - el.offsetLeft;
            const walk = (x - startX) * 1.4;
            if (Math.abs(walk) > 4) {
                hasDragged = true;
                e.preventDefault();
            }
            el.scrollLeft = scrollLeft - walk;
        };
        // Prevent click on child if we actually dragged
        const onClickCapture = (e: MouseEvent) => {
            if (hasDragged) e.stopPropagation();
        };

        el.addEventListener("mousedown", onMouseDown);
        el.addEventListener("mouseleave", onMouseLeave);
        el.addEventListener("mouseup", onMouseUp);
        el.addEventListener("mousemove", onMouseMove);
        el.addEventListener("click", onClickCapture, true);
        return () => {
            el.removeEventListener("mousedown", onMouseDown);
            el.removeEventListener("mouseleave", onMouseLeave);
            el.removeEventListener("mouseup", onMouseUp);
            el.removeEventListener("mousemove", onMouseMove);
            el.removeEventListener("click", onClickCapture, true);
        };
    }, []);

    const setDraftRouteNotice = useCallback((message: string | null) => {
        if (!message) {
            setDraftRouteNoticeValue(null);
            return;
        }
        setDraftRouteNoticeTone(
            message.toLowerCase().includes("уже") ? "warning" : "success",
        );
        setDraftRouteNoticeKey((n) => n + 1);
        setDraftRouteNoticeValue(message);
    }, []);

    const handleBuildRoute = useCallback(
        (pointId: string) => {
            setSelectedPointId(pointId);
            setRouteTargetId(pointId);
            if (!userPosition) requestLocation();
        },
        [requestLocation, userPosition],
    );

    const handleAddPointToRoute = useCallback(
        (point: NearbyPoint) => {
            addPointToDraft(point);
            setDraftRouteNotice(null);
            setSavedDraftPreviewStops([]);
            setSelectedPointId(point.id);
            setRouteTargetId(point.id);
            if (!userPosition) requestLocation();
        },
        [addPointToDraft, requestLocation, setDraftRouteNotice, userPosition],
    );

    const handleClearDraftRoute = useCallback(() => {
        clearDraftRoute();
        setDraftRouteNotice(null);
        setSavedDraftPreviewStops([]);
        setRouteTargetId(null);
    }, [clearDraftRoute, setDraftRouteNotice]);

    const handleSaveDraftRoute = useCallback(() => {
        const result = saveDraftRoute();
        if (result.status === "duplicate") {
            setDraftRouteNotice("Такой маршрут уже сохранен.");
            return;
        }
        if (result.status !== "saved" || !result.route) return;
        setDraftRouteNotice("Маршрут сохранен в профиле.");
        setSavedDraftPreviewStops(result.route.stops);
        clearDraftRoute();
        setRouteTargetId(null);
    }, [clearDraftRoute, saveDraftRoute, setDraftRouteNotice]);

    const handleCenterUser = useCallback(() => {
        // Use the effective position (manual or GPS) — if neither is set, ask for GPS.
        if (!effectiveUserPosition) {
            requestLocation();
            return;
        }
        setRecenterTrigger((n) => n + 1);
    }, [effectiveUserPosition, requestLocation]);

    const handleNearbyCardClick = useCallback((pointId: string) => {
        selectionFromMapRef.current = false;
        const isDeselecting = selectedPointIdRef.current === pointId;
        setSelectedPointId((prev) => {
            if (prev === pointId) return "";
            shouldScrollNearbyListRef.current = true;
            return pointId;
        });
        if (!isDeselecting) {
            setPanOnlyId(pointId);
        }
    }, []);

    const handleMapPointSelect = useCallback((pointId: string) => {
        selectionFromMapRef.current = true;
        shouldScrollNearbyListRef.current = true;
        setSelectedPointId(pointId);
    }, []);

    const handleMapClick = useCallback((coords: { lat: number; lng: number }) => {
        if (overrideMode === 'waiting') {
            setManualPosition(coords);
        }
    }, [overrideMode, setManualPosition]);

    const cycleSelectedPoint = useCallback(
        (direction: 1 | -1) => {
            if (!nearbyPoints.length) return;
            const currentIndex = nearbyPoints.findIndex(
                (p) => p.id === effectiveSelectedPointId,
            );
            const safeIndex = currentIndex >= 0 ? currentIndex : 0;
            const nextIndex =
                (safeIndex + direction + nearbyPoints.length) %
                nearbyPoints.length;
            shouldScrollNearbyListRef.current = true;
            setSelectedPointId(nearbyPoints[nextIndex].id);
        },
        [effectiveSelectedPointId, nearbyPoints],
    );

    // Pre-bound directional cyclers — passing inline arrows
    // `() => cycleSelectedPoint(1)` would create new function refs every
    // render and trigger DiscoveryMap's marker effect cascade.
    const handleSelectNextPoint = useCallback(
        () => cycleSelectedPoint(1),
        [cycleSelectedPoint],
    );
    const handleSelectPreviousPoint = useCallback(
        () => cycleSelectedPoint(-1),
        [cycleSelectedPoint],
    );

    // ── Bottom sheet ────────────────────────────────────────────────────────────

    const [sheetState, setSheetState] = useState<SheetState>("closed");
    const sheetStateRef = useRef<SheetState>("closed");
    const sheetRef = useRef<HTMLDivElement>(null);
    const filterGroupRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const peekHeightRef = useRef(170); // fallback; measured by ResizeObserver
    const previewHeightRef = useRef(400); // fallback; measured via routesTitleRef
    const routesTitleRef = useRef<HTMLHeadingElement | null>(null);
    // Tracks selectedPointId for access inside stable useCallback (no dep change)
    const selectedPointIdRef = useRef("");
    // Prevents the sheetState useEffect from overriding a manually set transform
    const skipSnapRef = useRef(false);
    // ref to nearby section — used for height measurement when a card is open
    const nearbySectionRef = useRef<HTMLDivElement | null>(null);
    // Tracks last displayedPoint.id that triggered a height re-snap;
    // reset to "" when displayedPoint becomes null so re-selection works.
    const prevDisplayedPointIdRef = useRef<string>("");
    // True when the latest selection came from a map marker click — the sheet
    // should NOT auto-open in that case (popup already shows on the map).
    const selectionFromMapRef = useRef(false);

    const snapToPeek = useCallback(() => {
        const sheet = sheetRef.current;
        if (!sheet) return;
        const peekT = getSnapTranslate(
            "peek",
            sheet.offsetHeight,
            peekHeightRef.current,
        );
        if (bodyRef.current) bodyRef.current.scrollTop = 0;
        skipSnapRef.current = true;
        setSheetState("peek");
        snapSheet(sheet, peekT, 480);
    }, []);

    const snapToClosed = useCallback(() => {
        const sheet = sheetRef.current;
        if (!sheet) return;
        const closedT = sheet.offsetHeight - CLOSED_HEIGHT;
        skipSnapRef.current = true;
        setSheetState("closed");
        snapSheet(sheet, closedT, 480);
    }, []);

    const handleToggleOverride = useCallback(() => {
        if (overrideMode === 'off') snapToClosed();
        toggleOverride();
    }, [overrideMode, snapToClosed, toggleOverride]);

    const handleGoToPlace = useCallback(
        (point: NearbyPoint) => {
            setSelectedPointId(point.id);
            setRouteTargetId(point.id);
            if (!userPosition) requestLocation();
            snapToPeek();
        },
        [requestLocation, snapToPeek, userPosition],
    );

    // Close sheet when burger opens; close burger when sheet opens
    useEffect(() => {
        window.addEventListener("app-menu-open", snapToClosed);
        return () => window.removeEventListener("app-menu-open", snapToClosed);
    }, [snapToClosed]);

    useEffect(() => {
        if (sheetState !== "closed") {
            window.dispatchEvent(new CustomEvent("app-sheet-open"));
        }
    }, [sheetState]);
    const dragRef = useRef({
        active: false,
        startPointerY: 0,
        startTranslate: 0,
        lastPointerY: 0,
        lastTime: 0,
        velocity: 0,
    });

    useEffect(() => {
        sheetStateRef.current = sheetState;
    }, [sheetState]);

    // Apply snap transitions when state changes via keyboard (not drag)
    useEffect(() => {
        if (skipSnapRef.current) {
            skipSnapRef.current = false;
            return;
        }
        const sheet = sheetRef.current;
        if (!sheet || sheet.offsetHeight === 0) return;
        const target = getSnapTranslate(
            sheetState,
            sheet.offsetHeight,
            peekHeightRef.current,
            previewHeightRef.current,
        );
        if (sheetState !== "full" && bodyRef.current)
            bodyRef.current.scrollTop = 0;
        snapSheet(sheet, target, 480);
    }, [sheetState]);

    // Keep selectedPointIdRef in sync so measurePreviewHeight can read it
    // without being recreated on every selectedPointId change.
    useEffect(() => {
        selectedPointIdRef.current = selectedPointId;
    }, [selectedPointId]);

    // Measure preview height dynamically:
    // – no point selected  → bottom of "Готовые маршруты" h3 (normal preview)
    // – point selected     → bottom of "Рядом с вами" section (expanded preview)
    // Using getBCR requires scrollTop compensation because BCR is viewport-relative.
    const measurePreviewHeight = useCallback(() => {
        const sheet = sheetRef.current;
        if (!sheet) return;
        const scrollCompensation = bodyRef.current?.scrollTop ?? 0;
        if (selectedPointIdRef.current) {
            const section = nearbySectionRef.current;
            if (!section) return;
            const measured =
                section.getBoundingClientRect().bottom -
                sheet.getBoundingClientRect().top +
                scrollCompensation +
                16;
            if (measured > CLOSED_HEIGHT + 50) previewHeightRef.current = measured;
        } else {
            const title = routesTitleRef.current;
            if (!title) return;
            const measured =
                title.getBoundingClientRect().bottom -
                sheet.getBoundingClientRect().top +
                scrollCompensation +
                8;
            if (measured > CLOSED_HEIGHT + 50) previewHeightRef.current = measured;
        }
    }, []);

    useLayoutEffect(() => {
        const sheet = sheetRef.current;
        if (!sheet) return;

        const applyInitial = () => {
            if (sheet.offsetHeight > 0) {
                sheet.style.transition = "none";
                sheet.style.transform = `translateY(${sheet.offsetHeight - CLOSED_HEIGHT}px)`;
            }
        };
        applyInitial();

        const onResize = () => {
            if (dragRef.current.active) return;
            // Only re-measure when no card detail is open (same guard as measurePreviewHeight)
            if (!selectedPointIdRef.current) {
                const title = routesTitleRef.current;
                if (title) {
                    const scrollCompensation = bodyRef.current?.scrollTop ?? 0;
                    const measured =
                        title.getBoundingClientRect().bottom -
                        sheet.getBoundingClientRect().top +
                        scrollCompensation +
                        8;
                    if (measured > CLOSED_HEIGHT + 50) previewHeightRef.current = measured;
                }
            }
            const target = getSnapTranslate(
                sheetStateRef.current,
                sheet.offsetHeight,
                peekHeightRef.current,
                previewHeightRef.current,
            );
            sheet.style.transition = "none";
            sheet.style.transform = `translateY(${target}px)`;
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // Measure filter group height for dynamic peek snapping
    useEffect(() => {
        const el = filterGroupRef.current;
        if (!el) return;
        const update = () => {
            peekHeightRef.current = CLOSED_HEIGHT + el.offsetHeight;
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Re-measure + re-snap when nearby content changes (cards load/unload).
    useEffect(() => {
        const frameId = requestAnimationFrame(() => {
            measurePreviewHeight();
            if (sheetStateRef.current !== "preview") return;
            const sheet = sheetRef.current;
            if (!sheet || sheet.offsetHeight === 0) return;
            const target = getSnapTranslate(
                "preview",
                sheet.offsetHeight,
                peekHeightRef.current,
                previewHeightRef.current,
            );
            sheet.style.transition =
                "transform 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94)";
            sheet.style.transform = `translateY(${target}px)`;
        });
        return () => cancelAnimationFrame(frameId);
    }, [nearbyPoints, isLoading, canLoadNearbyPlaces, measurePreviewHeight]);

    // When the point is deselected: re-measure (no card now) and re-snap preview
    // after the card leave animation finishes (280ms + buffer).
    useEffect(() => {
        if (selectedPointId !== "") return;
        const timerId = setTimeout(() => requestAnimationFrame(() => {
            measurePreviewHeight(); // selectedPointIdRef is already "" → measures to routes title
            const sheet = sheetRef.current;
            if (!sheet || sheetStateRef.current !== "preview") return;
            const target = getSnapTranslate("preview", sheet.offsetHeight, peekHeightRef.current, previewHeightRef.current);
            snapSheet(sheet, target, 500, "cubic-bezier(0.4, 0, 0.2, 1)");
        }), 310);
        return () => clearTimeout(timerId);
    }, [selectedPointId, measurePreviewHeight]);

    // When displayedPoint changes (card appears or switches to a different point),
    // re-measure the expanded preview height and re-snap.
    // The card uses opacity+transform animation so its layout height is correct
    // immediately — no grid-template-rows timing issue.
    useEffect(() => {
        if (!displayedPoint) {
            prevDisplayedPointIdRef.current = "";
            return;
        }
        if (displayedPoint.id === prevDisplayedPointIdRef.current) return;
        prevDisplayedPointIdRef.current = displayedPoint.id;
        // Map marker click → popup opens on the map; don't force the sheet open.
        if (selectionFromMapRef.current) return;
        if (sheetStateRef.current === "full") return;
        const frameId = requestAnimationFrame(() => {
            measurePreviewHeight(); // selectedPointIdRef.current is set → measures to nearby section
            const sheet = sheetRef.current;
            if (!sheet) return;
            if (bodyRef.current) bodyRef.current.scrollTop = 0;
            const target = getSnapTranslate("preview", sheet.offsetHeight, peekHeightRef.current, previewHeightRef.current);
            // Only call setSheetState when actually changing state to avoid skipSnapRef leaking.
            if (sheetStateRef.current !== "preview") {
                skipSnapRef.current = true;
                setSheetState("preview");
                sheetStateRef.current = "preview";
            }
            snapSheet(sheet, target, 480, "cubic-bezier(0.16, 1, 0.3, 1)");
        });
        return () => cancelAnimationFrame(frameId);
    }, [displayedPoint, measurePreviewHeight]);

    // Manage place-card enter/leave animations.
    // On select: show immediately. On deselect: animate out then unmount.
    useEffect(() => {
        if (selectedPoint) {
            if (placeLeaveTimerRef.current) {
                clearTimeout(placeLeaveTimerRef.current);
                placeLeaveTimerRef.current = null;
            }
            setIsPlaceLeaving(false);
            setDisplayedPoint(selectedPoint);
        } else if (displayedPoint) {
            setIsPlaceLeaving(true);
            placeLeaveTimerRef.current = setTimeout(() => {
                setDisplayedPoint(null);
                setIsPlaceLeaving(false);
                placeLeaveTimerRef.current = null;
            }, 280);
        }
        return () => {
            if (placeLeaveTimerRef.current) {
                clearTimeout(placeLeaveTimerRef.current);
                placeLeaveTimerRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPoint]);

    // Auto-open to preview on mount. Near-zero delay so the animation begins
    // immediately after first paint; the fast-start easing (0.16,1,0.3,1) passes
    // through the intermediate peek position without any perceptible pause.
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            const sheet = sheetRef.current;
            if (!sheet || sheet.offsetHeight === 0) return;
            measurePreviewHeight();
            const previewT = getSnapTranslate(
                "preview",
                sheet.offsetHeight,
                peekHeightRef.current,
                previewHeightRef.current,
            );
            skipSnapRef.current = true;
            setSheetState("preview");
            sheetStateRef.current = "preview";
            snapSheet(sheet, previewT, 550, "cubic-bezier(0.16, 1, 0.3, 1)");
        }, 50);
        return () => clearTimeout(timeoutId);
    }, [measurePreviewHeight]);

    // Swipe-down-to-close: step-by-step.
    // full → preview (first overscroll), preview → closed (second overscroll).
    // Requires reaching scrollTop=0 first, then ≥52 px downward overscroll.
    useEffect(() => {
        const bodyEl = bodyRef.current;
        if (!bodyEl) return;
        let reachedTopAt = -1;

        const onTouchStart = (e: TouchEvent) => {
            const state = sheetStateRef.current;
            if (state === "full" || state === "preview") {
                reachedTopAt =
                    bodyEl.scrollTop === 0 ? e.touches[0].clientY : -1;
            } else {
                reachedTopAt = -1;
            }
        };
        const onTouchMove = (e: TouchEvent) => {
            const state = sheetStateRef.current;
            if (state !== "full" && state !== "preview") return;
            const currentY = e.touches[0].clientY;
            if (bodyEl.scrollTop === 0 && reachedTopAt < 0) {
                reachedTopAt = currentY;
            }
            if (reachedTopAt < 0 || bodyEl.scrollTop > 0) return;
            if (currentY - reachedTopAt > 52) {
                reachedTopAt = Infinity;
                const sheet = sheetRef.current;
                if (!sheet) return;
                bodyEl.scrollTop = 0;
                if (state === "full") {
                    const previewT = getSnapTranslate("preview", sheet.offsetHeight, peekHeightRef.current, previewHeightRef.current);
                    skipSnapRef.current = true;
                    setSheetState("preview");
                    sheetStateRef.current = "preview";
                    snapSheet(sheet, previewT, 480);
                } else {
                    const closedT = sheet.offsetHeight - CLOSED_HEIGHT;
                    skipSnapRef.current = true;
                    setSheetState("closed");
                    sheetStateRef.current = "closed";
                    snapSheet(sheet, closedT, 480);
                }
            }
        };
        const onTouchEnd = () => {
            reachedTopAt = -1;
        };

        bodyEl.addEventListener("touchstart", onTouchStart, { passive: true });
        bodyEl.addEventListener("touchmove", onTouchMove, { passive: true });
        bodyEl.addEventListener("touchend", onTouchEnd, { passive: true });
        return () => {
            bodyEl.removeEventListener("touchstart", onTouchStart);
            bodyEl.removeEventListener("touchmove", onTouchMove);
            bodyEl.removeEventListener("touchend", onTouchEnd);
        };
    }, []);

    function handleDragStart(e: React.PointerEvent<HTMLDivElement>) {
        const sheet = sheetRef.current;
        if (!sheet) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        // Read actual visual position so drag starts from where the sheet IS,
        // not from the target of any in-progress animation.
        const currentT = getSheetTranslateY(sheet);
        dragRef.current = {
            active: true,
            startPointerY: e.clientY,
            startTranslate: currentT,
            lastPointerY: e.clientY,
            lastTime: Date.now(),
            velocity: 0,
        };
        sheet.style.transition = "none";
        sheet.style.transform = `translateY(${currentT}px)`;
        sheet.style.willChange = "transform";
    }

    function handleDragMove(e: React.PointerEvent<HTMLDivElement>) {
        if (!dragRef.current.active) return;
        const sheet = sheetRef.current;
        if (!sheet) return;
        const sheetHeight = sheet.offsetHeight;
        const dy = e.clientY - dragRef.current.startPointerY;
        const raw = dragRef.current.startTranslate + dy;
        const newTranslate = Math.min(
            sheetHeight - CLOSED_HEIGHT,
            Math.max(DRAG_MIN, raw),
        );
        const now = Date.now();
        const dt = Math.max(1, now - dragRef.current.lastTime);
        dragRef.current.velocity =
            ((e.clientY - dragRef.current.lastPointerY) / dt) * 16;
        dragRef.current.lastPointerY = e.clientY;
        dragRef.current.lastTime = now;
        sheet.style.transform = `translateY(${newTranslate}px)`;
    }

    function handleDragEnd() {
        if (!dragRef.current.active) return;
        dragRef.current.active = false;
        const sheet = sheetRef.current;
        if (!sheet) return;
        const match = sheet.style.transform.match(
            /translateY\((-?\d+(?:\.\d+)?)px\)/,
        );
        const currentTranslate = match ? parseFloat(match[1]) : 0;
        const sheetHeight = sheet.offsetHeight;
        const velocity = dragRef.current.velocity;
        const fullT = DRAG_MIN;
        const previewT = getSnapTranslate("preview", sheetHeight, peekHeightRef.current, previewHeightRef.current);
        const peekT = getSnapTranslate("peek", sheetHeight, peekHeightRef.current, previewHeightRef.current);
        const closedT = sheetHeight - CLOSED_HEIGHT;

        // preview height is dynamic: includes the place card when one is open.
        const snaps: [SheetState, number][] = [
            ["full", fullT],
            ["preview", previewT],
            ["peek", peekT],
            ["closed", closedT],
        ];

        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < snaps.length; i++) {
            const d = Math.abs(currentTranslate - snaps[i][1]);
            if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
            }
        }
        if (velocity > 5 && bestIdx < snaps.length - 1) bestIdx++;
        else if (velocity < -5 && bestIdx > 0) bestIdx--;

        const [nextState, targetT] = snaps[bestIdx];
        skipSnapRef.current = true;
        setSheetState(nextState);
        if (nextState !== "full" && bodyRef.current)
            bodyRef.current.scrollTop = 0;

        // Velocity-proportional duration: fast flings snap quicker
        const absV = Math.abs(velocity);
        const durationMs = absV > 12 ? 300 : absV > 6 ? 400 : 480;
        void sheet.offsetHeight;
        sheet.style.transition = `transform ${durationMs}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        sheet.style.transform = `translateY(${targetT}px)`;

        const clearWillChange = () => {
            sheet.style.willChange = "";
        };
        sheet.addEventListener("transitionend", clearWillChange, {
            once: true,
        });
        setTimeout(clearWillChange, 580);
    }

    return (
        <div className="home-page">
            <div className="home-page__map">
                <DiscoveryMap
                    activeCategory={activePointCategory}
                    canSaveDraftRoute={isAuthenticated}
                    categoryOptions={nearbyCategoryOptions}
                    draftStops={draftStops}
                    draftRouteNotice={draftRouteNotice}
                    draftRouteNoticeKey={draftRouteNoticeKey}
                    draftRouteNoticeTone={draftRouteNoticeTone}
                    emptyMessage="В этом радиусе нет доступных точек."
                    fixedRouteStops={savedDraftPreviewStops}
                    fullscreen
                    initialCenter={currentCenter}
                    isLoading={isLoading || !canLoadNearbyPlaces}
                    isMapLocked={overrideMode === 'waiting'}
                    loadError={discoveryError}
                    nearbyPoints={nearbyPoints}
                    onAddPointToDraft={handleAddPointToRoute}
                    onBuildRoute={handleBuildRoute}
                    onChangeRadius={setRadiusMeters}
                    onClearDraftRoute={handleClearDraftRoute}
                    onLocateUser={requestLocation}
                    onMapClick={handleMapClick}
                    onSaveDraftRoute={handleSaveDraftRoute}
                    onSelectCategory={setActivePointCategory}
                    onSelectNextPoint={handleSelectNextPoint}
                    onSelectPoint={handleMapPointSelect}
                    onSelectPreviousPoint={handleSelectPreviousPoint}
                    panOnlyId={panOnlyId}
                    radiusMeters={radiusMeters}
                    recenterTrigger={recenterTrigger}
                    routeTargetId={effectiveRouteTargetId}
                    selectedPointId={effectiveSelectedPointId}
                    showDirectRouteInPopup={true}
                    showPopupRouteActions={false}
                    userPosition={effectiveUserPosition}
                    isManualUserPosition={isOverrideActive}
                    isRadiusLocked={isRadiusLocked}
                />
                {/* Geolocation banner: shown only when the sheet is collapsed
                    (closed/peek). Hides on user dismiss; re-appears if the
                    error message changes (e.g. permission → unsupported). */}
                {geolocationError &&
                geolocationError !== dismissedGeoError &&
                (sheetState === "closed" || sheetState === "peek") ? (
                    <div className="home-geo-banner" role="status">
                        <span className="home-geo-banner__text">
                            {geolocationError}
                        </span>
                        <button
                            aria-label="Закрыть"
                            className="home-geo-banner__close"
                            onClick={() => setDismissedGeoError(geolocationError)}
                            type="button"
                        >
                            ×
                        </button>
                    </div>
                ) : null}
            </div>

            <div className="home-sheet" ref={sheetRef}>
                {/* Drag handle — the only thing visible in peek state */}
                <div
                    aria-label="Потяните вверх чтобы открыть панель"
                    className="home-sheet__drag"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            setSheetState((s) =>
                                s === "closed"
                                    ? "peek"
                                    : s === "peek"
                                      ? "preview"
                                      : s === "preview"
                                        ? "full"
                                        : "closed",
                            );
                        }
                    }}
                    onPointerCancel={handleDragEnd}
                    onPointerDown={handleDragStart}
                    onPointerMove={handleDragMove}
                    onPointerUp={handleDragEnd}
                    role="button"
                    tabIndex={0}>
                    <div className="home-sheet__handle" />
                    <button
                        aria-label={overrideMode !== 'off' ? "Вернуться к реальной геопозиции" : "Установить собственное местоположение"}
                        className={`home-sheet__profile${overrideMode !== 'off' ? ' home-sheet__profile--active' : geolocationError && geolocationError !== dismissedGeoError && (sheetState === 'closed' || sheetState === 'peek') ? ' home-sheet__profile--geo-error' : ''}`}
                        onClick={handleToggleOverride}
                        onPointerDown={(e) => e.stopPropagation()}
                        title={isOverrideActive ? "Нажмите ещё раз чтобы вернуться к реальной геопозиции" : "Нажмите, а затем кликните на карту чтобы установить своё местоположение"}
                        type="button">
                        <svg
                            aria-hidden="true"
                            fill="none"
                            height="16"
                            viewBox="0 0 24 24"
                            width="16">
                            <circle
                                cx="12"
                                cy="12"
                                r="9"
                                stroke="currentColor"
                                strokeWidth="2"
                            />
                            <circle
                                cx="12"
                                cy="12"
                                r="3"
                                fill="currentColor"
                            />
                        </svg>
                    </button>

                    <button
                        aria-label={isRadiusLocked ? "Разблокировать радиус" : "Зафиксировать радиус карты"}
                        className={`home-sheet__lock${isRadiusLocked ? ' home-sheet__lock--active' : ''}`}
                        onClick={toggleRadiusLock}
                        onPointerDown={(e) => e.stopPropagation()}
                        title={isRadiusLocked ? "Радиус зафиксирован — нажмите чтобы разблокировать" : "Нажмите чтобы зафиксировать радиус при зуме"}
                        type="button">
                        {isRadiusLocked ? (
                            <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 24 24" width="14">
                                <rect height="11" rx="2" stroke="currentColor" strokeWidth="2.2" width="18" x="3" y="11" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
                            </svg>
                        ) : (
                            <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 24 24" width="14">
                                <rect height="11" rx="2" stroke="currentColor" strokeWidth="2.2" width="18" x="3" y="11" />
                                <path d="M7 11V7a5 5 0 0 1 9.9-1" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
                            </svg>
                        )}
                    </button>

                    {/* Locate button lives inside drag area — always visible */}
                    <button
                        aria-label="Найти моё местоположение"
                        className="home-sheet__locate"
                        onClick={handleCenterUser}
                        onPointerDown={(e) => e.stopPropagation()}
                        type="button">
                        <svg
                            fill="none"
                            height="16"
                            viewBox="0 0 24 24"
                            width="16">
                            <circle
                                cx="12"
                                cy="12"
                                r="3.5"
                                stroke="currentColor"
                                strokeWidth="2"
                            />
                            <path
                                d="M12 2v3M12 19v3M2 12h3M19 12h3"
                                stroke="currentColor"
                                strokeLinecap="round"
                                strokeWidth="2"
                            />
                        </svg>
                    </button>
                </div>

                {/* Scrollable content */}
                <div
                    className="home-sheet__body"
                    ref={bodyRef}
                    style={{
                        overflowY: sheetState === "full" || sheetState === "preview" ? undefined : "hidden",
                    }}>
                    {/* ── Categories ── */}
                    <div
                        className="home-sheet__filter-group"
                        ref={filterGroupRef}>
                        <p className="home-sheet__filter-label">Места рядом</p>
                        <div className="home-sheet__cats">
                            {nearbyCategoryOptions.map((opt) => (
                                <button
                                    className={`home-sheet__cat${activePointCategory === opt.id ? " home-sheet__cat--active" : ""}`}
                                    key={opt.id}
                                    onClick={() =>
                                        setActivePointCategory(opt.id)
                                    }
                                    type="button">
                                    <span
                                        className="home-sheet__cat-icon"
                                        aria-hidden="true"
                                        dangerouslySetInnerHTML={{ __html: tabIconMap.get(opt.id) ?? categoryIcons.all }}
                                    />
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Selected place card ── */}
                    {displayedPoint && (
                        <div
                            className={`home-sheet__place-wrap${isPlaceLeaving ? " home-sheet__place-wrap--leaving" : ""}`}
                            key="place-card">
                                <div className="home-sheet__place">
                                    <div className="home-sheet__place-top">
                                        <div className="home-sheet__place-meta">
                                            <span className="home-sheet__place-cat">
                                                {getPointCategoryLabel(displayedPoint)}
                                            </span>
                                            <span className="home-sheet__place-dist">
                                                {formatMeters(displayedPoint.distanceMeters)}
                                            </span>
                                        </div>
                                        <button
                                            aria-label="Построить маршрут к месту"
                                            className="home-sheet__place-go"
                                            onClick={() => handleGoToPlace(displayedPoint)}
                                            type="button">
                                            <svg
                                                fill="currentColor"
                                                height="18"
                                                viewBox="0 0 24 24"
                                                width="18"
                                                aria-hidden="true">
                                                <circle cx="12" cy="4.5" r="1.75" />
                                                <path d="M14.5 8.5c-.6-.8-1.4-1-2-.9l-3 1.2-1.5 3.5 1.8.7.9-2.2 1-.4-1.5 4.1-2.8 2.4 1.2 1.4 3-2.6 1.4 3.3H16l-1.6-4 .6-1.6 1 2h1.9L15.5 12l-.3-1.4 1.4.6.6-1.7-2.7-1z" />
                                            </svg>
                                        </button>
                                    </div>
                                    <h3 className="home-sheet__place-title">
                                        {displayedPoint.title}
                                    </h3>
                                    {displayedPoint.addressLabel && (
                                        <p className="home-sheet__place-address">
                                            {displayedPoint.addressLabel}
                                        </p>
                                    )}
                                    {displayedPoint.scheduleLabel && (
                                        <p className="home-sheet__place-schedule">
                                            {displayedPoint.scheduleLabel}
                                        </p>
                                    )}
                                    {(displayedPoint.shortDescription || displayedPoint.description) && (
                                        <p className="home-sheet__place-desc">
                                            {displayedPoint.shortDescription || displayedPoint.description}
                                        </p>
                                    )}
                                    {(displayedPoint.expectedVisitMinutes > 0 || displayedPoint.distanceMeters > 0) && (
                                        <div className="home-sheet__place-stats">
                                            {displayedPoint.expectedVisitMinutes > 0 && (
                                                <span className="home-sheet__place-stat">
                                                    <span className="home-sheet__place-stat-label">На посещение:</span>
                                                    {" "}~{displayedPoint.expectedVisitMinutes} мин
                                                </span>
                                            )}
                                            {displayedPoint.distanceMeters > 0 && (
                                                <span className="home-sheet__place-stat">
                                                    <span className="home-sheet__place-stat-label">Идти:</span>
                                                    {" "}~{Math.ceil(displayedPoint.distanceMeters / 80)} мин
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                        </div>
                    )}

                    {/* ── Nearby cards ── */}
                    <div
                        className="home-sheet__section"
                        ref={nearbySectionRef}
                    >
                        <h3 className="home-sheet__section-title">Рядом с вами</h3>
                        {nearbyPoints.length > 0 ? (
                            <div className="home-nearby-carousel">
                                <button
                                    aria-label="Листать влево"
                                    className="home-nearby-carousel__arrow home-nearby-carousel__arrow--prev"
                                    onPointerCancel={nearbyScrollUp}
                                    onPointerDown={() => nearbyScrollDown(-1)}
                                    onPointerLeave={nearbyScrollUp}
                                    onPointerUp={nearbyScrollUp}
                                    type="button"
                                >
                                    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
                                        <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
                                    </svg>
                                </button>
                            <div
                                className="home-sheet__cards"
                                ref={nearbyListRef}>
                                {nearbyPoints.map((point) => (
                                    <button
                                        className={[
                                            "home-card",
                                            point.id ===
                                            effectiveSelectedPointId
                                                ? "home-card--active"
                                                : "",
                                        ]
                                            .filter(Boolean)
                                            .join(" ")}
                                        data-point-id={point.id}
                                        key={point.id}
                                        onClick={() =>
                                            handleNearbyCardClick(point.id)
                                        }
                                        type="button">
                                        <div className="home-card__img">
                                            <SmartPlaceImage
                                                alt={point.title}
                                                category={point.category}
                                                loading="lazy"
                                                referrerPolicy="no-referrer"
                                                src={
                                                    pointDetailsMap.get(
                                                        point.id,
                                                    )?.imageUrl ||
                                                    point.imageUrl
                                                }
                                                title={point.title}
                                            />
                                            <span className="home-card__dist-badge">
                                                {formatMeters(
                                                    point.distanceMeters,
                                                )}
                                            </span>
                                        </div>
                                        <div className="home-card__body">
                                            <span className="home-card__cat">
                                                {getPointCategoryLabel(
                                                    point,
                                                )}
                                            </span>
                                            <p className="home-card__title">
                                                {point.title}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                                <button
                                    aria-label="Листать вправо"
                                    className="home-nearby-carousel__arrow home-nearby-carousel__arrow--next"
                                    onPointerCancel={nearbyScrollUp}
                                    onPointerDown={() => nearbyScrollDown(1)}
                                    onPointerLeave={nearbyScrollUp}
                                    onPointerUp={nearbyScrollUp}
                                    type="button"
                                >
                                    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
                                        <path d="M9 5l7 7-7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
                                    </svg>
                                </button>
                            </div>
                        ) : canShowEmpty && !isLoading ? (
                            <section className={`status-card${discoveryError ? ' status-card--error' : ''}`}>
                                <h3 className="status-card__title">
                                    {discoveryError ? 'Ошибка загрузки' : 'Нет точек рядом'}
                                </h3>
                                <p className="status-card__text">
                                    {discoveryError
                                        ? 'Сервис временно недоступен. Попробуйте перезагрузить страницу.'
                                        : 'В этом радиусе нет доступных мест. Попробуйте другой фильтр или отдалите карту.'}
                                </p>
                            </section>
                        ) : (
                            <NearbyCardsSkeleton />
                        )}
                    </div>

                    {/* ── Excursions ── */}
                    <div className="home-sheet__section home-sheet__section--excursions">
                        <h3
                            className="home-sheet__section-title"
                            ref={routesTitleRef}>
                            Готовые маршруты
                        </h3>
                        <div className="home-sheet__filter-group home-sheet__filter-group--inline">
                            <div className="home-sheet__cats">
                                {routeThemeOptions.map((theme) => (
                                    <button
                                        className={`home-sheet__cat${activeRouteTheme === theme ? " home-sheet__cat--active" : ""}`}
                                        key={theme}
                                        onClick={() =>
                                            setActiveRouteTheme(theme)
                                        }
                                        type="button">
                                        {theme === "all"
                                            ? "Все темы"
                                            : formatTheme(theme)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="home-sheet__filter-divider" />

                        <div className="home-sheet__filter-group home-sheet__filter-group--inline">
                            <div className="home-sheet__cats">
                                <button
                                    className={`home-sheet__cat${maxRouteDuration === null ? " home-sheet__cat--active" : ""}`}
                                    onClick={() => setMaxRouteDuration(null)}
                                    type="button">
                                    Любое время
                                </button>
                                {durationOptions.map((d) => (
                                    <button
                                        className={`home-sheet__cat${maxRouteDuration === d ? " home-sheet__cat--active" : ""}`}
                                        key={d}
                                        onClick={() => setMaxRouteDuration(d)}
                                        type="button">
                                        До {formatDuration(d)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {!canShowEmpty && visibleRoutes.length === 0 ? (
                            <CatalogSkeleton />
                        ) : (
                            <>
                                <ExcursionCatalog
                                    emptyDescription="Попробуйте другой фильтр"
                                    emptyTitle="Нет маршрутов"
                                    excursions={visibleRoutes.slice(0, 4)}
                                    isError={Boolean(discoveryError)}
                                />

                                {visibleRoutes.length > 0 && (
                                    <div className="home-sheet__view-all-wrap">
                                        <Link
                                            className="home-sheet__view-all"
                                            to={appRoutes.excursions}>
                                            Смотреть все маршруты
                                        </Link>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* ── Decorative art (fills empty space on larger screens) ── */}
                    <div aria-hidden="true" className="home-sheet__art" />

                    {/* ── Footer ── */}
                    <footer className="home-sheet__footer">
                        <div className="home-sheet__footer-brand">
                            <span className="home-sheet__footer-logo">
                                T-GUIDE
                            </span>
                            <p className="home-sheet__footer-tagline">
                                Аудиогид по городу
                            </p>
                        </div>
                        <p className="home-sheet__footer-desc">
                            Готовые маршруты с описаниями
                            достопримечательностей, точки интереса рядом с вами
                            и удобная навигация по улицам — всё в одном месте.
                        </p>
                        <div className="home-sheet__footer-features">
                            <span className="home-sheet__footer-feature">
                                <span
                                    aria-hidden="true"
                                    className="home-sheet__footer-feature-icon">
                                    <FooterFeatureIcon name="audio" />
                                </span>
                                Аудиоэкскурсии
                            </span>
                            <span className="home-sheet__footer-feature">
                                <span
                                    aria-hidden="true"
                                    className="home-sheet__footer-feature-icon">
                                    <FooterFeatureIcon name="routes" />
                                </span>
                                Готовые маршруты
                            </span>
                            <span className="home-sheet__footer-feature">
                                <span
                                    aria-hidden="true"
                                    className="home-sheet__footer-feature-icon">
                                    <FooterFeatureIcon name="nearby" />
                                </span>
                                Места рядом
                            </span>
                            <span className="home-sheet__footer-feature">
                                <span
                                    aria-hidden="true"
                                    className="home-sheet__footer-feature-icon">
                                    <FooterFeatureIcon name="walking" />
                                </span>
                                Пешие прогулки
                            </span>
                        </div>
                        <p className="home-sheet__footer-copy">
                            © T-Guide · Открывайте город пешком
                        </p>
                    </footer>
                </div>
            </div>
        </div>
    );
}

function NearbyCardsSkeleton() {
    return (
        <div className="home-sheet__cards home-sheet__cards--skeleton" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
                <div className="home-card-skeleton" key={i}>
                    <div className="home-card-skeleton__img" />
                    <div className="home-card-skeleton__body">
                        <div className="home-skeleton-line home-skeleton-line--short" />
                        <div className="home-skeleton-line" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function CatalogSkeleton() {
    return (
        <div className="home-catalog-skeleton" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
                <div className="home-catalog-skeleton__card" key={i}>
                    <div className="home-catalog-skeleton__cover" />
                    <div className="home-catalog-skeleton__info">
                        <div className="home-skeleton-line home-skeleton-line--short" />
                        <div className="home-skeleton-line" />
                        <div className="home-skeleton-line home-skeleton-line--mid" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function scrollIntoHorizontalView(container: HTMLElement, target: HTMLElement) {
    const cr = container.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    if (tr.left >= cr.left && tr.right <= cr.right) return;
    const relLeft = tr.left - cr.left + container.scrollLeft;
    const nextLeft = relLeft - container.clientWidth / 2 + tr.width / 2;
    const maxLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    container.scrollTo({
        behavior: "smooth",
        left: Math.min(Math.max(0, nextLeft), maxLeft),
    });
}
