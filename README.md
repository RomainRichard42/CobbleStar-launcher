# CobbleStar Launcher

Launcher officiel CobbleStar pour Minecraft **1.21.1 Fabric**. Il affiche les actualités publiées depuis le site et synchronise automatiquement le jeu avant chaque lancement.

Interface **0.8.2 — Explorateur** : [changements, tests et livrable local](docs/launcher-0.8.2-explorer.txt).

## Démarrer l’interface

```bash
npm install
npm run dev
```

## Générer l’application

```bash
npm run dist
```

Les installateurs sont générés dans `release/`. Chaque système doit construire son propre installateur ; une CI GitHub Actions pourra automatiser Windows, macOS et Linux.

## Publier une mise à jour automatique

Le launcher vérifie les Releases publiques du dépôt `RomainRichard42/CobbleStar-launcher` à chaque démarrage. Pour publier une version :

1. modifie le champ `version` dans `package.json` et `package-lock.json` ;
2. commit et pousse les changements ;
3. crée puis pousse un tag identique à la version :

```bash
git tag v0.4.0
git push origin v0.4.0
```

GitHub Actions vérifie les signatures et teste le contenu installé avant d’autoriser une publication sur le canal Windows direct. La release contient l’installateur, ses empreintes et `latest.yml`.

## Configuration

Les informations principales sont regroupées dans `src/config.ts` :

- serveur : `play.cobblestar-mc.fr:25574` ;
- Minecraft : `1.21.1` ;
- loader : `Fabric` ;
- endpoints du site, des actualités et du manifeste du modpack ;
- mémoire allouée par défaut.

## Configurer la connexion Microsoft

La connexion utilise le flux officiel Microsoft avec code d’appareil : le joueur saisit son mot de passe uniquement sur la page Microsoft ouverte dans son navigateur.

1. Ouvre le portail Microsoft Azure, puis **Microsoft Entra ID > Inscriptions d’applications > Nouvelle inscription**.
2. Nomme l’application `CobbleStar Launcher` et autorise les comptes Microsoft personnels.
3. Dans **Authentification**, active **Autoriser les flux de clients publics**.
4. Copie l’**ID d’application (client)**.
5. Remplace `REMPLACE_PAR_TON_CLIENT_ID` dans `launcher.config.json`, puis relance `npm run dist`.

L’identifiant client n’est pas un secret. Ne crée et n’ajoute aucun secret client au launcher.

## Actualités

Le launcher lit `https://cobblestar-mc.fr/api/news`. Une actualité publiée depuis le studio du site apparaît donc sans reconstruire le launcher. En cas de coupure du site, un contenu de secours reste affiché.

Le mod utilise la même source côté serveur : `/actus` ouvre le journal en jeu et la dernière annonce est signalée à la connexion.

## Jeu et modpack

Le bouton Jouer télécharge automatiquement Java 21, Minecraft 1.21.1 et Fabric dans le dossier utilisateur de l’application, puis connecte le joueur au serveur. La RAM choisie est conservée dans `settings.json` sous le dossier `userData` d’Electron et survit aux mises à jour.

La version actuelle du pack est la pièce jointe `.mrpack` de la release permanente `modpack-latest`. Pour publier une mise à jour :

```bash
cp CobbleStar-1.2.0.mrpack modpack/
git add modpack/CobbleStar-1.2.0.mrpack
git commit -m "chore: publie le modpack 1.2.0"
git push origin main
```

Les `.mrpack` sont suivis avec Git LFS car ils dépassent la limite de taille des fichiers GitHub classiques. Le workflow `Publier le modpack` récupère le fichier LFS puis remplace automatiquement l’asset de la release. Au lancement suivant, le launcher voit sa nouvelle date de mise à jour, télécharge le pack et ne supprime que les fichiers précédemment gérés par CobbleStar. L’URL et la version fixes de `launcher.config.json` servent uniquement de secours si GitHub est indisponible.

Ne placez jamais de secret Microsoft dans le code du renderer. L’authentification et le lancement doivent rester dans le processus principal Electron.

## Distribution Windows

### Microsoft Store

Le canal Store utilise un paquet APPX x64. Microsoft signe le paquet distribué après certification et gère ses mises à jour. Le launcher installé par le Store continue de synchroniser le modpack avant de jouer.

1. Inscrire Accessidev via [le portail développeur Microsoft Store](https://storedeveloper.microsoft.com/), choisir le compte d’entreprise et terminer sa vérification.
2. Réserver le nom du produit dans Partner Center. Copier les valeurs de la rubrique **Identité du produit** dans les variables GitHub Actions du dépôt. `STORE_IDENTITY_NAME` correspond à `Package/Identity/Name`, `STORE_PUBLISHER` à `Package/Identity/Publisher`, `STORE_PUBLISHER_DISPLAY_NAME` au nom complet de l’éditeur et `STORE_DISPLAY_NAME` au nom réservé du produit.
3. Exécuter **Préparer le paquet Microsoft Store** sur la révision à soumettre. Transmettre le fichier APPX de l’artefact `pour-partner-center` dans la soumission Partner Center. Documenter l’usage de `runFullTrust` pour le lancement de Java et donner aux testeurs les instructions d’accès à Minecraft. Pour un premier essai privé, choisir une distribution limitée dans Partner Center.
4. Après certification, tester une installation et une mise à jour depuis le Store avec les protections Windows actives. La version du paquet décale le premier chiffre de la version du launcher de un, car le Store exige un premier chiffre positif et réserve le quatrième chiffre.

### Téléchargement direct

L’installateur GitHub 0.8.10 a été publié sans signature. Sur ce canal, toute nouvelle publication exige une configuration de signature de production et la variable `WINDOWS_PUBLISHER_DN` contenant le sujet complet du certificat approuvé. La chaîne vérifie la signature Authenticode horodatée de l’installateur, du launcher et du désinstalleur, puis vérifie les signatures des autres exécutables, DLL et modules natifs installés. Avec SignPath, signer uniquement l’enveloppe NSIS ne suffit pas à passer ces contrôles. Les empreintes de mise à jour sont calculées sur le fichier distribué.

La signature fournie par Microsoft pour le Store couvre le paquet distribué par le Store. En cas de blocage Windows, conserve les protections actives et vérifie la provenance et les signatures du fichier.
