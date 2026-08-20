# CobbleStar Launcher

Launcher officiel CobbleStar pour Minecraft **1.21.1 Fabric**. Il affiche les actualités publiées depuis le site et synchronise automatiquement le jeu avant chaque lancement.

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

GitHub Actions construit d’abord l’ensemble des fichiers, vérifie leur présence, puis les publie en une seule opération avec la commande officielle GitHub. La Release contient `latest.yml`, l’installateur et son fichier de mise à jour différentielle. Les launchers déjà installés la détectent au prochain démarrage.

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

Le workflow `Publier le modpack` remplace automatiquement l’asset de la release. Au lancement suivant, le launcher voit sa nouvelle date de mise à jour, télécharge le pack et ne supprime que les fichiers précédemment gérés par CobbleStar. L’URL et la version fixes de `launcher.config.json` servent uniquement de secours si GitHub est indisponible.

Ne placez jamais de secret Microsoft dans le code du renderer. L’authentification et le lancement doivent rester dans le processus principal Electron.

## Sécurité : pourquoi Windows/l'antivirus peut bloquer le launcher

L'installateur n'est **pas signé numériquement** (aucun certificat de signature de code). C'est très courant pour les projets communautaires et cela déclenche deux protections automatiques, sans rapport avec un réel danger :

- **SmartScreen** (Windows) affiche un avertissement tant que l'exécutable n'a pas accumulé assez de téléchargements auprès d'utilisateurs Windows.
- **Certains antivirus** détectent de façon heuristique les applications Electron/NSIS non signées qui téléchargent des fichiers après l'installation (ici : Java, Minecraft, Fabric, les mods) — un comportement qui ressemble à celui d'un dropper de malware même s'il est légitime.

### Vérifier l'intégrité d'un installateur téléchargé

Chaque Release publie un fichier `SHA256SUMS.txt` à côté de l'installateur. Pour vérifier que le fichier téléchargé n'a pas été altéré :

```powershell
Get-FileHash "CobbleStar-Launcher-<version>-win-x64.exe" -Algorithm SHA256
```

Compare le résultat avec la ligne correspondante dans `SHA256SUMS.txt` de la même Release.

### Si Windows ou ton antivirus bloque l'installateur

1. Vérifie d'abord que le hash correspond (voir ci-dessus).
2. Sur l'écran SmartScreen, clique sur **Informations complémentaires** puis **Exécuter quand même**.
3. Si un antivirus supprime le fichier, ajoute une exception ou signale le faux positif à l'éditeur de l'antivirus.

Chaque nouvelle version publiée réinitialise en partie la réputation SmartScreen ; ces avertissements devraient diminuer avec le temps et le nombre de téléchargements.
