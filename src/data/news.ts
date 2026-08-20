export type LauncherNews = {
  id: string
  slug: string
  title: string
  excerpt: string
  content: string
  category: string
  accent: 'cyan' | 'pink' | 'gold' | 'mint' | 'violet'
  image: string
  publishedAt: string
  published: boolean
  featured: boolean
}

export const fallbackNews: LauncherNews[] = [
  {
    id: 'welcome', slug: 'welcome', category: 'BIENVENUE', title: 'Bienvenue sur CobbleStar',
    excerpt: 'Le serveur est en préparation. Retrouve ici les informations utiles avant de jouer.',
    content: 'Les actualités officielles apparaîtront automatiquement dès que le site sera disponible.',
    publishedAt: '2026-08-20T10:00:00.000Z', accent: 'cyan', image: '', published: true, featured: true,
  },
  {
    id: 'launcher', slug: 'launcher', category: 'LAUNCHER', title: 'Le jeu se prépare automatiquement',
    excerpt: 'Java, Fabric et le modpack sont vérifiés avant chaque lancement.',
    content: 'Tes données personnelles restent intactes pendant les mises à jour.',
    publishedAt: '2026-08-18T10:00:00.000Z', accent: 'pink', image: '', published: true, featured: false,
  },
]
