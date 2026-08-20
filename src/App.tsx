import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, CircleUserRound, Copy, ExternalLink, Minus, Play, Settings, X } from 'lucide-react'
import { launcherConfig } from './config'
import { fallbackNews, type LauncherNews } from './data/news'
import logo from './assets/cobblestar-logo.png'
import lakeside from './assets/cobblemon-lakeside.webp'
import team from './assets/cobblemon-team.webp'

type LaunchState = 'idle' | 'checking' | 'ready' | 'running'
type MinecraftAccount = { id: string; name: string; skinUrl?: string; skinData?: string }
type AuthDialog = { mode: 'device'; userCode: string; verificationUri: string; message: string } | { mode: 'error'; message: string } | null
type UpdateStatus = { state: 'checking' } | { state: 'available'; version: string } | { state: 'downloading'; version: string; percent: number } | { state: 'downloaded'; version: string } | { state: 'current'; version: string } | { state: 'error'; message: string }

function PlayerHead({ skin, name }: { skin: string; name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d'); if (!context) return
    const image = new Image()
    image.onload = () => { context.clearRect(0, 0, 8, 8); context.drawImage(image, 8, 8, 8, 8, 0, 0, 8, 8); if (image.height >= 64) context.drawImage(image, 40, 8, 8, 8, 0, 0, 8, 8) }
    image.src = skin
  }, [skin])
  return <canvas className="account-avatar" ref={canvasRef} width={8} height={8} aria-label={`Tête de ${name}`} />
}

const displayDate = (value: string) => new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(value)).replace('.', '').toUpperCase()
const newsImage = (item: LauncherNews) => item.image ? item.image.startsWith('http') ? item.image : `https://cobblestar-mc.fr${item.image}` : item.id === 'launcher' ? team : lakeside

export function App() {
  const [launchState, setLaunchState] = useState<LaunchState>('idle')
  const [progress, setProgress] = useState(0)
  const [gamePhase, setGamePhase] = useState('Préparation du jeu…')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [memory, setMemory] = useState<number>(launcherConfig.defaults.memoryMb)
  const [copied, setCopied] = useState(false)
  const [account, setAccount] = useState<MinecraftAccount | null>(null)
  const [authenticating, setAuthenticating] = useState(false)
  const [authDialog, setAuthDialog] = useState<AuthDialog>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [booting, setBooting] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [news, setNews] = useState<LauncherNews[]>(fallbackNews)
  const [selectedNews, setSelectedNews] = useState<LauncherNews | null>(null)

  useEffect(() => {
    const startedAt = Date.now()
    void Promise.all([window.cobblestar?.getAccount().then(setAccount), window.cobblestar?.getSettings().then((settings) => setMemory(settings.memoryMb))]).finally(() => {
      window.setTimeout(() => setBooting(false), Math.max(0, 650 - (Date.now() - startedAt)))
    })
    void window.cobblestar?.getNews().then((result) => {
      const published = result.content.articles.filter((item) => item.published)
      if (published.length) setNews(published)
    }).catch(() => undefined)
    const removeDeviceCodeListener = window.cobblestar?.onDeviceCode((payload) => setAuthDialog({ mode: 'device', ...payload }))
    const removeUpdateListener = window.cobblestar?.onUpdateStatus(setUpdateStatus)
    const removeGameListener = window.cobblestar?.onGameStatus((status) => {
      setGamePhase(status.phase); if (typeof status.progress === 'number') setProgress(status.progress)
      if (status.state === 'preparing') setLaunchState('checking')
      if (status.state === 'running') setLaunchState('running')
      if (status.state === 'stopped') setLaunchState('ready')
      if (status.state === 'error') { setLaunchState('idle'); setAuthDialog({ mode: 'error', message: status.message ?? status.phase }) }
    })
    return () => { removeDeviceCodeListener?.(); removeUpdateListener?.(); removeGameListener?.() }
  }, [])

  const orderedNews = useMemo(() => [...news].sort((a, b) => Number(b.featured) - Number(a.featured) || b.publishedAt.localeCompare(a.publishedAt)), [news])
  const featured = orderedNews[0] ?? fallbackNews[0]
  const serverAddress = `${launcherConfig.server.host}:${launcherConfig.server.port}`
  const busy = launchState === 'checking' || launchState === 'running'

  async function handleAccount() {
    if (!window.cobblestar) return setAuthDialog({ mode: 'error', message: 'La connexion Microsoft fonctionne uniquement dans l’application CobbleStar.' })
    if (account) { await window.cobblestar.logoutMicrosoft(); setAccount(null); return }
    setAuthenticating(true); const result = await window.cobblestar.loginMicrosoft(); setAuthenticating(false)
    if (result.ok) { setAccount(result.account); setAuthDialog(null) } else setAuthDialog({ mode: 'error', message: result.message })
  }

  async function start() {
    if (busy) return
    if (!account) return void handleAccount()
    setProgress(0); setLaunchState('checking')
    const result = await window.cobblestar?.startGame()
    if (result && !result.ok) { setLaunchState('idle'); setAuthDialog({ mode: 'error', message: result.message }) }
  }

  function copyAddress() {
    void navigator.clipboard?.writeText(serverAddress); setCopied(true); window.setTimeout(() => setCopied(false), 1300)
  }

  return <main className="launcher-shell">
    {(booting || installing) && <div className="boot-splash" role="status"><img src={logo} alt=""/><div className="boot-bar"><i/></div><small>{installing ? 'INSTALLATION DE LA MISE À JOUR…' : 'OUVERTURE DU LAUNCHER…'}</small></div>}

    <header className="titlebar">
      <div className="brand-mini"><img src={logo} alt=""/><div><strong>COBBLESTAR</strong><small>LAUNCHER OFFICIEL</small></div></div>
      <nav><button className="nav-active">Jouer</button><button onClick={() => window.cobblestar?.openNewsSite()}>Actualités <ExternalLink size={12}/></button><button onClick={() => setSettingsOpen(true)}><Settings size={13}/> Paramètres</button></nav>
      <div className="window-actions"><button aria-label="Réduire" onClick={() => window.cobblestar?.minimize()}><Minus size={15}/></button><button aria-label="Fermer" onClick={() => window.cobblestar?.close()}><X size={16}/></button></div>
    </header>

    <section className="workspace">
      <button className={`headline accent-${featured.accent}`} onClick={() => setSelectedNews(featured)}>
        <img src={newsImage(featured)} alt=""/><span className="headline-shade"/>
        <div className="headline-copy"><small>{featured.category} · {displayDate(featured.publishedAt)}</small><h1>{featured.title}</h1><p>{featured.excerpt}</p><b>Lire l’annonce <ChevronRight size={15}/></b></div>
        <em>À LA UNE</em>
      </button>

      <aside className="play-dock">
        <div className="dock-title"><span>PRÊT À JOUER</span><small>MINECRAFT {launcherConfig.minecraftVersion} · FABRIC</small></div>
        <button className="account-line" onClick={handleAccount} disabled={authenticating}>
          {account?.skinData ? <PlayerHead skin={account.skinData} name={account.name}/> : <span className="account-placeholder"><CircleUserRound size={22}/></span>}
          <span><small>{account ? 'COMPTE CONNECTÉ' : 'COMPTE MICROSOFT'}</small><strong>{account?.name ?? 'Se connecter'}</strong></span><ChevronRight size={16}/>
        </button>
        <button className="server-line" onClick={copyAddress}><span className="online-dot"/><span><small>SERVEUR</small><strong>{serverAddress}</strong></span><span>{copied ? '✓' : <Copy size={15}/>}</span></button>
        <div className="install-state">
          {launchState === 'checking' || updateStatus?.state === 'downloading' ? <><div><i style={{ width: `${updateStatus?.state === 'downloading' ? updateStatus.percent : progress}%` }}/></div><span>{updateStatus?.state === 'downloading' ? `Mise à jour du launcher · ${updateStatus.percent}%` : `${gamePhase} · ${progress}%`}</span></> : <><b>{updateStatus?.state === 'current' ? '✓ À JOUR' : launchState === 'running' ? '● JEU OUVERT' : '✓ INSTALLATION VÉRIFIÉE'}</b><span>Le modpack est contrôlé avant chaque lancement.</span></>}
        </div>
        {updateStatus?.state === 'downloaded' ? <button className="update-button" onClick={() => { setInstalling(true); window.setTimeout(() => window.cobblestar?.installUpdate(), 350) }}>Installer la version {updateStatus.version}</button> : <button className="play-button" onClick={() => void start()} disabled={busy}><span><Play size={20} fill="currentColor"/></span><div><small>{!account ? 'CONNEXION REQUISE' : busy ? gamePhase : 'LANCER COBBLESTAR'}</small><strong>{!account ? 'SE CONNECTER' : launchState === 'running' ? 'JEU OUVERT' : launchState === 'checking' ? `${progress}%` : 'JOUER'}</strong></div><ChevronRight size={22}/></button>}
      </aside>

      <section className="news-strip"><header><div><small>JOURNAL DU SERVEUR</small><h2>Dernières nouvelles</h2></div><button onClick={() => window.cobblestar?.openNewsSite()}>Tout voir <ChevronRight size={14}/></button></header><div>{orderedNews.slice(0, 3).map((item, index) => <button key={item.id} className={`news-row accent-${item.accent}`} onClick={() => setSelectedNews(item)}><span>{String(index + 1).padStart(2, '0')}</span><div><small>{item.category} · {displayDate(item.publishedAt)}</small><b>{item.title}</b><p>{item.excerpt}</p></div><ChevronRight size={16}/></button>)}</div></section>
    </section>

    <footer className="launcher-foot"><span>COBBLESTAR LAUNCHER</span><span>Java automatique</span><span>Modpack synchronisé</span><b>{updateStatus?.state === 'current' ? `v${updateStatus.version}` : 'CANAL STABLE'}</b></footer>

    {selectedNews && <div className="modal-backdrop" onMouseDown={() => setSelectedNews(null)}><article className={`news-reader accent-${selectedNews.accent}`} onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelectedNews(null)}><X/></button><div className="reader-cover"><img src={newsImage(selectedNews)} alt=""/><span/></div><div className="reader-copy"><small>{selectedNews.category} · {displayDate(selectedNews.publishedAt)}</small><h2>{selectedNews.title}</h2><p className="reader-lead">{selectedNews.excerpt}</p>{selectedNews.content.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></article></div>}

    {settingsOpen && <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}><section className="settings-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSettingsOpen(false)}><X/></button><small>PARAMÈTRES DU JEU</small><h2>Mémoire allouée</h2><p>Choisis la quantité de mémoire utilisée par Minecraft.</p><input type="range" min="2048" max="12288" step="1024" value={memory} onChange={(event) => setMemory(Number(event.target.value))}/><strong>{memory / 1024} Go</strong><div>Java 21 automatique · Dossier isolé · Fabric {launcherConfig.minecraftVersion}</div><button className="save-settings" onClick={async () => { const saved = await window.cobblestar?.saveSettings({ memoryMb: memory }); if (saved) setMemory(saved.memoryMb); setSettingsOpen(false) }}>Enregistrer</button></section></div>}

    {authDialog && <div className="modal-backdrop" onMouseDown={() => authDialog.mode === 'error' && setAuthDialog(null)}><section className="settings-modal auth-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setAuthDialog(null)}><X/></button><small>CONNEXION SÉCURISÉE</small>{authDialog.mode === 'device' ? <><h2>Connecte ton compte Microsoft</h2><p>Entre ce code sur la page Microsoft ouverte dans ton navigateur.</p><button className="device-code" onClick={() => void navigator.clipboard?.writeText(authDialog.userCode)}>{authDialog.userCode} <Copy size={17}/></button><button className="save-settings" onClick={() => window.cobblestar?.openExternal(authDialog.verificationUri)}>Ouvrir Microsoft</button></> : <><h2>Une erreur est survenue</h2><p>{authDialog.message}</p><button className="save-settings" onClick={() => setAuthDialog(null)}>Fermer</button></>}</section></div>}
  </main>
}
