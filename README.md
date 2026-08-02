# CobbleStar Launcher

Première base du launcher officiel CobbleStar pour Minecraft **1.21.1 Fabric**.

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
git tag v0.3.2
git push origin v0.3.2
```

GitHub Actions construit d’abord l’ensemble des fichiers, vérifie leur présence, puis les publie en une seule opération avec la commande officielle GitHub. La Release contient `latest.yml`, l’installateur et son fichier de mise à jour différentielle. Les launchers déjà installés la détectent au prochain démarrage.

## Configuration

Les informations principales sont regroupées dans `src/config.ts` :

- serveur : `23.109.138.130:25574` ;
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

## État de cette version

Cette version fournit l’interface complète, la fermeture/réduction de fenêtre et la connexion Microsoft vers un profil Minecraft Java. Le bouton Jouer simule encore la vérification des fichiers. Les prochaines intégrations sont :

1. conservation chiffrée de la session Microsoft entre deux ouvertures ;
2. téléchargement de Java, Minecraft et Fabric ;
3. synchronisation du modpack à partir d’un manifeste distant ;
4. lancement et connexion directe au serveur ;
5. récupération des actualités depuis le futur site.

Ne placez jamais de secret Microsoft dans le code du renderer. L’authentification et le lancement doivent rester dans le processus principal Electron.
