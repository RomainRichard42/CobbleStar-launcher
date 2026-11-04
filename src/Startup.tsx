import { useCallback, useEffect, useRef, useState } from 'react'
import { App, Titlebar } from './App'
import logo from './assets/cobblestar-logo.png'
import './startup.css'

export function Startup() {
  const api = window.cobblestar
  const [home, setHome] = useState(!api)
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  const [installing, setInstalling] = useState(false)
  const attemptedVersion = useRef<string | null>(null)

  const restart = useCallback(async (version: string) => {
    if (!api || attemptedVersion.current === version) return
    attemptedVersion.current = version
    setInstalling(true)
    try {
      const result = await api.installUpdate()
      if (!result.ok) throw new Error(result.message)
    } catch (reason) {
      setUpdate({state: 'error', message: reason instanceof Error ? reason.message : 'Installation impossible.'})
      setInstalling(false)
      setHome(true)
    }
  }, [api])

  useEffect(() => {
    if (!home && update?.state === 'downloaded') void restart(update.version)
  }, [home, update, restart])

  useEffect(() => {
    if (!api) return
    let active = true
    let receivedEvent = false
    function receive(status: UpdateStatus) {
      if (!active) return
      setUpdate(status)
      if (status.state !== 'checking') window.clearTimeout(timeout)
      if (status.state === 'available' || status.state === 'downloading') {
        timeout = window.setTimeout(() => receive({
          state: 'error', message: 'Le téléchargement de la mise à jour ne progresse plus.',
        }), 90000)
      }
      if (status.state === 'current' || status.state === 'error') setHome(true)
      if (status.state === 'error') setInstalling(false)
    }
    // A stalled metadata request must never strand the player before the home screen.
    let timeout = window.setTimeout(() => receive({
      state: 'error', message: 'Le service de mise à jour met du temps à répondre.',
    }), 10000)
    const unsubscribe = api.onUpdateStatus(status => {
      receivedEvent = true
      receive(status)
    })
    void api.checkStartupUpdate().then(snapshot => {
      if (!receivedEvent) receive(snapshot)
    }).catch(() => receive({ state: 'error', message: 'Vérification indisponible.' }))
    return () => {
      active = false
      window.clearTimeout(timeout)
      unsubscribe()
    }
  }, [api])

  if (home && !installing) return <App update={update} restart={restart} />
  const downloading = update?.state === 'available' || update?.state === 'downloading'
  const ready = update?.state === 'downloaded'
  const progress = update?.state === 'downloading' ? Math.min(100, Math.max(0, update.percent)) : undefined
  const label = installing || ready ? 'Installation et redémarrage du launcher…'
    : downloading ? 'Téléchargement de la mise à jour…' : 'Recherche de mises à jour…'
  return <main className="startup-shell">
    <Titlebar />
    <section className="startup-content" aria-label="Démarrage de CobbleStar">
      <img src={logo} alt="" width="100" height="100" />
      <h1>COBBLE<span>STAR</span></h1>
      <p role="status">{label}</p>
      {progress === undefined
        ? <span className="startup-loading" aria-hidden="true" />
        : !ready && <div className="startup-progress"><progress max="100" value={progress} aria-label="Téléchargement du launcher" /><span>{progress} %</span></div>}
      {(ready || downloading) && <small>Version {update.version}</small>}
    </section>
  </main>
}
