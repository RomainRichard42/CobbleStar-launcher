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
git tag v0.4.0
git push origin v0.4.0
```

GitHub Actions construit d’abord l’ensemble des fichiers, vérifie leur présence, puis les publie en une seule opération avec la commande officielle GitHub. La Release contient `latest.yml`, l’installateur et son fichier de mise à jour différentielle. Les launchers déjà installés la détectent au prochain démarrage.

## Configuration

Les informations principales sont regroupées dans `src/config.ts` :

- serveur : `play.cobblestar-mc.fr` (port SRV `25574`) ;
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

Cette version fournit l’interface complète, la fermeture/réduction de fenêtre, la connexion Microsoft, l’installation contrôlée du `.mrpack`, Java 21, Minecraft/Fabric et la connexion directe au serveur.

## Publier le modpack

Le fichier attendu est configuré dans `launcher.config.json`. Pour la version 1.0.0 :

1. publie normalement le launcher avec le tag `v0.4.0` ;
2. ouvre la Release `v0.4.0` créée automatiquement dans `RomainRichard42/CobbleStar-launcher` ;
3. modifie cette Release et ajoute l’asset sous le nom exact `CobbleStar-1.0.0.mrpack`.

Lors d’une future mise à jour, modifie `version`, `url` et `sha512` dans `launcher.config.json`. Le launcher conserve les fichiers déjà valides et ne télécharge que ceux qui ont changé.

Les prochaines intégrations sont :

1. conservation chiffrée de la session Microsoft entre deux ouvertures ;
2. récupération des actualités depuis le site ;
3. écran de diagnostic et réparation avancée.

Ne placez jamais de secret Microsoft dans le code du renderer. L’authentification et le lancement doivent rester dans le processus principal Electron.
