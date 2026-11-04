import { useEffect, useState } from 'react'
import { App, Titlebar } from './App'
import logo from './assets/cobblestar-logo.png'
import './startup.css'

export function Startup() {
  const api = window.cobblestar
  const [home, setHome] = useState(!api)
  const [update, setUpdate] = useState<UpdateStatus | null>(null)
  const [prompt, setPrompt] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!api) return
    let active = true
    let receivedEvent = false
    function receive(status: UpdateStatus) {
      if (!active) return
      setUpdate(status)
      if (status.state !== 'checking') window.clearTimeout(timeout)
      if (status.state === 'current' || status.state === 'error') setHome(true)
      if (status.state === 'downloaded') setPrompt(true)
    }
    // A stalled metadata request must never strand the player before the home screen.
    const timeout = window.setTimeout(() => receive({
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

  async function install() {
    if (!api || installing) return
    setInstalling(true)
    setError('')
    try {
      const result = await api.installUpdate()
      if (!result.ok) throw new Error(result.message)
    } catch (reason) {
      setInstalling(false)
      setError(reason instanceof Error ? reason.message : 'Installation impossible.')
    }
  }

  if (home) return <App update={update} updatePrompt={prompt} setUpdatePrompt={setPrompt} />
  const downloading = update?.state === 'available' || update?.state === 'downloading'
  const ready = update?.state === 'downloaded'
  const progress = update?.state === 'downloading' ? Math.min(100, Math.max(0, update.percent)) : undefined
  const label = installing ? 'Redémarrage du launcher…' : ready ? 'Mise à jour prête'
    : downloading ? 'Téléchargement de la mise à jour…' : 'Recherche de mises à jour…'
  function continueToHome() {
    setPrompt(false)
    setHome(true)
  }
  return <main className="startup-shell">
    <Titlebar />
    <section className="startup-content" aria-label="Démarrage de CobbleStar">
      <img src={logo} alt="" width="100" height="100" />
      <h1>COBBLE<span>STAR</span></h1>
      <p role="status">{label}</p>
      {progress === undefined && !ready
        ? <span className="startup-loading" aria-hidden="true" />
        : !ready && <div className="startup-progress"><progress max="100" value={progress} aria-label="Téléchargement du launcher" /><span>{progress} %</span></div>}
      {(ready || downloading) && <small>Version {update.version}</small>}
      {error && <p role="alert">{error}</p>}
      {ready && <button className="primary" disabled={installing} onClick={() => void install()}>Installer et redémarrer</button>}
      {(ready || downloading) && <button className="secondary" disabled={installing} onClick={continueToHome}>
        {ready ? 'Plus tard' : 'Continuer vers l’accueil'}
      </button>}
    </section>
  </main>
}
