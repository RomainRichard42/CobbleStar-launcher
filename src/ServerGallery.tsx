import { useEffect, useState } from 'react'
import { ExternalLink, Pause, Play } from 'lucide-react'
import eevee from './assets/home-eevee.webp'
import tentacool from './assets/home-tentacool.webp'
import spawn from './assets/spawn-poster.webp'
import spawnMovie from './assets/spawn-travelling.webm'

const scenes = [
  { name: 'Évoli Star', detail: 'Collection Star', picture: eevee, link: '/wiki/pokedex/eevee/', action: 'Fiche d’Évoli' },
  { name: 'La place du spawn', detail: 'CobbleStar', picture: spawn, link: '/wiki/welcome/', action: 'Guide des premiers pas', movie: spawnMovie },
  { name: 'Tentacool', detail: 'Au bord de l’eau', picture: tentacool, link: '/wiki/pokedex/tentacool/', action: 'Fiche de Tentacool' },
]

export function ServerGallery({ open }: { open: (path: string) => void }) {
  const [index, select] = useState(0)
  const [paused, setPaused] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const scene = scenes[index]
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setPaused(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => select(i => (i + 1) % scenes.length), scene.movie ? 5500 : 10000)
    return () => window.clearTimeout(timer)
  }, [index, paused, scene.movie])
  return <section className="field-gallery" aria-label="Carnet de terrain">
    <div className="field-scene">
      <div key={scene.name} className="field-photo">
        <img className="landscape" src={scene.picture} alt="" />
        {scene.movie && !paused && <video src={scene.movie} poster={scene.picture} autoPlay playsInline muted aria-hidden="true" />}
      </div>
      <div className="field-mast"><span>Carnet de terrain</span>
        <button type="button" aria-label={paused ? 'Lire le diaporama' : 'Mettre le diaporama en pause'} onClick={() => setPaused(!paused)}>
          {paused ? <Play /> : <Pause />}
        </button>
      </div>
      <div className="field-caption">
        <p>{scene.detail}</p><h1>{scene.name}</h1>
        <button onClick={() => open(scene.link)}>{scene.action}<ExternalLink /></button>
      </div>
    </div>
    <nav className="field-filmstrip" aria-label="Prises de vue du serveur">
      {scenes.map((item, i) => <button key={item.name} aria-pressed={i === index}
        onClick={() => { select(i); setPaused(true) }}>
        <img src={item.picture} alt="" /><span>{item.name}</span>
      </button>)}
    </nav>
  </section>
}
