import type { PointCategory, RouteStop } from '@/entities/excursion/model/types'

type CategoryKey = PointCategory | 'mixed'

// [countBucket][nameVariant] — bucket 0=2stops 1=3 2=4-5 3=6-7 4=8+
const titles: Record<CategoryKey, string[][]> = {
  museum: [
    ['Культурный побег на двоих', 'Двойная доза прекрасного'],
    ['Три зала — три озарения', 'Экспресс за умом'],
    ['Образование в движении', 'Экспресс-эрудит по городу'],
    ['Большой культурный поход', 'Шесть поводов стать умнее'],
    ['Музейный марафон', 'Всё что хотел посмотреть'],
  ],
  food: [
    ['Дуэт вкусов', 'Операция «Два кафе»'],
    ['Три причины не есть дома', 'Гастро-трио на сегодня'],
    ['Операция «Полный желудок»', 'Четыре вкуса без меню'],
    ['Большой гастрономический рейд', 'Шесть блюд и ни капли стыда'],
    ['Тест-драйв всего района', 'Всё съедобное поблизости'],
  ],
  park: [
    ['Побег на свежий воздух', 'Два парка и ни одного экрана'],
    ['Три глотка природы', 'Зелёный антидепрессант'],
    ['Кислород в четырёх точках', 'Зелёный маршрут побега'],
    ['Охота за тишиной', 'Шесть аллей для перезагрузки'],
    ['Большая лесная авантюра', 'Весь город как один сад'],
  ],
  entertainment: [
    ['Дубль два: веселье', 'Два места — один праздник'],
    ['Трижды весело и немного шумно', 'Острые ощущения по расписанию'],
    ['Праздник посреди рабочей недели', 'Четыре повода кричать от радости'],
    ['Адреналин по карте города', 'Шесть поводов забыть о работе'],
    ['Мегавечер без объяснений', 'Всё самое безумное рядом'],
  ],
  landmark: [
    ['Маленькое открытие города', 'Два места с историей'],
    ['Три легенды в один день', 'История на трёх углах'],
    ['Туристическая вылазка', 'Четыре фото для потомков'],
    ['Штурм достопримечательностей', 'Шесть точек с историей'],
    ['Полный обход старого центра', 'Всё с историей за один день'],
  ],
  mixed: [
    ['Экспромт на двух ногах', 'Случайный маршрут на удачу'],
    ['Маршрут «Доверяй интуиции»', 'Три разных — один кайф'],
    ['Сборная солянка по городу', 'Четыре места без объяснений'],
    ['Всё сразу и побольше', 'Шесть поводов выйти из дома'],
    ['Грандиозная вылазка', 'День как у нормальных людей'],
  ],
}

const taglines: Record<CategoryKey, string[]> = {
  museum: [
    'Культура сама себя не посмотрит.',
    'Стать немного умнее — план на сегодня.',
    'Экскурсия по собственному расписанию.',
    'Образование идёт туда, куда идёшь ты.',
  ],
  food: [
    'Желудок сам себя не накормит.',
    'Гастрономическая разведка на месте.',
    'Пробуем всё — жалеем ни о чём.',
    'Хорошая еда — лучший маршрут.',
  ],
  park: [
    'Свежий воздух по требованию.',
    'Природа ждёт прямо за углом.',
    'Зелень, тишина и ни одного дедлайна.',
    'Лучший антидепрессант — ноги в движении.',
  ],
  entertainment: [
    'Веселье было запланировано заранее.',
    'Сегодня всё разрешено.',
    'Праздник без повода — лучший повод.',
    'Острые ощущения по карте города.',
  ],
  landmark: [
    'Город знает больше, чем кажется.',
    'История прямо под ногами.',
    'Каждый угол — отдельная легенда.',
    'Прогулка, которую не забудешь.',
  ],
  mixed: [
    'Без плана — самый честный план.',
    'Разные места, один отличный день.',
    'Собственный маршрут по собственным правилам.',
    'Всё интересное — уже на карте.',
  ],
}

export function generatePersonalRouteName(stops: RouteStop[]): {
  tagline: string
  title: string
} {
  const category = getDominantCategory(stops)
  const bucket = getCountBucket(stops.length)
  const hash = hashStops(stops)

  const titleVariants = titles[category][bucket]
  const taglineVariants = taglines[category]

  return {
    tagline: taglineVariants[hash % taglineVariants.length],
    title: titleVariants[hash % titleVariants.length],
  }
}

function getDominantCategory(stops: RouteStop[]): CategoryKey {
  const counts: Partial<Record<PointCategory, number>> = {}
  for (const stop of stops) {
    counts[stop.category] = (counts[stop.category] ?? 0) + 1
  }

  let maxCount = 0
  let dominant: PointCategory | null = null
  let hasTie = false

  for (const [cat, count] of Object.entries(counts) as [PointCategory, number][]) {
    if (count > maxCount) {
      maxCount = count
      dominant = cat
      hasTie = false
    } else if (count === maxCount) {
      hasTie = true
    }
  }

  return hasTie || !dominant ? 'mixed' : dominant
}

function getCountBucket(count: number): number {
  if (count <= 2) return 0
  if (count === 3) return 1
  if (count <= 5) return 2
  if (count <= 7) return 3
  return 4
}

// Deterministic but varied hash over stop IDs
function hashStops(stops: RouteStop[]): number {
  let h = 0
  for (const stop of stops) {
    for (let i = 0; i < stop.id.length; i++) {
      h = Math.imul(h, 31) + stop.id.charCodeAt(i)
    }
  }
  return Math.abs(h)
}
