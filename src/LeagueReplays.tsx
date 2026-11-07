import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import replay from './assets/spawn-travelling.webm'
import poster from './assets/spawn-poster.webp'

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

  return <figure className="league-film" aria-label="Panorama CobbleStar">
    <div className="league-film-frame">
      <img src={poster} alt="" />
      {!failed && <video ref={ref} src={replay} poster={poster} muted playsInline loop preload="metadata"
        aria-label="Travelling silencieux du spawn CobbleStar"
        onError={() => setFailed(true)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />}
    </div>
    <div className="astral-film-label"><strong>Cobblemon</strong><span>Deux mondes à explorer</span></div>
    <figcaption><div><small>Bienvenue sur CobbleStar</small>
      <strong>Choisis ton équipe.<br /><em>Écris ton aventure.</em></strong></div>
      {!failed && <button aria-label={playing ? 'Mettre le film en pause' : 'Lire le film'}
        onClick={() => {
          if (playing) setEnabled(false)
          else { setEnabled(true); void ref.current?.play().catch(() => {}) }
        }}>{playing ? <Pause /> : <Play />}{playing ? 'Pause' : 'Lire'}</button>}
    </figcaption>
  </figure>
}
