import gradedCard from '../assets/league-sceau-astral.webp'
import eevee from '../assets/home-eevee.webp'
import machine from '../assets/league-quasar.webp'

export const editionDate = '2026-11-04'
export const leagueStories = [
  {
    slug: 'sceau-astral', shortTitle: 'Le Sceau astral', coverUrl: gradedCard,
    title: "Ta carte mérite-t-elle un 10 ?", excerpt: "Prends deux cartes Dracolosse identiques. Sous le Sceau astral, chacune a sa note et son propre numéro de série.",
    content: "Pour faire expertiser une carte, sors l’exemplaire de ton album et prends-le en main. À la station de gradation, ou avec /sga, vérifie la carte et le tarif avant de confirmer. C’est cet exemplaire précis qui recevra son certificat.\n\nSur l’étiquette, tu pourras lire la note et le numéro de série. Le certificat détaille le centrage, les coins, les bords et la surface. Si ta carte décroche un 10, trois étoiles brillent sur son cadre.\n\nUn stand suffit pour exposer ta préférée. Si tu gardes plusieurs exemplaires d’une même illustration, une vitrine peut en accueillir trois, chacun avec son propre certificat.",
    guideLabel: "Voir le guide des cartes gradées", guidePath: '/wiki/galerie/',
  },
  {
    slug: 'machines-quasar', shortTitle: 'Dans la pince de Quasar', coverUrl: machine,
    title: "Dans la pince de Quasar", excerpt: "Une capsule remonte dans la vitrine. Sa couleur donne déjà un indice sur ce qu’elle contient.",
    content: "Devant la machine Quasar, un clic gauche affiche les lots. Prends le temps de regarder les récompenses et leurs raretés. Nova, Pulsar, Quasar et Vote ont chacune leur propre jeton.\n\nAvec le bon jeton, un clic droit lance l’ouverture. Les capsules se mélangent, la pince en attrape une et la dépose dans la trappe. Tu peux la suivre jusqu’au réceptacle. Sa couleur annonce la rareté du lot.\n\nLes objets qui défilent au-dessus de la capsule montrent les possibilités de ce palier. Un seul tirage détermine ton gain. Tu peux déjà essayer l’animation et consulter les lots des quatre machines dans le wiki.",
    guideLabel: "Essayer les machines dans le wiki", guidePath: '/wiki/caisses/#demo-machines',
  },
  {
    slug: 'collection-star', shortTitle: 'Ton prochain Pokémon Star', coverUrl: eevee,
    title: "Ton prochain Pokémon Star", excerpt: "Choisis une espèce, vérifie si elle existe en Star et garde ta prochaine chasse sous la main.",
    content: "Dans Ma collection, les espèces que tu possèdes et celles qui te manquent ont chacune leur liste. Avec ton compte Minecraft lié, l’équipe et les boîtes du PC alimentent ta collection.\n\nPour préparer une chasse, choisis un Pokémon manquant et ajoute-le à tes objectifs. Si l’espèce existe en Star sur CobbleStar, tu peux viser cette forme en particulier. La prochaine fois que tu ouvres ton compte, ta liste est là.\n\nAvant de partir, ouvre la fiche du Pokédex. Les conditions de rencontre et les évolutions t’aident à choisir entre chercher l’espèce elle-même ou commencer par sa pré-évolution.",
    guideLabel: "Ouvrir Ma collection", guidePath: '/collection/',
  },
]
export type LeagueStory = (typeof leagueStories)[number]
