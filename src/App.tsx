import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleUserRound,
  CircleHelp,
  Wrench,
  Layers,
  CircleAlert,
  Gamepad2,
  Box,
  Copy,
  Download,
  ExternalLink,
  HardDrive,
  LoaderCircle,
  LogOut,
  Maximize2,
  Minus,
  Newspaper,
  Play,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react'
import { launcherConfig } from './config'
import { fallbackNews, type LauncherNews } from './data/news'
import logo from './assets/cobblestar-logo.png'
import landscape from './assets/spawn-poster.webp'
import discordMark from './assets/discord-clyde.png'
import { ServerGallery } from './ServerGallery'
import { LeagueReplays, useReplayAutoplay } from './LeagueReplays'
import { homeHighlights, leagueStories, type LeagueStory } from './data/league'

type View = 'home' | 'news' | 'gallery' | 'settings' | 'help'
type JournalStory = LauncherNews | LeagueStory
type Account = { id: string; name: string; skinData?: string }
type AuthDialog =
  | { mode: 'device'; userCode: string; verificationUri: string }
  | { mode: 'error'; message: string }
  | null
const date = (value: string) =>
  Number.isNaN(Date.parse(value))
    ? ''
    : new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'short',
      }).format(new Date(value))
const newsImage = (item: JournalStory) =>
  'coverUrl' in item ? item.coverUrl : item.image?.startsWith('https://') ? item.image
    : item.image?.startsWith('/') && !item.image.startsWith('//')
      ? `https://cobblestar-mc.fr${item.image}` : landscape
const percent = (value = 0) =>
  Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : 0

function PlayerHead({ account }: { account: Account | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = ref.current?.getContext('2d')
    if (!context || !account?.skinData) return
    let active = true
    const img = new Image()
    img.onload = () => {
      if (!active) return
      context.clearRect(0, 0, 8, 8)
      context.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8)
      // The hat layer is also present on legacy 64x32 skins.
      context.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8)
    }
    img.src = account.skinData
    return () => {
      active = false
    }
  }, [account?.skinData])
  return account?.skinData ? (
    <canvas
      ref={ref}
      width={8}
      height={8}
      className="avatar"
      aria-label={`Visage de ${account.name}`}
    />
  ) : (
    <span className="avatar placeholder">
      <CircleUserRound />
    </span>
  )
}

function Modal({
  title,
  close,
  children,
  wide = false,
}: {
  title: string
  close: () => void
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    const cancel = (event: Event) => {
      event.preventDefault()
      closeRef.current()
    }
    dialog.addEventListener('cancel', cancel)
    return () => {
      dialog.removeEventListener('cancel', cancel)
      dialog.close()
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'wide' : ''}`}
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div className="dialog-body">
        <button
          className="icon-button dialog-close"
          aria-label="Fermer la fenêtre"
          onClick={close}
        >
          <X />
        </button>
        {children}
      </div>
    </dialog>
  )
}

export function Titlebar({version}: {version?: string}) {
  const api = window.cobblestar
  return <header className="titlebar">
    <span>COBBLESTAR</span><span className="title-version">{version ? `v${version}` : ''}</span>
    <div className="window-actions">
      <button aria-label="Réduire" onClick={() => api?.minimize()}><Minus /></button>
      <button aria-label="Agrandir ou restaurer" onClick={() => api?.maximize()}><Maximize2 /></button>
      <button aria-label="Fermer le launcher" onClick={() => api?.close()}><X /></button>
    </div>
  </header>
}

export function App({update, restart}: {
  update: UpdateStatus | null
  restart: (version: string) => Promise<void>
}) {
  const [view, setView] = useState<View>('home')
  const [replayEnabled, setReplayEnabled] = useReplayAutoplay()
  const [account, setAccount] = useState<Account | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [authenticating, setAuthenticating] = useState(false)
  const [authDialog, setAuthDialog] = useState<AuthDialog>(null)
  const [booting, setBooting] = useState(true)
  const [server, setServer] = useState<ServerStatus | { state: 'loading' }>({ state: 'loading' })
  const [game, setGame] = useState<GameStatus>({
    state: 'stopped',
    phase: 'Prêt pour une nouvelle aventure',
  })
  const [info, setInfo] = useState<LauncherInfo | null>(null)
  const [memory, setMemory] = useState<number>(launcherConfig.defaults.memoryMb)
  const [savedMemory, setSavedMemory] = useState<number>(
    launcherConfig.defaults.memoryMb,
  )
  const [saving, setSaving] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [repairReady, setRepairReady] = useState(false)
  const [repairConfirm, setRepairConfirm] = useState(false)
  const [notice, setNotice] = useState('')
  const [news, setNews] = useState<LauncherNews[]>([])
  const [newsState, setNewsState] = useState<'loading' | 'live' | 'offline'>(
    'loading',
  )
  const [selectedNews, setSelectedNews] = useState<JournalStory | null>(null)
  const launchLock = useRef(false)
  const authLock = useRef(false)
  const api = window.cobblestar
  const busy = game.state === 'preparing' || game.state === 'running'
  const blocked = busy || authenticating || repairing || booting
  const address = `${info?.serverHost ?? launcherConfig.server.host}:${info?.serverPort ?? launcherConfig.server.port}`
  const version = info?.minecraftVersion ?? launcherConfig.minecraftVersion
  const maxMemory = Math.max(
    2048,
    Math.min(12288, Math.floor((info?.totalMemoryMb ?? 12288) / 1024) * 1024),
  )
  const orderedNews = useMemo(
    () =>
      [...news].sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) ||
          b.publishedAt.localeCompare(a.publishedAt),
      ),
    [news],
  )

  function error(reason: unknown) {
    setAuthDialog({
      mode: 'error',
      message: reason instanceof Error ? reason.message : String(reason),
    })
  }
  useEffect(() => {
    let active = true
    if (!api) {
      setBooting(false)
      setNews(fallbackNews)
      setNewsState('offline')
      return
    }
    void Promise.allSettled([
      api.getAccount().then((value) => {
        if (active) setAccount(value)
      }),
      api.getSettings().then((value) => {
        if (active) {
          setMemory(value.memoryMb)
          setSavedMemory(value.memoryMb)
        }
      }),
      api.getInfo().then((value) => {
        if (active) setInfo(value)
      }),
    ]).then((results) => {
      if (!active) return
      setBooting(false)
      if (results.some((result) => result.status === 'rejected'))
        setNotice(
          'Certaines informations sont indisponibles. Réessaie ou relance le launcher.',
        )
    })
    void api
      .getNews()
      .then((result) => {
        if (!active) return
        setNews(result.content.articles.filter((item) => item.published))
        setNewsState('live')
      })
      .catch(() => {
        if (active) { setNews(fallbackNews); setNewsState('offline') }
      })
    const offDevice = api.onDeviceCode((payload) =>
      setAuthDialog({ mode: 'device', ...payload }),
    )
    const offGame = api.onGameStatus((status) => {
      setGame(status)
      if (status.state === 'running') void api.getInfo().then(value => { if (active) setInfo(value) }).catch(() => {})
      if (status.state === 'stopped' || status.state === 'error')
        launchLock.current = false
      if (status.state === 'error') error(status.message ?? status.phase)
    })
    return () => {
      active = false
      offDevice()
      offGame()
    }
  }, [api])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 6000)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function login() {
    if (!api)
      return error(
        'Ouvre l’application CobbleStar pour connecter ton compte Microsoft.',
      )
    if (authLock.current || busy || repairing || booting) return
    authLock.current = true
    setAuthenticating(true)
    try {
      const result = await api.loginMicrosoft()
      if (result.ok) {
        setAccount(result.account)
        setAuthDialog(null)
        setNotice(`Bienvenue, ${result.account.name} !`)
      } else error(result.message)
    } catch (reason) {
      error(reason)
    } finally {
      authLock.current = false
      setAuthenticating(false)
    }
  }
  async function logout() {
    if (!api || blocked) return
    try {
      await api.logoutMicrosoft()
      setAccount(null)
      setAccountOpen(false)
    } catch (reason) {
      error(reason)
    }
  }
  async function start() {
    if (blocked || launchLock.current) return
    if (!account) return login()
    if (!api)
      return error('Le lancement est disponible dans l’application CobbleStar.')
    launchLock.current = true
    setRepairReady(false)
    setGame({
      state: 'preparing',
      phase: 'Vérification de ton installation',
      progress: 0,
    })
    try {
      const result = await api.startGame()
      if (!result.ok) throw new Error(result.message)
    } catch (reason) {
      launchLock.current = false
      setGame({ state: 'error', phase: 'Le lancement a échoué' })
      error(reason)
    }
  }
  async function save() {
    if (!api)
      return error(
        'Les réglages sont enregistrés dans l’application CobbleStar.',
      )
    if (saving || booting || memory === savedMemory) return
    setSaving(true)
    try {
      const result = await api.saveSettings({ memoryMb: memory })
      setMemory(result.memoryMb)
      setSavedMemory(result.memoryMb)
      setNotice('Paramètres enregistrés pour le prochain lancement.')
    } catch (reason) {
      error(reason)
    } finally {
      setSaving(false)
    }
  }
  async function repair() {
    if (!api || blocked) return
    setRepairConfirm(false)
    setRepairing(true)
    try {
      const result = await api.repairInstallation()
      if (!result.ok) throw new Error(result.message)
      setRepairReady(true)
      setNotice(
        'Réparation préparée. Lance le jeu pour télécharger les fichiers nécessaires.',
      )
    } catch (reason) {
      error(reason)
    } finally {
      setRepairing(false)
    }
  }
  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text)
      setNotice(message)
    } catch {
      error(
        'Impossible de copier. Tu peux sélectionner et copier le texte manuellement.',
      )
    }
  }
  async function external(url?: string) {
    if (!api) return error('Ce lien s’ouvre depuis l’application CobbleStar.')
    try {
      if (url) await api.openExternal(url)
      else await api.openNewsSite()
    } catch (reason) {
      error(reason)
    }
  }

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const value = await api?.getServerStatus()
        if (active) setServer(value ?? { state: 'unknown', checkedAt: Date.now() })
      } catch { if (active) setServer({ state: 'unknown', checkedAt: Date.now() }) }
    }
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [api])
  async function reloadNews() {
    if (!api || newsState === 'loading') return
    setNewsState('loading')
    try {
      const value = await api.getNews()
      setNews(value.content.articles.filter(item => item.published))
      setNewsState('live')
    } catch { setNews(fallbackNews); setNewsState('offline') }
  }
  // A slow check can finish after home has opened. Wait for the game, login,
  // repair, and any unsaved memory choice before restarting in that case.
  const canRestart = !blocked && !saving && memory === savedMemory
  useEffect(() => {
    if (canRestart && !launchLock.current && !authLock.current && update?.state === 'downloaded') {
      void restart(update.version)
    }
  }, [canRestart, update, restart])
  const website = info?.websiteUrl ?? 'https://cobblestar-mc.fr'
  const sectionName = { home: 'Accueil', gallery: 'Galerie', news: 'Actualités', settings: 'Paramètres', help: 'Assistance' }[view]
  const discord = info?.discordUrl ?? 'https://discord.gg/tHugXVFrDn'
  const progressStage = /modpack/i.test(game.phase) ? 3
    : /fabric/i.test(game.phase) ? 2 : /minecraft/i.test(game.phase) && !/démarrage/i.test(game.phase) ? 1
      : /démarrage/i.test(game.phase) ? 4 : percent(game.progress) >= 74 ? 3
        : percent(game.progress) >= 62 ? 2 : percent(game.progress) >= 22 ? 1 : 0
  const launchName = booting ? 'Chargement…' : authenticating ? 'Connexion…'
    : game.state === 'preparing' ? 'Préparation du jeu' : game.state === 'running' ? 'Jeu en cours'
      : repairing ? 'Préparation…' : account ? 'Jouer à CobbleStar' : 'Connexion Microsoft'
  const launchLabel = booting ? 'Chargement…' : authenticating ? 'CONNEXION…'
    : game.state === 'running' ? 'JEU EN COURS' : game.state === 'preparing'
      ? progressStage >= 3 ? 'INSTALLATION' : 'PRÉPARATION' : repairing ? 'PRÉPARATION…' : account ? 'JOUER' : 'SE CONNECTER'
  const footerStatus = booting ? 'Ouverture du launcher…' : authenticating ? 'Connexion en attente'
    : game.state === 'preparing' ? progressStage >= 3 ? 'Installation en cours' : 'Préparation du jeu'
      : game.state === 'running' ? 'Minecraft est ouvert' : repairReady ? 'Réparation préparée'
        : game.state === 'error' ? 'Lancement interrompu' : account ? 'Prêt à jouer' : 'Connexion requise'
  const statusText =
    game.state === 'preparing'
      ? game.phase
      : game.state === 'running'
        ? 'Minecraft est ouvert. Bonne aventure !'
        : repairReady
          ? 'Réparation au prochain lancement'
          : authenticating
            ? 'En attente de la connexion Microsoft…'
            : account
              ? game.phase
              : 'Connecte ton compte Microsoft pour jouer'
  const updateText = !update
    ? 'Mises à jour automatiques'
    : update.state === 'error'
      ? 'Vérification des mises à jour indisponible'
      : update.state === 'checking'
        ? 'Recherche de mises à jour…'
        : update.state === 'current'
          ? 'Launcher à jour'
          : update.state === 'available'
            ? `Version ${update.version} disponible`
            : update.state === 'downloading'
              ? `Mise à jour · ${percent(update.percent)} %`
              : `Version ${update.version} prête à installer`


  return (
    <main className={`launcher-shell explorer view-${view}`}>
      <Titlebar version={info?.version} />
      <div className="explorer-world">
        <header className="explorer-header">
          <button className="brand" aria-label="Accueil CobbleStar" onClick={() => setView('home')}>
            <img src={logo} alt="Logo CobbleStar" />
            <strong>COBBLE<span>STAR</span></strong>
          </button>
          <span className="league-brand-label">Launcher</span>
          <nav className="league-community" aria-label="Communauté">
            <button onClick={() => void external(website)}>Le site <ExternalLink /></button>
            <button className="league-discord" onClick={() => void external(discord)}><img src={discordMark} alt="" />Discord <ExternalLink /></button>
          </nav>
          <button className="account-card" aria-label={account ? `Compte de ${account.name}` : 'Mon compte'}
            disabled={authenticating || booting}
            onClick={() => account ? setAccountOpen(true) : void login()}>
            <PlayerHead account={account} /><strong>{account?.name ?? 'Mon compte'}</strong><ChevronRight />
          </button>
        </header>
        <div className="desk-body">
        {view === 'home' && <div className="astral-home">
        <section className="league-poster" aria-label="Accueil CobbleStar">
          <nav className="league-menu" aria-label="Menu du launcher">
            <div className="horizons-heading">
              <p>Minecraft Java · Cobblemon</p>
              <h1>Deux mondes<br />à explorer</h1>
              <span>Astéria <i aria-hidden="true" /> Nébélia</span>
            </div>
            <button className="league-play play-button" aria-label={launchName} disabled={blocked} onClick={() => void start()}>
              <Play aria-hidden="true" /><span>{!account && !blocked ? 'Jouer' : launchLabel}</span><ChevronRight aria-hidden="true" />
            </button>
            <div className="horizons-shortcuts">
              <button onClick={() => setView('news')}><Newspaper /><span>Actualités</span></button>
              <button onClick={() => void external(new URL('/wiki/', website).href)}><CircleHelp /><span>Le wiki</span></button>
              <button onClick={() => setView('gallery')}><Layers /><span>Galerie</span></button>
            </div>
            <p className="astral-launch-state" role="status">{!account && !booting ? 'Connecte ton compte Minecraft pour jouer.' : footerStatus}</p>
          </nav>
          <LeagueReplays enabled={replayEnabled} setEnabled={setReplayEnabled}
            suspended={busy || accountOpen || !!authDialog || !!selectedNews} />
          {game.state === 'preparing' && <progress className="astral-progress" aria-label="Préparation du jeu" max="100" value={percent(game.progress)} />}
        </section>
        <section className="astral-journal" aria-labelledby="astral-journal-title">
          <header><h2 id="astral-journal-title">À l’affiche</h2><button onClick={() => setView('news')}>Tout le journal <ArrowRight /></button></header>
          <div className="astral-stories">{homeHighlights.map(({category,story}) => <button key={story.slug} className="astral-story" onClick={() => setSelectedNews(story)}>
            <img src={story.coverUrl} alt="" /><span><small>{category}</small><strong>{story.shortTitle}</strong></span>
          </button>)}</div>
        </section>
        </div>}
        {view !== 'home' && (
          <section className="workspace" aria-label={sectionName}>
            <header className="page-heading">
              <h1>{sectionName}</h1>
              <div className="page-actions">
                {view === 'news' && <button className="text-link" onClick={() => void external()}>Voir sur le site <ExternalLink /></button>}
                <button className="icon-button" aria-label="Retour à l’accueil" onClick={() => setView('home')}><X /></button>
              </div>
            </header>
            <div className={view === 'gallery' ? 'league-gallery-view' : 'workspace-scroll'}>
              {view === 'gallery' && <ServerGallery open={path => void external(new URL(path, website).href)} />}
              {view === 'news' && <div className="news-view">
                <h2>À découvrir sur CobbleStar</h2>
                <div className="league-stories">{leagueStories.map(item => <button key={item.slug} onClick={() => setSelectedNews(item)}>
                  <img src={item.coverUrl} alt="" /><strong>{item.title}</strong><ArrowRight /></button>)}</div>
                <h2>Journal du serveur</h2>
                {newsState === 'offline' && <div className="offline-notice" role="status"><CircleAlert /><div>
                  <strong>Actualités indisponibles · guides locaux</strong><p>Les guides restent accessibles en attendant le retour du site.</p></div>
                  <button className="icon-button" aria-label="Réessayer les actualités" onClick={() => void reloadNews()}><RotateCcw /></button></div>}
                {newsState === 'loading' ? <div className="empty-state" role="status"><LoaderCircle className="spin" /><p>Chargement des actualités…</p></div>
                  : orderedNews.length ? <div className={`story-grid ${newsState === 'offline' ? 'guides' : ''}`}>
                    {orderedNews.map((item, index) => <button key={item.id} className={`story ${index === 0 && newsState === 'live' ? 'featured' : ''}`} onClick={() => setSelectedNews(item)}>
                      <img src={newsImage(item)} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = landscape }} />
                      <span className="story-copy"><small>{newsState === 'offline' ? 'GUIDE LOCAL' : `${item.category} · ${date(item.publishedAt)}`}</small>
                        <strong>{item.title}</strong><span>{item.excerpt}</span><b>{newsState === 'offline' ? 'Lire le guide' : 'Lire l’article'} <ArrowRight /></b></span>
                    </button>)}</div> : <div className="empty-state"><Newspaper /><h2>Aucune actualité pour le moment</h2>
                      <p>Les nouvelles du serveur apparaîtront ici.</p><button className="secondary" onClick={() => void reloadNews()}>Actualiser <RotateCcw /></button></div>}
              </div>}
              {view === 'settings' && <div className="settings-view">
                <section className="panel memory-panel"><header><div><h2>Mémoire du jeu</h2><p>Alloue de la mémoire pour Minecraft et les mods.</p></div>
                  <span>{info ? `${Math.round(info.totalMemoryMb / 1024)} Go sur cet ordinateur` : 'Mémoire système indisponible'}</span></header>
                  <div className="memory-controls"><div className="memory-slider"><output htmlFor="memory">{memory / 1024} Go</output>
                    <label className="sr-only" htmlFor="memory">Mémoire allouée</label>
                    <div className="range-row"><span>2 Go</span><input id="memory" type="range" min="2048" max={Math.max(memory, maxMemory)} step="1024" value={memory}
                      disabled={saving || booting} onChange={event => setMemory(Number(event.target.value))} /><span>{Math.max(memory, maxMemory) / 1024} Go</span></div>
                    <p className="hint">Laisse de la mémoire aux autres applications.</p></div>
                    <div className="memory-save"><button className="primary" disabled={saving || booting || memory === savedMemory}
                      onClick={() => void save()}>{saving && <LoaderCircle className="spin" />}Enregistrer</button>
                      <span className={memory !== savedMemory ? 'unsaved' : 'saved'}>{memory !== savedMemory ? 'Modifications non enregistrées' : 'Réglages enregistrés'}</span></div></div>
                </section>
                <section className="panel automatic-settings">
                  <div><Box /><strong>Java 21 et Fabric</strong><Check /><span>Gérés automatiquement</span></div>
                  <div><Layers /><strong>Modpack</strong><Check /><span>Synchronisé avant de jouer</span></div>
                </section>
                <section className="panel"><label className="league-replay-setting">
                  <input type="checkbox" checked={replayEnabled} onChange={e => setReplayEnabled(e.target.checked)} />
                  Lire automatiquement les replays de l’accueil, sans son
                </label></section>
                <section className="panel repair-panel"><div><h2><Wrench />Installation</h2><p>Vérifie les fichiers du jeu au prochain lancement.</p></div>
                  <button className="secondary" disabled={blocked} onClick={() => setRepairConfirm(true)}>
                    {repairing ? 'Préparation…' : repairReady ? 'Réparation préparée' : 'Réparer l’installation'}</button></section>
              </div>}
              {view === 'help' && <div className="help-view"><h2>Un souci ?</h2>
                <button className="help-row" disabled={blocked} onClick={() => account ? setAccountOpen(true) : void login()}>
                  <CircleUserRound /><span><strong>Connexion Microsoft</strong><small>{account ? 'Gère ta session depuis ton compte.' : 'Connecte ton compte Minecraft Java.'}</small></span><ChevronRight /></button>
                <button className="help-row" onClick={() => setView('settings')}><Gamepad2 /><span><strong>Le jeu ne démarre pas</strong>
                  <small>Vérifie la connexion et les réglages du jeu.</small></span><ChevronRight /></button>
                <div className="help-row"><HardDrive /><span><strong>Fichiers du jeu</strong><small>Prépare une réparation sans supprimer tes sauvegardes.</small></span>
                  <button className="secondary" disabled={blocked} onClick={() => setRepairConfirm(true)}>Réparer l’installation</button></div>
                <div className="dialog-actions"><button className="primary" onClick={() => void external(discord)}><img className="discord-symbol" src={discordMark} alt="" />Ouvrir Discord <ExternalLink /></button>
                  <button className="secondary" onClick={() => void external(website)}>Voir le site <ExternalLink /></button></div>
                <div className="help-meta"><span>Minecraft {version} · Java 21 · Fabric</span><span>{info ? `Launcher v${info.version}` : 'Launcher CobbleStar'}</span></div>
              </div>}
            </div>
          </section>
        )}
        </div>
        <footer className="explorer-footer">
          <nav className="league-tools" aria-label="Outils du launcher">
            <button onClick={() => setView('settings')} aria-current={view === 'settings' ? 'page' : undefined}>Paramètres</button>
            <button onClick={() => setView('help')} aria-current={view === 'help' ? 'page' : undefined}>Assistance</button>
          </nav>
          <div className="desk-server">
            <div className="server-state" aria-live="polite" title={server.state !== 'loading' ? `Consultation : ${new Date(server.checkedAt).toLocaleTimeString('fr-FR')}` : ''}>
              {server.state === 'loading' ? <LoaderCircle className="spin" /> : <i className={`status-dot ${server.state}`} />}
              <span>{server.state === 'online' ? `${server.players} joueur${server.players > 1 ? 's' : ''} en ligne`
                : server.state === 'loading' ? 'Consultation du serveur…' : 'État indisponible'}</span>
            </div>
        <button className="server-address" aria-label="Copier l’adresse du serveur" title="Copier l’adresse du serveur"
          onClick={() => void copy(address, 'Adresse du serveur copiée.')}>{address}<Copy /></button>
          </div>
          <div className="desk-version"><strong>Minecraft Java {version}</strong>
            <span>{info?.modpackVersion ? `Modpack v${info.modpackVersion}` : 'Synchronisation du modpack au lancement'}</span>
          </div>
          <div className="desk-play">
          {view !== 'home' && <button className="play-button" aria-label={launchName} disabled={blocked} onClick={() => void start()}>
            {game.state === 'running' ? <Gamepad2 /> : blocked ? <LoaderCircle className="spin" />
              : account ? <Play fill="currentColor" /> : <span className="microsoft-mark" aria-hidden="true"><i /><i /><i /><i /></span>}
            <span>{launchLabel}</span>{!blocked && <ArrowRight />}
          </button>}
          <span className="dock-status" role="status">{!account && !booting ? 'Compte Minecraft Java requis' : footerStatus}</span>
          </div>
        </footer>
          {update && update.state !== 'current' && update.state !== 'checking' && (
            <section className={`update-card ${update.state === 'error' ? 'warning' : ''}`} aria-label="Mise à jour du launcher" aria-live="polite">
              <div><Download /><strong>{update.state === 'error' ? 'Mise à jour indisponible' : 'Mise à jour du launcher'}</strong></div>
              <p>{updateText}</p>
              {update.state === 'downloading' && <progress aria-label="Téléchargement du launcher" max="100" value={percent(update.percent)} />}
              {update.state === 'downloaded' && !canRestart && <p>{memory !== savedMemory ? 'Enregistre tes réglages pour permettre le redémarrage.' : 'Le launcher redémarrera à la fin de l’activité en cours.'}</p>}
            </section>
          )}
        {game.state === 'preparing' && <section className="preparation-card" aria-label="Préparation du jeu" aria-live="polite">
          <h2>{progressStage >= 3 ? 'Installation du modpack' : 'Vérification du jeu'}</h2>
          <div className="progress-row"><progress aria-label="Préparation du jeu" max="100" value={percent(game.progress)} /><strong>{percent(game.progress)} %</strong></div>
          <p className="game-phase">{game.phase}</p>
          <ol>{['Java 21', `Minecraft ${version}`, 'Fabric', 'Modpack CobbleStar'].map((label, index) => <li key={label} className={index < progressStage ? 'done' : index === progressStage ? 'current' : ''}>
            {index < progressStage ? <span className="stage-check"><Check /></span> : index === progressStage ? <LoaderCircle className="spin" /> : <span className="stage-pending" />}
            <div><strong>{label}</strong><small>{index < progressStage ? 'Vérifié' : index === progressStage ? 'En cours…' : 'En attente'}</small></div></li>)}</ol>
          <p className="hint"><ShieldCheck />Les fichiers à jour sont conservés.</p>
        </section>}
      </div>
      {notice && <div className="toast" role="status"><Check /><span>{notice}</span><button className="icon-button" aria-label="Masquer la notification" onClick={() => setNotice('')}><X /></button></div>}
      {accountOpen && account && <Modal title="Ton compte" close={() => setAccountOpen(false)}>
        <h2>Mon compte</h2><div className="profile"><PlayerHead account={account} /><div><h3>{account.name}</h3><p>Compte Microsoft connecté</p></div></div>
        <p className="session-note"><Check />Session conservée sur cet ordinateur.</p>
        <div className="dialog-actions"><button className="primary" onClick={() => setAccountOpen(false)}>Fermer</button>
          <button className="secondary" disabled={blocked} onClick={() => void logout()}><LogOut />Se déconnecter</button></div>
        {busy && <p className="hint">Ferme le jeu avant de changer de compte.</p>}
      </Modal>}
      {repairConfirm && <Modal title="Réparer l’installation" close={() => setRepairConfirm(false)}>
        <span className="dialog-emblem"><Wrench /></span><h2>Réparer l’installation ?</h2>
        <p>Les fichiers du modpack seront vérifiés au prochain lancement.</p><p>Tes sauvegardes et réglages personnels sont conservés.</p>
        <div className="dialog-actions"><button className="secondary" onClick={() => setRepairConfirm(false)}>Annuler</button>
          <button className="primary" disabled={blocked || !api} onClick={() => void repair()}>Préparer la réparation</button></div>
      </Modal>}
      {selectedNews && <Modal title={selectedNews.title} wide close={() => setSelectedNews(null)}>
        <img className={'guidePath' in selectedNews ? 'reader-cover league-local-cover' : 'reader-cover'} src={newsImage(selectedNews)} alt="" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = landscape }} />
        <div className="reader-copy"><span className="eyebrow">{'guidePath' in selectedNews ? 'Journal CobbleStar' : newsState === 'offline' ? 'Guide local' : `${selectedNews.category} · ${date(selectedNews.publishedAt)}`}</span>
          <h2>{selectedNews.title}</h2><p className="reader-lead">{selectedNews.excerpt}</p>
          {selectedNews.content.split(/\n\s*\n/).map((text, i) => <p key={i}>{text}</p>)}
          <div className="dialog-actions"><button className="text-link" onClick={() => void external('guidePath' in selectedNews ? new URL(selectedNews.guidePath, website).href : undefined)}>
            {'guideLabel' in selectedNews ? selectedNews.guideLabel : 'Lire sur le site'} <ExternalLink /></button>
            <button className="secondary" onClick={() => setSelectedNews(null)}>Fermer</button></div>
        </div></Modal>}
      {authDialog && <Modal title={authDialog.mode === 'device' ? 'Connexion Microsoft' : 'Une erreur est survenue'} close={() => setAuthDialog(null)}>
        {authDialog.mode === 'device' ? <><span className="eyebrow">CONNEXION MICROSOFT</span><h2>Connecte ton compte</h2>
          <p>Saisis ce code dans la page Microsoft.</p><button className="device-code" aria-label="Copier le code Microsoft"
            onClick={() => void copy(authDialog.userCode, 'Code Microsoft copié.')}><span>{authDialog.userCode}</span><span><Copy /><small>Copier le code</small></span></button>
          <button className="primary full" onClick={() => void external(authDialog.verificationUri)}><ExternalLink />Ouvrir Microsoft</button>
          <p className="auth-wait"><LoaderCircle className="spin" />En attente de validation…</p><p className="hint">Aucun mot de passe saisi ici. Fermer cette fenêtre laisse la connexion en attente.</p></>
          : <><span className="dialog-emblem danger"><CircleAlert /></span><h2>{game.state === 'error' ? 'Le lancement a échoué' : 'Impossible de continuer'}</h2>
            <p className="error-copy">{authDialog.message}</p><div className="dialog-actions"><button className="primary" onClick={() => setAuthDialog(null)}>J’ai compris</button>
              <button className="secondary" onClick={() => { setAuthDialog(null); setView('help') }}>Assistance</button></div></>}
      </Modal>}
      <span className="sr-only">{statusText}</span>
    </main>
  )
}
