import { useEffect, useRef, useState } from 'react'
import replay from './assets/spawn-travelling.webm'
import spawn from './assets/horizons-spawn.webp'
import nebelia from './assets/horizons-nebelia.webp'
import pokemon from './assets/horizons-pokemon.webp'

const scenes = [
  { name: 'Spawn central', image: spawn, description: 'L’allée du spawn mène au centre de CobbleStar.' },
  { name: 'Nébélia', image: nebelia, description: 'Un joueur explore les berges d’une rivière à Nébélia.' },
  { name: 'Pokémon', image: pokemon, description: 'Deux Dracolosse sur la place du spawn.' },
] as const

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
  const [hasPlayed, setHasPlayed] = useState(false)
  const [scene, setScene] = useState(0)
  const current = scenes[scene]
  useEffect(() => {
    const video = ref.current
    if (!video || failed) return
    const sync = () => {
      if (scene !== 0 || !enabled || suspended || document.hidden) video.pause()
      else void video.play().catch(() => {})
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => { document.removeEventListener('visibilitychange', sync); video.pause() }
  }, [enabled, suspended, failed, scene])

  return <figure className="league-film" aria-label="Captures du serveur CobbleStar">
    <div className="league-film-frame">
      <img className={scene === 0 ? '' : 'horizons-inset'} src={current.image} alt={current.description} />
      {!failed && <video className={scene === 0 && hasPlayed ? 'is-shown' : ''} ref={ref} src={replay} poster={spawn} muted playsInline loop preload="metadata"
        aria-label="Travelling silencieux du spawn CobbleStar"
        onError={() => setFailed(true)}
        onPlaying={() => { setPlaying(true); setHasPlayed(true) }} onPause={() => setPlaying(false)} />}
      {!failed && scene === 0 && <button className="league-film-hit-area" type="button"
        aria-label={playing ? 'Mettre le film en pause' : 'Lire le film'} disabled={suspended}
        onClick={() => {
          const video = ref.current
          if (!video) return
          setEnabled(video.paused)
          if (video.paused) void video.play().catch(() => {})
          else video.pause()
        }} />}
    </div>
    <div className="astral-film-label">En jeu</div>
    <figcaption><strong>{current.name}</strong></figcaption>
    <div className="horizons-scenes" role="group" aria-label="Changer de vue">
      {scenes.map((item, index) => <button key={item.name} aria-pressed={scene === index} onClick={() => setScene(index)}>
        <img src={item.image} alt="" /><span>{item.name}</span>
      </button>)}
    </div>
  </figure>
}
