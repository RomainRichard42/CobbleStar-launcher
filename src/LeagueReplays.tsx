import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import replay from './assets/league-replays.webm'
import poster from './assets/league-replays.webp'

const chapters = ['Au bord de l’eau', 'Prendre de la hauteur', 'Au cœur du raid']
const chapterSeconds = 6

export function useReplayAutoplay() {
  const [override, setOverride] = useState<boolean | null>(() => {
    try {
      const value = localStorage.getItem('league-replay-autoplay')
      return value === null ? null : value === 'true'
    } catch { return null }
  })
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReduced(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  function setEnabled(value: boolean) {
    setOverride(value)
    try { localStorage.setItem('league-replay-autoplay', String(value)) } catch { /* Session preference still applies. */ }
  }
  return [override ?? !reduced, setEnabled] as const
}

export function LeagueReplays({ suspended, enabled, setEnabled }: {
  suspended: boolean; enabled: boolean; setEnabled: (value: boolean) => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [chapter, setChapter] = useState(0)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const video = ref.current
    if (!video || failed) return
    const sync = () => {
      if (!enabled || suspended || document.hidden) video.pause()
      else void video.play().catch(() => {})
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => { document.removeEventListener('visibilitychange', sync); video.pause() }
  }, [enabled, suspended, failed])

  return <figure className="league-film" aria-label="Replays CobbleStar">
    <div className="league-film-frame">
      <img src={poster} alt="" />
      {!failed && <video ref={ref} src={replay} poster={poster} muted playsInline loop preload="metadata"
        aria-label="Rencontres, montures et raid sur CobbleStar"
        onLoadedMetadata={() => setReady(true)} onError={() => { setFailed(true); setChapter(0) }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={e => setChapter(Math.min(chapters.length - 1, Math.floor(e.currentTarget.currentTime / chapterSeconds)))} />}
    </div>
    {!failed && <nav className="league-chapters" aria-label="Chapitres du film">
      {chapters.map((name, i) => <button key={name} aria-label={name} title={name} aria-pressed={chapter === i} disabled={!ready}
        onClick={() => { if (ref.current) { ref.current.currentTime = i * chapterSeconds; setChapter(i) } }}>0{i + 1}</button>)}
    </nav>}
    <figcaption><div><small>{failed ? 'Collection Star' : `Replays CobbleStar · 0${chapter + 1} / 03`}</small>
      <strong>{failed ? 'Évoli Star' : chapters[chapter]}</strong></div>
      {!failed && <button aria-label={playing ? 'Mettre le film en pause' : 'Lire le film'}
        onClick={() => {
          if (playing) setEnabled(false)
          else { setEnabled(true); void ref.current?.play().catch(() => {}) }
        }}>{playing ? <Pause /> : <Play />}{playing ? 'Pause' : 'Lire'}</button>}
    </figcaption>
  </figure>
}
