import { useState, type ChangeEvent, type FormEvent } from 'react'

import {
  adminService,
  type AdminPointMediaItem,
  type MediaType,
} from '@/shared/api/adminService'

interface PointMediaPanelProps {
  pointId: number
  media: AdminPointMediaItem[]
  onChanged: () => void
}

export function PointMediaPanel({ pointId, media, onChanged }: PointMediaPanelProps) {
  const [file, setFile] = useState<File | null>(null)
  const [type, setType] = useState<MediaType>('PHOTO')
  const [sortOrder, setSortOrder] = useState('0')
  const [transcript, setTranscript] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null
    setFile(next)
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setError(null)
    setIsUploading(true)
    try {
      await adminService.uploadPointMedia(pointId, file, {
        type,
        sortOrder: Number(sortOrder) || 0,
        transcript: transcript.trim() || undefined,
      })
      setFile(null)
      setSortOrder('0')
      setTranscript('')
      // Reset file input by recreating it via key — simpler than refs here
      const input = document.getElementById('mp-file') as HTMLInputElement | null
      if (input) input.value = ''
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить файл.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="admin-media">
      <h4 className="admin-section__subtitle">Медиа-материалы</h4>

      {media.length === 0 ? (
        <p className="admin-media__empty">Пока ничего не загружено.</p>
      ) : (
        <ul className="admin-media__list">
          {media
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((item) => (
              <MediaItem
                key={item.id}
                item={item}
                pointId={pointId}
                onChanged={onChanged}
              />
            ))}
        </ul>
      )}

      <form className="admin-form admin-media__upload" onSubmit={handleUpload}>
        <h5 className="admin-media__upload-title">Загрузить новый файл</h5>
        <div className="admin-form__row admin-form__row--double">
          <div>
            <label className="admin-form__label" htmlFor="mp-type">Тип</label>
            <select
              className="admin-form__select"
              id="mp-type"
              onChange={(e) => setType(e.target.value as MediaType)}
              value={type}
            >
              <option value="PHOTO">PHOTO — фотография</option>
              <option value="AUDIO">AUDIO — аудиогид</option>
              <option value="VIDEO">VIDEO — видео</option>
            </select>
          </div>
          <div>
            <label className="admin-form__label" htmlFor="mp-order">Порядок</label>
            <input
              className="admin-form__input"
              id="mp-order"
              min={0}
              onChange={(e) => setSortOrder(e.target.value)}
              type="number"
              value={sortOrder}
            />
          </div>
        </div>
        <div className="admin-form__row">
          <label className="admin-form__label" htmlFor="mp-file">Файл</label>
          <input
            className="admin-form__input"
            id="mp-file"
            onChange={handleFileChange}
            required
            type="file"
          />
        </div>
        {type === 'AUDIO' ? (
          <div className="admin-form__row">
            <label className="admin-form__label" htmlFor="mp-transcript">
              Транскрипт (текст аудио)
            </label>
            <textarea
              className="admin-form__textarea"
              id="mp-transcript"
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Добро пожаловать…"
              value={transcript}
            />
          </div>
        ) : null}
        {error ? (
          <div className="admin-form__status admin-form__status--error">{error}</div>
        ) : null}
        <button
          className="admin-btn admin-btn--primary"
          disabled={!file || isUploading}
          type="submit"
        >
          {isUploading ? 'Загружаем…' : 'Загрузить'}
        </button>
      </form>
    </div>
  )
}

interface MediaItemProps {
  item: AdminPointMediaItem
  pointId: number
  onChanged: () => void
}

function MediaItem({ item, pointId, onChanged }: MediaItemProps) {
  const [isEditingTranscript, setIsEditingTranscript] = useState(false)
  const [transcriptDraft, setTranscriptDraft] = useState(item.transcript ?? '')
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSaveTranscript() {
    setError(null)
    setIsWorking(true)
    try {
      await adminService.patchPointMedia(pointId, item.id, transcriptDraft)
      setIsEditingTranscript(false)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить транскрипт.')
    } finally {
      setIsWorking(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Удалить этот медиа-файл?')) return
    setError(null)
    setIsWorking(true)
    try {
      await adminService.deletePointMedia(pointId, item.id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить файл.')
      setIsWorking(false)
    }
  }

  return (
    <li className="admin-media__item">
      <div className="admin-media__head">
        <span className="admin-media__badge">{item.type}</span>
        <span className="admin-media__order">#{item.sortOrder}</span>
        <a
          className="admin-media__link"
          href={item.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          Открыть →
        </a>
        <button
          className="admin-btn admin-btn--danger admin-btn--small"
          disabled={isWorking}
          onClick={handleDelete}
          type="button"
        >
          Удалить
        </button>
      </div>

      {item.type === 'AUDIO' || item.transcript ? (
        <div className="admin-media__transcript">
          {isEditingTranscript ? (
            <>
              <textarea
                className="admin-form__textarea"
                onChange={(e) => setTranscriptDraft(e.target.value)}
                value={transcriptDraft}
              />
              <div className="admin-confirm__actions">
                <button
                  className="admin-btn admin-btn--ghost admin-btn--small"
                  disabled={isWorking}
                  onClick={() => {
                    setIsEditingTranscript(false)
                    setTranscriptDraft(item.transcript ?? '')
                  }}
                  type="button"
                >
                  Отмена
                </button>
                <button
                  className="admin-btn admin-btn--primary admin-btn--small"
                  disabled={isWorking}
                  onClick={handleSaveTranscript}
                  type="button"
                >
                  {isWorking ? 'Сохраняем…' : 'Сохранить'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="admin-media__transcript-text">
                {item.transcript || <em>Транскрипт не задан</em>}
              </p>
              <button
                className="admin-btn admin-btn--ghost admin-btn--small"
                onClick={() => setIsEditingTranscript(true)}
                type="button"
              >
                Изменить транскрипт
              </button>
            </>
          )}
        </div>
      ) : null}

      {error ? (
        <div className="admin-form__status admin-form__status--error">{error}</div>
      ) : null}
    </li>
  )
}
