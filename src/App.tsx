import { useEffect, useState } from 'react'
import {
  ChevronRight,
  CircleUserRound,
  Copy,
  Download,
  Gamepad2,
  Minus,
  Play,
  Settings,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react'
import { launcherConfig } from './config'
import { fallbackNews } from './data/news'
import logo from './assets/cobblestar-logo.png'

type LaunchState = 'idle' | 'checking' | 'ready'
type MinecraftAccount = { id: string; name: string; skinUrl?: string }
type AuthDialog =
  | { mode: 'device'; userCode: string; verificationUri: string; message: string }
  | { mode: 'error'; message: string }
  | null

export function App() {
  const [launchState, setLaunchState] = useState<LaunchState>('idle')
  const [progress, setProgress] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [memory, setMemory] = useState<number>(launcherConfig.defaults.memoryMb)
  const [copied, setCopied] = useState(false)
  const [account, setAccount] = useState<MinecraftAccount | null>(null)
  const [authenticating, setAuthenticating] = useState(false)
  const [authDialog, setAuthDialog] = useState<AuthDialog>(null)

  useEffect(() => {
    void window.cobblestar?.getAccount().then(setAccount)
    return window.cobblestar?.onDeviceCode((payload) => {
      setAuthDialog({ mode: 'device', ...payload })
    })
  }, [])

  useEffect(() => {
    if (launchState !== 'checking') return
    const timer = window.setInterval(() => {
      setProgress((value) => {
        const next = Math.min(value + 4, 100)
        if (next === 100) {
          window.clearInterval(timer)
          window.setTimeout(() => setLaunchState('ready'), 250)
        }
        return next
      })
    }, 35)
    return () => window.clearInterval(timer)
  }, [launchState])

  const checkInstallation = () => {
    if (launchState === 'checking') return
    setProgress(0)
    setLaunchState('checking')
  }

  const serverAddress = `${launcherConfig.server.host}:${launcherConfig.server.port}`

  const handleAccount = async () => {
    if (!window.cobblestar) {
      setAuthDialog({ mode: 'error', message: 'La connexion Microsoft fonctionne uniquement dans l’application Electron.' })
      return
    }

    if (account) {
      await window.cobblestar.logoutMicrosoft()
      setAccount(null)
      return
    }

    setAuthenticating(true)
    const result = await window.cobblestar.loginMicrosoft()
    setAuthenticating(false)
    if (result.ok) {
      setAccount(result.account)
      setAuthDialog(null)
    } else {
      setAuthDialog({ mode: 'error', message: result.message })
    }
  }

  return (
    <main className="launcher-shell">
      <div className="cosmos" aria-hidden="true">
        <i className="planet planet-one" />
        <i className="planet planet-two" />
        <i className="star star-one" />
        <i className="star star-two" />
        <i className="star star-three" />
      </div>

      <header className="titlebar">
        <div className="brand-mini">
          <img src={logo} alt="" />
          <span>COBBLESTAR</span>
          <b>LAUNCHER</b>
        </div>
        <nav aria-label="Navigation principale">
          <button className="nav-active"><Gamepad2 size={16} /> Accueil</button>
          <button onClick={() => setSettingsOpen(true)}><Settings size={16} /> Paramètres</button>
        </nav>
        <div className="window-actions">
          <button aria-label="Réduire" onClick={() => window.cobblestar?.minimize()}><Minus size={16} /></button>
          <button aria-label="Fermer" onClick={() => window.cobblestar?.close()}><X size={17} /></button>
        </div>
      </header>

      <section className="content">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={14} /> L’AVENTURE COMMENCE ICI</span>
          <h1>Explore.<br /><em>Capture.</em><br />Brille.</h1>
          <p>Rejoins l’univers de CobbleStar et pars à la rencontre de créatures extraordinaires sous un ciel rempli d’étoiles.</p>

          <div className="server-pill">
            <span className="online-dot" />
            <div><small>SERVEUR COBBLESTAR</small><strong>{serverAddress}</strong></div>
            <button
              aria-label="Copier l’adresse"
              onClick={() => {
                navigator.clipboard?.writeText(serverAddress)
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1400)
              }}
            >
              <Copy size={16} /> {copied ? 'Copié' : ''}
            </button>
          </div>
        </div>

        <div className="mascot-wrap" aria-label="Mascotte CobbleStar">
          <div className="logo-halo" />
          <img className="mascot" src={logo} alt="Logo CobbleStar : Slowpoke endormi sur une étoile" />
          <span className="orb orb-one" />
          <span className="orb orb-two" />
        </div>

        <aside className="account-card glass">
          <div className="account-icon"><CircleUserRound size={25} /></div>
          <div><small>COMPTE JOUEUR</small><strong>{account?.name ?? 'Non connecté'}</strong></div>
          <button onClick={handleAccount} disabled={authenticating}>
            {authenticating ? 'Connexion en cours…' : account ? 'Déconnexion' : 'Connexion Microsoft'}
            <ChevronRight size={17} />
          </button>
        </aside>

        <section className="news-panel">
          <div className="section-heading">
            <div><small>LES DERNIÈRES</small><h2>Actualités</h2></div>
            <button>Tout voir <ChevronRight size={16} /></button>
          </div>
          <div className="news-grid">
            {fallbackNews.map((item) => (
              <article className={`news-card ${item.accent}`} key={item.id}>
                <span>{item.tag}</span>
                <h3>{item.title}</h3>
                <p>{item.excerpt}</p>
                <time>{item.date}</time>
              </article>
            ))}
          </div>
        </section>
      </section>

      <footer className="launchbar glass">
        <div className="version-block">
          <Download size={19} />
          <div><small>VERSION DE JEU</small><strong>{launcherConfig.loader} {launcherConfig.minecraftVersion}</strong></div>
        </div>
        <div className="status-block">
          {launchState === 'checking' ? (
            <><div className="progress"><i style={{ width: `${progress}%` }} /></div><span>Vérification des fichiers… {progress}%</span></>
          ) : (
            <><UsersRound size={17} /><span>{launchState === 'ready' ? 'Installation vérifiée — prêt à jouer' : 'Modpack CobbleStar • mise à jour automatique'}</span></>
          )}
        </div>
        <button className="play-button" onClick={checkInstallation} disabled={launchState === 'checking'}>
          <span className="play-icon"><Play size={22} fill="currentColor" /></span>
          <span><small>{launchState === 'ready' ? 'PRÊT À PARTIR' : 'LANCER LE JEU'}</small><strong>{launchState === 'checking' ? 'PRÉPARATION…' : 'JOUER'}</strong></span>
          <ChevronRight size={24} />
        </button>
      </footer>

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settings-modal glass" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSettingsOpen(false)}><X /></button>
            <span className="eyebrow">PARAMÈTRES DU JEU</span>
            <h2>Mémoire allouée</h2>
            <p>Choisis la quantité de RAM utilisée par Minecraft.</p>
            <input type="range" min="2048" max="12288" step="1024" value={memory} onChange={(e) => setMemory(Number(e.target.value))} />
            <strong className="memory-value">{memory / 1024} Go</strong>
            <div className="setting-note">Java automatique • Dossier de jeu isolé • Fabric {launcherConfig.minecraftVersion}</div>
            <button className="save-settings" onClick={() => setSettingsOpen(false)}>Enregistrer</button>
          </section>
        </div>
      )}

      {authDialog && (
        <div className="modal-backdrop" onMouseDown={() => authDialog.mode === 'error' && setAuthDialog(null)}>
          <section className="settings-modal auth-modal glass" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setAuthDialog(null)}><X /></button>
            <span className="eyebrow">CONNEXION SÉCURISÉE</span>
            {authDialog.mode === 'device' ? (
              <>
                <h2>Connecte ton compte Microsoft</h2>
                <p>Ton navigateur vient de s’ouvrir. Entre ce code sur la page Microsoft, puis reviens ici.</p>
                <button
                  className="device-code"
                  onClick={() => navigator.clipboard?.writeText(authDialog.userCode)}
                  title="Copier le code"
                >
                  {authDialog.userCode} <Copy size={18} />
                </button>
                <button className="save-settings" onClick={() => window.cobblestar?.openExternal(authDialog.verificationUri)}>
                  Ouvrir la page Microsoft
                </button>
                <small className="security-copy">Le launcher ne voit et ne stocke jamais ton mot de passe.</small>
              </>
            ) : (
              <>
                <h2>Connexion indisponible</h2>
                <p>{authDialog.message}</p>
                <div className="setting-note">Si l’identifiant manque, ajoute-le dans <strong>launcher.config.json</strong> avant de reconstruire le launcher.</div>
                <button className="save-settings" onClick={() => setAuthDialog(null)}>Compris</button>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
