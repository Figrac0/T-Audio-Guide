# T-Guide

Краткое описание двух ключевых страниц приложения: главная и страница маршрутов (`/excursions`).

<div align="center">
  <a href="https://t-audio-guide-v4.vercel.app/" target="_blank">
    <img
      src="https://github.com/Figrac0/Figrac0/blob/main/href.svg"
      alt="Quick Access - Visit Site"
      width="50%"
    />
  </a>
</div>

## Главная страница

Маршрут: `/`

Что делает:

- Показывает полноэкранную карту с ближайшими местами.
- Использует нижний drawer, который можно тянуть вверх и вниз.
- Позволяет:
    - выбрать категорию мест,
    - изменить радиус поиска,
    - выбрать точку на карте,
    - посмотреть краткую карточку выбранного места,
    - открыть место в Google Maps,
    - построить маршрут до выбранной точки,
    - посмотреть готовые экскурсии и перейти на страницу маршрутов.

Как устроена:

- Основной UI страницы: [HomePage.tsx](/D:/arst.hw/стаж/T-bank/T-Guid/t-guide/src/pages/home/ui/HomePage.tsx)
- Стили страницы: [HomePage.css](/D:/arst.hw/стаж/T-bank/T-Guid/t-guide/src/pages/home/ui/HomePage.css)
- Карта и popups: [DiscoveryMap.tsx](/D:/arst.hw/стаж/T-bank/T-Guid/t-guide/src/features/route-map/ui/DiscoveryMap.tsx)
- Стили карты и маркеров: [DiscoveryMap.css](/D:/arst.hw/стаж/T-bank/T-Guid/t-guide/src/features/route-map/ui/DiscoveryMap.css), [map-marker-skin.css](/D:/arst.hw/стаж/T-bank/T-Guid/t-guide/src/features/route-map/ui/map-marker-skin.css)

Ключевая логика:

- Главная работает как экран discovery.
- Выбранная точка хранится локально на странице.
- Маршрут до выбранной точки строится через общий route-layer карты.
- Drawer содержит:
    - фильтры по местам,
    - карточку активного места,
    - горизонтальный список nearby places,
    - блок готовых экскурсий,
    - footer.

## Страница маршрутов

Маршрут: `/excursions`

Что делает:

- Показывает полноэкранную карту с точками и пользовательским маршрутом.
- Использует отдельный нижний drawer в стиле главной страницы.
- Позволяет:
    - выбрать точку на карте,
    - открыть popup прямо над точкой,
    - добавить точку в свой маршрут,
    - собрать до 6 точек,
    - увидеть порядок точек на карте числами `1-6`,
    - очистить маршрут,
    - сохранить маршрут и перейти на страницу конкретной экскурсии,
    - фильтровать готовые экскурсии по теме и длительности.

Как устроена:

- Основной UI страницы: [ExcursionsPage.tsx](/D:/arst.hw/стаж/T-bank/T-Guid/t-guide/src/pages/excursions/ui/ExcursionsPage.tsx)
- Стили страницы: [ExcursionsPage.css](/D:/arst.hw/стаж/T-bank/T-Guid/t-guide/src/pages/excursions/ui/ExcursionsPage.css)
- Карта билдера маршрута: [RouteBuilderMap.tsx](/D:/arst.hw/стаж/T-bank/T-Guid/t-guide/src/pages/excursions/ui/RouteBuilderMap.tsx)
- Стили popup-карточки и карты: [RouteBuilderMap.css](/D:/arst.hw/стаж/T-bank/T-Guid/t-guide/src/pages/excursions/ui/RouteBuilderMap.css)
- Состояние страницы: [useExcursionsPageState.ts](/D:/arst.hw/стаж/T-bank/T-Guid/t-guide/src/pages/excursions/model/useExcursionsPageState.ts)

Ключевая логика:

- После выбора первой точки строится первый сегмент:
    - пользователь -> первая точка
- Дальше маршрут строится последовательно:
    - первая -> вторая
    - вторая -> третья
    - и так далее
- Первый сегмент визуально отдельный, остальные сегменты цветные и различимые.
- Маршрут пересчитывается как пешеходный и кешируется, чтобы после возврата на страницу не деградировать в прямые линии.
- Блок `Мой маршрут` появляется только после добавления первой точки.
- Внутри `Мой маршрут` можно:
    - раскрывать точки,
    - удалять точки,
    - сбросить весь маршрут,
    - сохранить маршрут.

## Общее между страницами

- Header общий для всего приложения: [App.tsx](/D:/arst.hw/стаж/T-bank/T-Guid/t-guide/src/app/App.tsx), [App.css](/D:/arst.hw/стаж/T-bank/T-Guid/t-guide/src/app/App.css)
- Общая карта Leaflet и иконки: [leaflet-map.ts](/D:/arst.hw/стаж/T-bank/T-Guid/t-guide/src/features/route-map/lib/leaflet-map.ts)
- Геометрия маршрутов и кеш walking-route: [route-geometry.ts](/D:/arst.hw/стаж/T-bank/T-Guid/t-guide/src/features/route-map/lib/route-geometry.ts)
- Общий state пользовательских маршрутов: [UserRoutesProvider.tsx](/D:/arst.hw/стаж/T-bank/T-Guid/t-guide/src/features/user-routes/model/UserRoutesProvider.tsx)
- Общие design tokens: [tokens.css](/D:/arst.hw/стаж/T-bank/T-Guid/t-guide/src/app/styles/tokens.css)

## Что важно понимать перед доработкой

- Главная страница отвечает за discovery и быстрый вход в контент.
- `/excursions` отвечает за сборку пользовательского маршрута и каталог готовых экскурсий.
- Обе страницы используют один стек карты, общие маркеры и общую логику геометрии.
- Если менять карту, маркеры, route-layer или drawer, проверять нужно обе страницы сразу.
