import { useEffect, useRef, useState, type FormEvent } from 'react'
import * as L from 'leaflet'

import {
  createLeafletMap,
  createOpenStreetMapLayer,
} from '@/features/route-map/lib/leaflet-map'
import type { CreatePointParams, PatchPointParams } from '@/shared/api/adminService'
import type { ApiCategory, ApiPointDetail } from '@/shared/api/mappers'

interface PointFormProps {
  initial?: ApiPointDetail
  categories: ApiCategory[]
  onCancel: () => void
  onSubmit: (
    values: CreatePointParams | PatchPointParams,
  ) => Promise<void>
  submitLabel: string
}

const defaultCenter = { lat: 55.751244, lng: 37.618423 }

export function PointForm({
  initial,
  categories,
  onCancel,
  onSubmit,
  submitLabel,
}: PointFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [shortDescription, setShortDescription] = useState(initial?.shortDescription ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [categoryId, setCategoryId] = useState<number | ''>(initial?.categoryId ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [latitude, setLatitude] = useState(
    String(initial?.coordinates?.latitude ?? defaultCenter.lat),
  )
  const [longitude, setLongitude] = useState(
    String(initial?.coordinates?.longitude ?? defaultCenter.lng),
  )
  const [visitTime, setVisitTime] = useState(String(initial?.visitTime ?? 30))
  const [workingHours, setWorkingHours] = useState(initial?.workingHours ?? '')
  const [active, setActive] = useState<boolean>(initial?.active ?? true)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fall back to first category id if categories arrive after mount.
  useEffect(() => {
    if (categoryId === '' && categories.length > 0 && !initial) {
      setCategoryId(categories[0].id)
    }
  }, [categories, categoryId, initial])

  // ── Map picker ────────────────────────────────────────────────────────────

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)

  useEffect(() => {
    const container = mapContainerRef.current
    if (!container || mapRef.current) return

    const startLat = Number.parseFloat(latitude) || defaultCenter.lat
    const startLng = Number.parseFloat(longitude) || defaultCenter.lng
    const map = createLeafletMap(container, { lat: startLat, lng: startLng }, 12)
    createOpenStreetMapLayer().addTo(map)
    mapRef.current = map

    const marker = L.marker([startLat, startLng], { draggable: true }).addTo(map)
    markerRef.current = marker

    marker.on('moveend', () => {
      const ll = marker.getLatLng()
      setLatitude(ll.lat.toFixed(6))
      setLongitude(ll.lng.toFixed(6))
    })
    map.on('click', (event) => {
      marker.setLatLng(event.latlng)
      setLatitude(event.latlng.lat.toFixed(6))
      setLongitude(event.latlng.lng.toFixed(6))
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function syncMarker() {
    const lat = Number.parseFloat(latitude)
    const lng = Number.parseFloat(longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng) && markerRef.current && mapRef.current) {
      markerRef.current.setLatLng([lat, lng])
      mapRef.current.setView([lat, lng], mapRef.current.getZoom())
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const lat = Number.parseFloat(latitude)
    const lng = Number.parseFloat(longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError('Координаты заданы некорректно.')
      return
    }
    if (categoryId === '') {
      setError('Выберите категорию.')
      return
    }

    const visitTimeValue = visitTime ? Number(visitTime) : undefined
    const values: CreatePointParams = {
      title: title.trim(),
      description: description.trim() || undefined,
      shortDescription: shortDescription.trim() || undefined,
      categoryId: Number(categoryId),
      address: address.trim() || undefined,
      coordinates: { latitude: lat, longitude: lng },
      visitTime: visitTimeValue,
      workingHours: workingHours.trim() || undefined,
      active,
    }

    setIsSubmitting(true)
    try {
      await onSubmit(values)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить точку.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <div className="admin-form__row">
        <label className="admin-form__label" htmlFor="pf-title">Название</label>
        <input
          className="admin-form__input"
          id="pf-title"
          maxLength={255}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Красная площадь"
          required
          value={title}
        />
      </div>

      <div className="admin-form__row">
        <label className="admin-form__label" htmlFor="pf-short">Краткое описание</label>
        <input
          className="admin-form__input"
          id="pf-short"
          maxLength={255}
          onChange={(e) => setShortDescription(e.target.value)}
          placeholder="Главная площадь Москвы"
          value={shortDescription}
        />
      </div>

      <div className="admin-form__row">
        <label className="admin-form__label" htmlFor="pf-desc">Полное описание</label>
        <textarea
          className="admin-form__textarea"
          id="pf-desc"
          maxLength={5000}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Объект ЮНЕСКО…"
          value={description}
        />
      </div>

      <div className="admin-form__row admin-form__row--double">
        <div>
          <label className="admin-form__label" htmlFor="pf-cat">Категория</label>
          <select
            className="admin-form__select"
            id="pf-cat"
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}
            required
            value={categoryId}
          >
            <option value="">— выберите —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.slug})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="admin-form__label" htmlFor="pf-visit">Время посещения (мин)</label>
          <input
            className="admin-form__input"
            id="pf-visit"
            min={1}
            onChange={(e) => setVisitTime(e.target.value)}
            placeholder="30"
            type="number"
            value={visitTime}
          />
        </div>
      </div>

      <div className="admin-form__row">
        <label className="admin-form__label" htmlFor="pf-addr">Адрес</label>
        <input
          className="admin-form__input"
          id="pf-addr"
          maxLength={255}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Москва, Красная площадь"
          value={address}
        />
      </div>

      <div className="admin-form__row">
        <label className="admin-form__label" htmlFor="pf-hours">Часы работы</label>
        <input
          className="admin-form__input"
          id="pf-hours"
          maxLength={255}
          onChange={(e) => setWorkingHours(e.target.value)}
          placeholder="Круглосуточно"
          value={workingHours}
        />
      </div>

      <div className="admin-form__row">
        <label className="admin-form__checkbox">
          <input
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            type="checkbox"
          />
          <span>Активна (видна в поиске пользователей)</span>
        </label>
      </div>

      <div className="admin-form__row">
        <label className="admin-form__label">Координаты</label>
        <p className="admin-form__map-hint">
          Перетащите маркер или кликните по карте.
        </p>
        <div className="admin-form__map" ref={mapContainerRef} />
      </div>

      <div className="admin-form__row admin-form__row--double">
        <div>
          <label className="admin-form__label" htmlFor="pf-lat">Широта</label>
          <input
            className="admin-form__input"
            id="pf-lat"
            onBlur={syncMarker}
            onChange={(e) => setLatitude(e.target.value)}
            required
            step="0.000001"
            type="number"
            value={latitude}
          />
        </div>
        <div>
          <label className="admin-form__label" htmlFor="pf-lng">Долгота</label>
          <input
            className="admin-form__input"
            id="pf-lng"
            onBlur={syncMarker}
            onChange={(e) => setLongitude(e.target.value)}
            required
            step="0.000001"
            type="number"
            value={longitude}
          />
        </div>
      </div>

      {error ? (
        <div className="admin-form__status admin-form__status--error">{error}</div>
      ) : null}

      <div className="admin-confirm__actions">
        <button
          className="admin-btn admin-btn--ghost"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          Отмена
        </button>
        <button
          className="admin-btn admin-btn--primary"
          disabled={isSubmitting || !title.trim() || categoryId === ''}
          type="submit"
        >
          {isSubmitting ? 'Сохраняем…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
