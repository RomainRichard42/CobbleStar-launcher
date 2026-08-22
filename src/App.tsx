import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check, ChevronRight, CircleUserRound, Copy, ExternalLink, Globe2, Home,
  LogOut, Minus, Newspaper, Play, RotateCcw, Settings, ShieldCheck, Sparkles, X,
} from 'lucide-react'
import { launcherConfig } from './config'
import { fallbackNews, type LauncherNews } from './data/news'
import logo from './assets/cobblestar-logo.png'
import heroArt from './assets/cobblestar-hero.png'
import lakeside from './assets/cobblemon-lakeside.webp'
import team from './assets/cobblemon-team.webp'

type View = 'home' | 'news' | 'settings'
type LaunchState = 'idle' | 'checking' | 'ready' | 'running'
type MinecraftAccount = { id: string; name: string; skinUrl?: string; skinData?: string }
type AuthDialog = { mode: 'device'; userCode: string; verificationUri: string; message: string } | { mode: 'error'; message: string } | null
type UpdateStatus = { state: 'checking' } | { state: 'available'; version: string } | { state: 'downloading'; version: string; percent: number } | { state: 'downloaded'; version: string } | { state: 'current'; version: string } | { state: 'error'; message: string }

function PlayerHead({ skin, name }: { skin: string; name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    const image = new Image()
    image.onload = () => {
      context.clearRect(0, 0, 8, 8)
      context.drawImage(image, 8, 8, 8, 8, 0, 0, 8, 8)
      if (image.height >= 64) context.drawImage(image, 40, 8, 8, 8, 0, 0, 8, 8)
    }
    image.src = skin
  }, [skin])
  return <canvas className="account-avatar" ref={canvasRef} width={8} height={8} aria-label={`Tête de ${name}`} />
}

const displayDate = (value: string) => new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(value)).replace('.', '').toUpperCase()
const newsImage = (item: LauncherNews) => item.image ? item.image.startsWith('http') ? item.image : `https://cobblestar-mc.fr${item.image}` : item.id === 'launcher' ? team : lakeside

export function App() {
  const [view, setView] = useState<View>('home')
  const [launchState, setLaunchState] = useState<LaunchState>('idle')
  const [progress, setProgress] = useState(0)
  const [gamePhase, setGamePhase] = useState('Préparation du jeu…')
  const [memory, setMemory] = useState<number>(launcherConfig.defaults.memoryMb)
  const [copied, setCopied] = useState(false)
  const [account, setAccount] = useState<MinecraftAccount | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [authenticating, setAuthenticating] = useState(false)
  const [authDialog, setAuthDialog] = useState<AuthDialog>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [booting, setBooting] = useState(true)
  const [installing, setInstalling] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [repairReady, setRepairReady] = useState(false)
  const [news, setNews] = useState<LauncherNews[]>(fallbackNews)
  const [selectedNews, setSelectedNews] = useState<LauncherNews | null>(null)

  useEffect(() => {
    const startedAt = Date.now()
    void Promise.all([
      window.cobblestar?.getAccount().then(setAccount),
      window.cobblestar?.getSettings().then((settings) => setMemory(settings.memoryMb)),
    ]).finally(() => window.setTimeout(() => setBooting(false), Math.max(0, 650 - (Date.now() - startedAt))))

    void window.cobblestar?.getNews().then((result) => {
      const published = result.content.articles.filter((item) => item.published)
      if (published.length) setNews(published)
    }).catch(() => undefined)

    const removeDeviceCodeListener = window.cobblestar?.onDeviceCode((payload) => setAuthDialog({ mode: 'device', ...payload }))
    const removeUpdateListener = window.cobblestar?.onUpdateStatus(setUpdateStatus)
    const removeGameListener = window.cobblestar?.onGameStatus((status) => {
      setGamePhase(status.phase)
      if (typeof status.progress === 'number') setProgress(status.progress)
      if (status.state === 'preparing') setLaunchState('checking')
      if (status.state === 'running') setLaunchState('running')
      if (status.state === 'stopped') setLaunchState('ready')
      if (status.state === 'error') {
        setLaunchState('idle')
        setAuthDialog({ mode: 'error', message: status.message ?? status.phase })
      }
    })
    return () => { removeDeviceCodeListener?.(); removeUpdateListener?.(); removeGameListener?.() }
  }, [])

  const orderedNews = useMemo(() => [...news].sort((a, b) => Number(b.featured) - Number(a.featured) || b.publishedAt.localeCompare(a.publishedAt)), [news])
  const featured = orderedNews[0] ?? fallbackNews[0]
  const serverAddress = `${launcherConfig.server.host}:${launcherConfig.server.port}`
  const busy = launchState === 'checking' || launchState === 'running'

  async function handleAccount() {
    if (!window.cobblestar) return setAuthDialog({ mode: 'error', message: 'La connexion Microsoft fonctionne uniquement dans l’application CobbleStar.' })
    setAccountOpen(false)
    if (account) {
      await window.cobblestar.logoutMicrosoft()
      setAccount(null)
      return
    }
    setAuthenticating(true)
    const result = await window.cobblestar.loginMicrosoft()
    setAuthenticating(false)
    if (result.ok) { setAccount(result.account); setAuthDialog(null) }
    else setAuthDialog({ mode: 'error', message: result.message })
  }

  async function start() {
    if (busy) return
    if (!account) return void handleAccount()
    setProgress(0)
    setRepairReady(false)
    setLaunchState('checking')
    const result = await window.cobblestar?.startGame()
    if (result && !result.ok) {
      setLaunchState('idle')
      setAuthDialog({ mode: 'error', message: result.message })
    }
  }

  async function repairInstallation() {
    if (!window.cobblestar || repairing) return
    setRepairing(true)
    const result = await window.cobblestar.repairInstallation()
    setRepairing(false)
    if (!result.ok) return setAuthDialog({ mode: 'error', message: result.message })
    setRepairReady(true)
  }

  async function saveMemory() {
    const saved = await window.cobblestar?.saveSettings({ memoryMb: memory })
    if (saved) setMemory(saved.memoryMb)
  }

  function copyAddress() {
    void navigator.clipboard?.writeText(serverAddress)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1300)
  }

  return <main className="launcher-shell">
    {(booting || installing) && <div className="boot-splash" role="status"><img src={logo} alt=""/><div className="boot-bar"><i/></div><small>{installing ? 'INSTALLATION DE LA MISE À JOUR…' : 'OUVERTURE DU LAUNCHER…'}</small></div>}

    <header className="titlebar">
      <div className="window-brand"><img src={logo} alt=""/><strong>COBBLESTAR</strong><i/><small>LAUNCHER</small></div>
      <div className="channel"><i/> CANAL STABLE <b>{updateStatus?.state === 'current' ? `v${updateStatus.version}` : 'v0.7.1'}</b></div>
      <div className="window-actions"><button aria-label="Réduire" onClick={() => window.cobblestar?.minimize()}><Minus/></button><button aria-label="Fermer" onClick={() => window.cobblestar?.close()}><X/></button></div>
    </header>

    <aside className="sidebar">
      <div className="logo-lockup"><img src={logo} alt="Mascotte CobbleStar"/><div><b>COBBLE</b><strong>STAR</strong><small>UNE AVENTURE COBBLEMON</small></div></div>
      <nav>
        <button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}><Home/><span><small>01</small>JOUER</span></button>
        <button className={view === 'news' ? 'active' : ''} onClick={() => setView('news')}><Newspaper/><span><small>02</small>ACTUALITÉS</span>{orderedNews.length > 0 && <i>{Math.min(orderedNews.length, 9)}</i>}</button>
        <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}><Settings/><span><small>03</small>PARAMÈTRES</span></button>
      </nav>
      <div className="sidebar-links">
        <button onClick={() => window.cobblestar?.openExternal('https://cobblestar-mc.fr')}><Globe2/> SITE OFFICIEL <ExternalLink/></button>
        <button onClick={() => window.cobblestar?.openNewsSite()}><Newspaper/> JOURNAL DU SERVEUR <ExternalLink/></button>
      </div>
      <button className="account-card" onClick={() => account ? setAccountOpen(!accountOpen) : void handleAccount()} disabled={authenticating}>
        {account?.skinData ? <PlayerHead skin={account.skinData} name={account.name}/> : <span className="account-placeholder"><CircleUserRound/></span>}
        <span><small>{account ? 'COMPTE MICROSOFT' : 'CONNEXION REQUISE'}</small><b>{account?.name ?? (authenticating ? 'Connexion…' : 'Se connecter')}</b></span><strong>•••</strong>
      </button>
    </aside>

    <section className="content">
      <div className="ambient"/>
      {view === 'home' && <div className="home-view">
        <article className="hero">
          <img className="hero-background" src={heroArt} alt=""/><span className="hero-shade"/>
          <div className="hero-copy"><div className="eyebrow"><i/> SAISON 01 <span>•</span> SERVEUR OUVERT</div><h1>TON AVENTURE<br/><span>COMMENCE ICI.</span></h1><p>Explore les planètes, complète ton Pokédex et écris ta propre histoire sur CobbleStar.</p></div>
          <img className="hero-creatures" src={team} alt="Pokémon de Cobblemon"/>
          <div className="hero-meta"><span><small>VERSION</small><b>{launcherConfig.minecraftVersion}</b></span><span><small>CHARGEUR</small><b>FABRIC</b></span><span><small>MODPACK</small><b>AUTO</b></span></div>
        </article>

        <div className="dashboard">
          <article className="session-card">
            <header><span><i/> SESSION DE JEU</span><b><Check/> {repairReady ? 'RÉPARATION PRÊTE' : 'INSTALLATION VÉRIFIÉE'}</b></header>
            <button className="server-row" onClick={copyAddress}><span><small>SERVEUR PRINCIPAL</small><b>{serverAddress}</b></span><strong><i/> {copied ? 'ADRESSE COPIÉE' : 'SERVEUR EN LIGNE'} <Copy/></strong></button>
            <div className="install-line">
              {launchState === 'checking' || updateStatus?.state === 'downloading' ? <><div><i style={{ width: `${updateStatus?.state === 'downloading' ? updateStatus.percent : progress}%` }}/></div><span>{updateStatus?.state === 'downloading' ? `Mise à jour du launcher · ${updateStatus.percent}%` : `${gamePhase} · ${progress}%`}</span></> : <span>Le modpack et les packs obligatoires sont contrôlés avant chaque lancement.</span>}
            </div>
            {updateStatus?.state === 'downloaded'
              ? <button className="update-button" onClick={() => { setInstalling(true); window.setTimeout(() => window.cobblestar?.installUpdate(), 350) }}>INSTALLER LA VERSION {updateStatus.version}</button>
              : <button className={`play-button ${launchState === 'running' ? 'opened' : ''}`} onClick={() => void start()} disabled={busy}><span><Play fill="currentColor"/></span><div><small>{!account ? 'CONNEXION REQUISE' : launchState === 'checking' ? gamePhase : launchState === 'running' ? 'MINECRAFT EST LANCÉ' : repairReady ? 'RESYNCHRONISATION AU LANCEMENT' : 'PRÊT À PARTIR'}</small><strong>{!account ? 'SE CONNECTER' : launchState === 'checking' ? `${progress}%` : launchState === 'running' ? 'JEU OUVERT' : 'LANCER LE JEU'}</strong></div><ChevronRight/></button>}
            <p><Check/> Java 21 automatique <span/> <Check/> Packs synchronisés <span/> <Check/> Mise à jour sécurisée</p>
          </article>

          <button className={`news-teaser accent-${featured.accent}`} onClick={() => setSelectedNews(featured)}><img src={newsImage(featured)} alt=""/><span/><small>{featured.category} · {displayDate(featured.publishedAt)}</small><h2>{featured.title}</h2><b>Lire l’actualité <ChevronRight/></b></button>
        </div>
      </div>}

      {view === 'news' && <section className="page-view news-page">
        <header><small>JOURNAL DU SERVEUR</small><h1>Dernières nouvelles</h1><p>Tout ce qu’il faut savoir avant de repartir à l’aventure.</p><button onClick={() => window.cobblestar?.openNewsSite()}>VOIR SUR LE SITE <ExternalLink/></button></header>
        <div className="story-grid">{orderedNews.map((item) => <button key={item.id} className={`story-card accent-${item.accent}`} onClick={() => setSelectedNews(item)}><img src={newsImage(item)} alt=""/><span/><small>{item.category} · {displayDate(item.publishedAt)}</small><h2>{item.title}</h2><p>{item.excerpt}</p><b>Lire la suite <ChevronRight/></b></button>)}</div>
      </section>}

      {view === 'settings' && <section className="page-view settings-page">
        <header><small>CONFIGURATION DU JEU</small><h1>Paramètres</h1><p>Le launcher s’occupe de l’essentiel. Tu gardes le contrôle sur ce qui compte.</p></header>
        <div className="settings-grid">
          <article className="memory-setting"><span className="setting-icon"><Settings/></span><div><small>PERFORMANCES</small><h2>Mémoire allouée</h2><p>Quantité de RAM réservée à Minecraft.</p></div><strong>{memory / 1024} GO</strong><input type="range" min="2048" max="12288" step="1024" value={memory} onChange={(event) => setMemory(Number(event.target.value))}/></article>
          <article><span className="setting-icon"><ShieldCheck/></span><div><small>ENVIRONNEMENT</small><h2>Java automatique</h2><p>Java 21 est installé et maintenu par CobbleStar.</p></div><b>ACTIF</b></article>
          <article><span className="setting-icon"><Sparkles/></span><div><small>CONTENU</small><h2>Synchronisation</h2><p>Mods, packs de ressources et configuration sont contrôlés au lancement.</p></div><b>ACTIF</b></article>
        </div>
        <div className="settings-actions"><button className="repair-button" onClick={() => void repairInstallation()} disabled={repairing || busy}><RotateCcw/> {repairing ? 'PRÉPARATION…' : repairReady ? 'RÉPARATION PRÊTE' : 'RÉPARER L’INSTALLATION'}</button><button className="save-button" onClick={() => void saveMemory()}><Check/> ENREGISTRER</button></div>
      </section>}
    </section>

    {accountOpen && account && <aside className="account-popover"><small>SESSION MICROSOFT</small><h3>{account.name}</h3><p>Compte connecté et prêt à jouer.</p><button onClick={() => void handleAccount()}><LogOut/> SE DÉCONNECTER</button></aside>}

    <footer className="launcher-footer"><span><i/> SERVICES OPÉRATIONNELS</span><span>COBBLESTAR LAUNCHER · MINECRAFT {launcherConfig.minecraftVersion}</span><button onClick={() => window.cobblestar?.openExternal('https://cobblestar-mc.fr')}>COBBLESTAR-MC.FR <ExternalLink/></button></footer>

    {selectedNews && <div className="modal-backdrop" onMouseDown={() => setSelectedNews(null)}><article className={`news-reader accent-${selectedNews.accent}`} onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelectedNews(null)}><X/></button><div className="reader-cover"><img src={newsImage(selectedNews)} alt=""/><span/></div><div className="reader-copy"><small>{selectedNews.category} · {displayDate(selectedNews.publishedAt)}</small><h2>{selectedNews.title}</h2><p className="reader-lead">{selectedNews.excerpt}</p>{selectedNews.content.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></article></div>}

    {authDialog && <div className="modal-backdrop" onMouseDown={() => authDialog.mode === 'error' && setAuthDialog(null)}><section className="dialog-card" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setAuthDialog(null)}><X/></button><small>CONNEXION SÉCURISÉE</small>{authDialog.mode === 'device' ? <><h2>Connecte ton compte Microsoft</h2><p>Entre ce code sur la page Microsoft ouverte dans ton navigateur.</p><button className="device-code" onClick={() => void navigator.clipboard?.writeText(authDialog.userCode)}>{authDialog.userCode} <Copy/></button><button className="dialog-action" onClick={() => window.cobblestar?.openExternal(authDialog.verificationUri)}>OUVRIR MICROSOFT</button></> : <><h2>Une erreur est survenue</h2><p>{authDialog.message}</p><button className="dialog-action" onClick={() => setAuthDialog(null)}>FERMER</button></>}</section></div>}
  </main>
}
