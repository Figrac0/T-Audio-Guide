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
import { formatMeters } from "@/features/route-map/lib/route-geometry";
import { useUserGeolocation } from "@/features/route-map/model/useUserGeolocation";
import type { DiscoveryCategoryOption } from "@/features/route-map/ui/DiscoveryMap";
import { DiscoveryMap } from "@/features/route-map/ui/DiscoveryMap";
import { useAuth } from "@/app/providers/useAuth";
import { useUserRoutes } from "@/features/user-routes/model/useUserRoutes";
import { appRoutes } from "@/shared/config/routes";
import {
    detectSupportedLocale,
    getStoredDiscoveryContext,
    saveDiscoveryContext,
} from "@/shared/lib/discovery-context";
import {
    formatDuration,
    formatPointCategory,
    formatTheme,
} from "@/shared/lib/format";
import { SmartPlaceImage } from "@/shared/ui/SmartPlaceImage";
import { ExcursionCatalog } from "@/widgets/excursion-catalog/ui/ExcursionCatalog";
import "./HomePage.css";

const CLOSED_HEIGHT = 52; // drag handle bar only
const DRAG_MIN = 10;

type SheetState = "closed" | "peek" | "full";

function getSnapTranslate(state: SheetState, sheetHeight: number, peekHeight: number): number {
    if (state === "full") return DRAG_MIN;
    if (state === "peek") return Math.max(DRAG_MIN, sheetHeight - peekHeight);
    return Math.max(DRAG_MIN, sheetHeight - CLOSED_HEIGHT);
}

const nearbyCategoryOptions: DiscoveryCategoryOption[] = [
    { id: "all", label: "Все" },
    { id: "museum", label: "Музеи" },
    { id: "entertainment", label: "Развлечения" },
    { id: "landmark", label: "История" },
    { id: "food", label: "Еда" },
    { id: "park", label: "Природа" },
];

const categoryIcons: Record<string, string> = {
    all: "◎",
    museum: "🏛",
    entertainment: "✨",
    landmark: "📍",
    food: "🍽",
    park: "🌿",
};

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
    const [activePointCategory, setActivePointCategory] = useState<
        PointCategory | "all"
    >(storedContext.activePointCategory ?? "all");
    const [radiusMeters, setRadiusMeters] = useState<number>(
        storedContext.radiusMeters ?? 1000,
    );
    const [activeRouteTheme, setActiveRouteTheme] = useState<
        ExcursionTheme | "all"
    >("all");
    const [maxRouteDuration, setMaxRouteDuration] = useState<number | null>(
        null,
    );
    const [selectedPointId, setSelectedPointId] = useState<string>("");
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

    const nearbyListRef = useRef<HTMLDivElement | null>(null);
    const shouldScrollNearbyListRef = useRef(false);
    const isAuthenticated = Boolean(
        session?.isAuthenticated && session.profile,
    );

    useEffect(() => {
        document.body.classList.add("app-body--home-page");
        return () => document.body.classList.remove("app-body--home-page");
    }, []);

    const {
        error: geolocationError,
        requestLocation,
        status: geolocationStatus,
        userPosition,
    } = useUserGeolocation();

    const currentCenter = userPosition ?? storedContext.center;
    const canLoadNearbyPlaces =
        Boolean(userPosition) ||
        geolocationStatus === "blocked" ||
        geolocationStatus === "unsupported";

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
        radiusMeters,
        search: "",
    });

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

    const effectiveSelectedPointId =
        nearbyPoints.find((p) => p.id === selectedPointId)?.id ?? "";
    const selectedPoint = effectiveSelectedPointId
        ? (nearbyPoints.find((p) => p.id === effectiveSelectedPointId) ?? null)
        : null;
    const effectiveRouteTargetId =
        routeTargetId && nearbyPoints.some((p) => p.id === routeTargetId)
            ? routeTargetId
            : null;
    const visibleRoutes = useMemo(
        () =>
            excursions.filter((e) => {
                const matchesTheme =
                    activeRouteTheme === "all" || e.theme === activeRouteTheme;
                const matchesDuration =
                    maxRouteDuration === null ||
                    e.durationMinutes <= maxRouteDuration;
                return matchesTheme && matchesDuration;
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
        if (!userPosition) {
            requestLocation();
            return;
        }
        setRecenterTrigger((n) => n + 1);
    }, [userPosition, requestLocation]);

    const handleNearbyCardClick = useCallback((pointId: string) => {
        shouldScrollNearbyListRef.current = true;
        setSelectedPointId(pointId);
    }, []);

    const handleMapPointSelect = useCallback((pointId: string) => {
        shouldScrollNearbyListRef.current = true;
        setSelectedPointId(pointId);
    }, []);

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

    // ── Bottom sheet ────────────────────────────────────────────────────────────

    const [sheetState, setSheetState] = useState<SheetState>("closed");
    const sheetStateRef = useRef<SheetState>("closed");
    const sheetRef = useRef<HTMLDivElement>(null);
    const filterGroupRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const peekHeightRef = useRef(170); // fallback; measured by ResizeObserver
    // Prevents the sheetState useEffect from overriding a manually set transform
    const skipSnapRef = useRef(false);

    const snapToPeek = useCallback(() => {
        const sheet = sheetRef.current;
        if (!sheet) return;
        const peekT = getSnapTranslate("peek", sheet.offsetHeight, peekHeightRef.current);
        if (bodyRef.current) bodyRef.current.scrollTop = 0;
        skipSnapRef.current = true;
        setSheetState("peek");
        sheet.style.transition = "transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)";
        sheet.style.transform = `translateY(${peekT}px)`;
    }, []);

    const snapToClosed = useCallback(() => {
        const sheet = sheetRef.current;
        if (!sheet) return;
        const closedT = sheet.offsetHeight - CLOSED_HEIGHT;
        skipSnapRef.current = true;
        setSheetState("closed");
        sheet.style.transition = "transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)";
        sheet.style.transform = `translateY(${closedT}px)`;
    }, []);

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
        const target = getSnapTranslate(sheetState, sheet.offsetHeight, peekHeightRef.current);
        if (sheetState === "peek" && bodyRef.current) bodyRef.current.scrollTop = 0;
        sheet.style.transition = "transform 0.36s cubic-bezier(0.4, 0, 0.2, 1)";
        sheet.style.transform = `translateY(${target}px)`;
    }, [sheetState]);

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
            const target = getSnapTranslate(
                sheetStateRef.current,
                sheet.offsetHeight,
                peekHeightRef.current,
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

    // Scroll-to-close: when fully open and user overscrolls past the top edge.
    // We only close after the user has *continued* swiping ≥52 px beyond the
    // moment the content hit scrollTop=0 — so "scroll to top" alone never
    // accidentally closes the sheet.
    useEffect(() => {
        const bodyEl = bodyRef.current;
        if (!bodyEl) return;
        let reachedTopAt = -1; // clientY where scrollTop first became 0

        const onTouchStart = (e: TouchEvent) => {
            // If already at top, start counting overscroll immediately
            reachedTopAt = bodyEl.scrollTop === 0 ? e.touches[0].clientY : -1;
        };
        const onTouchMove = (e: TouchEvent) => {
            if (sheetStateRef.current !== "full") return;
            const currentY = e.touches[0].clientY;
            // Record the exact y when content reaches the top mid-gesture
            if (bodyEl.scrollTop === 0 && reachedTopAt < 0) {
                reachedTopAt = currentY;
            }
            // Bail if we haven't reached the top yet, or scrolled back down
            if (reachedTopAt < 0 || bodyEl.scrollTop > 0) return;
            // Require an intentional 52 px overscroll beyond the top edge
            if (currentY - reachedTopAt > 52) {
                reachedTopAt = Infinity; // prevent re-trigger
                const sheet = sheetRef.current;
                if (!sheet) return;
                const closedT = sheet.offsetHeight - CLOSED_HEIGHT;
                skipSnapRef.current = true;
                setSheetState("closed");
                sheet.style.transition =
                    "transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)";
                sheet.style.transform = `translateY(${closedT}px)`;
            }
        };
        const onTouchEnd = () => { reachedTopAt = -1; };

        bodyEl.addEventListener("touchstart", onTouchStart, { passive: true });
        bodyEl.addEventListener("touchmove", onTouchMove, { passive: true });
        bodyEl.addEventListener("touchend", onTouchEnd, { passive: true });
        return () => {
            bodyEl.removeEventListener("touchstart", onTouchStart);
            bodyEl.removeEventListener("touchmove", onTouchMove);
            bodyEl.removeEventListener("touchend", onTouchEnd);
        };
    }, []);

    const handleDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const sheet = sheetRef.current;
        if (!sheet) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const match = sheet.style.transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/);
        const current = match
            ? parseFloat(match[1])
            : getSnapTranslate(sheetStateRef.current, sheet.offsetHeight, peekHeightRef.current);
        dragRef.current = {
            active: true,
            startPointerY: e.clientY,
            startTranslate: current,
            lastPointerY: e.clientY,
            lastTime: Date.now(),
            velocity: 0,
        };
        sheet.style.transition = "none";
        sheet.style.willChange = "transform";
    }, []);

    const handleDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragRef.current.active) return;
        const sheet = sheetRef.current;
        if (!sheet) return;
        const sheetHeight = sheet.offsetHeight;
        const raw = dragRef.current.startTranslate + (e.clientY - dragRef.current.startPointerY);
        const newTranslate = Math.min(sheetHeight - CLOSED_HEIGHT, Math.max(DRAG_MIN, raw));
        const now = Date.now();
        const dt = Math.max(1, now - dragRef.current.lastTime);
        dragRef.current.velocity = ((e.clientY - dragRef.current.lastPointerY) / dt) * 16;
        dragRef.current.lastPointerY = e.clientY;
        dragRef.current.lastTime = now;
        sheet.style.transform = `translateY(${newTranslate}px)`;
    }, []);

    const handleDragEnd = useCallback(() => {
        if (!dragRef.current.active) return;
        dragRef.current.active = false;
        const sheet = sheetRef.current;
        if (!sheet) return;
        const match = sheet.style.transform.match(/translateY\((-?\d+(?:\.\d+)?)px\)/);
        const currentTranslate = match ? parseFloat(match[1]) : 0;
        const sheetHeight = sheet.offsetHeight;
        const velocity = dragRef.current.velocity;
        const fullT = DRAG_MIN;
        const peekT = getSnapTranslate("peek", sheetHeight, peekHeightRef.current);
        const closedT = sheetHeight - CLOSED_HEIGHT;

        const snaps: [SheetState, number][] = [
            ["full", fullT],
            ["peek", peekT],
            ["closed", closedT],
        ];

        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < snaps.length; i++) {
            const d = Math.abs(currentTranslate - snaps[i][1]);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        if (velocity > 5 && bestIdx < snaps.length - 1) bestIdx++;
        else if (velocity < -5 && bestIdx > 0) bestIdx--;

        const [nextState, targetT] = snaps[bestIdx];
        skipSnapRef.current = true;
        setSheetState(nextState);
        sheet.style.transition = "transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)";
        sheet.style.transform = `translateY(${targetT}px)`;
        if (nextState === "peek" && bodyRef.current) bodyRef.current.scrollTop = 0;

        const clearWillChange = () => { sheet.style.willChange = ""; };
        sheet.addEventListener("transitionend", clearWillChange, { once: true });
        setTimeout(clearWillChange, 450);
    }, []);

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
                    geolocationError={geolocationError}
                    isLoading={isLoading || !canLoadNearbyPlaces}
                    loadError={discoveryError}
                    nearbyPoints={nearbyPoints}
                    onAddPointToDraft={handleAddPointToRoute}
                    onBuildRoute={handleBuildRoute}
                    onChangeRadius={setRadiusMeters}
                    onClearDraftRoute={handleClearDraftRoute}
                    onLocateUser={requestLocation}
                    onSaveDraftRoute={handleSaveDraftRoute}
                    onSelectCategory={setActivePointCategory}
                    onSelectNextPoint={() => cycleSelectedPoint(1)}
                    onSelectPoint={handleMapPointSelect}
                    onSelectPreviousPoint={() => cycleSelectedPoint(-1)}
                    radiusMeters={radiusMeters}
                    recenterTrigger={recenterTrigger}
                    routeTargetId={effectiveRouteTargetId}
                    selectedPointId={effectiveSelectedPointId}
                    showDirectRouteInPopup={true}
                    showPopupRouteActions={false}
                    userPosition={userPosition}
                />
            </div>

            <div className="home-sheet" data-state={sheetState} ref={sheetRef}>
                {/* Drag handle — the only thing visible in peek state */}
                <div
                    aria-label="Потяните вверх чтобы открыть панель"
                    className="home-sheet__drag"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            setSheetState((s) =>
                                s === "closed" ? "peek" : s === "peek" ? "full" : "closed",
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
                    <Link
                        aria-label="Открыть профиль"
                        className="home-sheet__profile"
                        onPointerDown={(e) => e.stopPropagation()}
                        to={appRoutes.profile}>
                        <svg
                            aria-hidden="true"
                            fill="none"
                            height="16"
                            viewBox="0 0 24 24"
                            width="16">
                            <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="2" />
                            <path
                                d="M5.5 20c1.1-4 3.4-6 6.5-6s5.4 2 6.5 6"
                                stroke="currentColor"
                                strokeLinecap="round"
                                strokeWidth="2"
                            />
                        </svg>
                    </Link>

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
                    style={{ overflowY: sheetState === "full" ? undefined : "hidden" }}
                >
                    {/* ── Categories ── */}
                    <div className="home-sheet__filter-group" ref={filterGroupRef}>
                        <p className="home-sheet__filter-label">Места рядом</p>
                        <div className="home-sheet__cats">
                            {nearbyCategoryOptions.map((opt) => (
                                <button
                                    className={`home-sheet__cat${activePointCategory === opt.id ? " home-sheet__cat--active" : ""}`}
                                    key={opt.id}
                                    onClick={() =>
                                        setActivePointCategory(
                                            opt.id as PointCategory | "all",
                                        )
                                    }
                                    type="button">
                                    <span
                                        className="home-sheet__cat-icon"
                                        aria-hidden="true">
                                        {categoryIcons[opt.id]}
                                    </span>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Selected place card ── */}
                    {selectedPoint && (
                        <div className="home-sheet__place-wrap" key={selectedPoint.id}>
                        <div className="home-sheet__place">
                            <div className="home-sheet__place-top">
                                <div className="home-sheet__place-meta">
                                    <span className="home-sheet__place-cat">
                                        {formatPointCategory(
                                            selectedPoint.category,
                                        )}
                                    </span>
                                    <span className="home-sheet__place-dist">
                                        {formatMeters(
                                            selectedPoint.distanceMeters,
                                        )}
                                    </span>
                                </div>
                                <button
                                    aria-label="Построить маршрут к месту"
                                    className="home-sheet__place-go"
                                    onClick={() =>
                                        handleGoToPlace(selectedPoint)
                                    }
                                    type="button">
                                    {/* Walking person icon */}
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
                                {selectedPoint.title}
                            </h3>
                            {selectedPoint.addressLabel && (
                                <p className="home-sheet__place-address">
                                    {selectedPoint.addressLabel}
                                </p>
                            )}
                            {selectedPoint.scheduleLabel && (
                                <p className="home-sheet__place-schedule">
                                    {selectedPoint.scheduleLabel}
                                </p>
                            )}
                            {(selectedPoint.description ||
                                selectedPoint.shortDescription) && (
                                <p className="home-sheet__place-desc">
                                    {selectedPoint.description ||
                                        selectedPoint.shortDescription}
                                </p>
                            )}
                            {(selectedPoint.rating > 0 ||
                                selectedPoint.expectedVisitMinutes > 0) && (
                                <div className="home-sheet__place-stats">
                                    {selectedPoint.rating > 0 && (
                                        <span className="home-sheet__place-stat home-sheet__place-stat--rating">
                                            ★ {selectedPoint.rating.toFixed(1)}
                                        </span>
                                    )}
                                    {selectedPoint.expectedVisitMinutes > 0 && (
                                        <span className="home-sheet__place-stat">
                                            ~
                                            {selectedPoint.expectedVisitMinutes}{" "}
                                            мин
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        </div>
                    )}

                    {/* ── Nearby cards ── */}
                    {nearbyPoints.length > 0 && (
                        <div className="home-sheet__section">
                            <h3 className="home-sheet__section-title">
                                Рядом с вами
                            </h3>
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
                                                src={point.imageUrl}
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
                                                {formatPointCategory(
                                                    point.category,
                                                )}
                                            </span>
                                            <p className="home-card__title">
                                                {point.title}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Excursions ── */}
                    <div className="home-sheet__section home-sheet__section--excursions">
                        <h3 className="home-sheet__section-title">
                            Готовые экскурсии
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

                        <ExcursionCatalog
                            emptyDescription="Попробуйте другой фильтр"
                            emptyTitle="Нет маршрутов"
                            excursions={visibleRoutes.slice(0, 4)}
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
                    </div>

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
                                🎧 Аудиоэкскурсии
                            </span>
                            <span className="home-sheet__footer-feature">
                                🗺 Готовые маршруты
                            </span>
                            <span className="home-sheet__footer-feature">
                                📍 Места рядом
                            </span>
                            <span className="home-sheet__footer-feature">
                                🚶 Пешие прогулки
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
