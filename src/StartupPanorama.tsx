import { memo, useEffect, useState } from 'react'
import riding from './assets/riding.webp'
import lake from './assets/cobblemon-lakeside.webp'
import spawn from './assets/spawn-travelling.webm'
import spawnPoster from './assets/spawn-poster.webp'

const scenes = [
  { title: 'En vol avec Ptéra', image: riding },
  { title: 'La place du spawn', image: spawnPoster, video: spawn },
  { title: 'Au bord du lac', image: lake },
]

export const StartupPanorama = memo(function StartupPanorama() {
  const [index, setIndex] = useState(0)
  const [still, setStill] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => { setStill(media.matches); setIndex(0) }
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  useEffect(() => {
    if (still) return
    const timer = window.setTimeout(() => setIndex(i => (i + 1) % scenes.length), index === 1 ? 5400 : 6200)
    return () => window.clearTimeout(timer)
  }, [index, still])
  const scene = scenes[index]
  return <figure className="startup-panorama" aria-label="Galerie CobbleStar">
    <div key={index} className="startup-shot">
      <img src={scene.image} alt="" />
      {scene.video && !still && <video src={scene.video} poster={scene.image} autoPlay muted playsInline aria-hidden="true" />}
    </div>
    <figcaption><span className="panorama-rule" aria-hidden="true" />{scene.title}</figcaption>
    <span className="panorama-count" aria-hidden="true">0{index + 1}<i />03</span>
  </figure>
})
