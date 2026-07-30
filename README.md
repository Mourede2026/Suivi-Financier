# Suivi Financier ZS — Recettes & Dépenses des Centres de Santé

Application web (installable comme application mobile) pour collecter, par
équipe, les recettes et dépenses de chaque centre de santé, avec un tableau
de bord des écarts — et une vue globale pour l'administrateur (par commune,
par centre, tous centres confondus).

- **Frontend** : HTML / CSS / JavaScript pur (aucun serveur à héberger, aucune
  compilation). Se déploie tel quel sur GitHub Pages.
- **Backend** : un **Google Sheet**, piloté par un script **Google Apps
  Script** déployé comme API web (gratuit, pas d'hébergement à payer).
- **Mobile** : l'application est une PWA (Progressive Web App) : elle
  s'installe sur l'écran d'accueil d'un téléphone Android ou iPhone comme une
  vraie application.

---

## 1. Créer le Google Sheet (base de données)

**Option rapide (recommandée)** : un classeur prêt à l'emploi est fourni dans
[`data/Suivi_Financier_ZS_GoogleSheet.xlsx`](data/Suivi_Financier_ZS_GoogleSheet.xlsx),
avec tous les onglets déjà créés (bons noms, bons en-têtes) et les **35
centres de santé déjà importés**. Il ne vous reste qu'à :
1. Aller sur [sheets.google.com](https://sheets.google.com) →
   **Fichier → Importer → Téléverser**, sélectionnez ce fichier `.xlsx`, puis
   choisissez **"Créer un nouveau classeur Google Sheets"**.
2. Dans ce nouveau classeur : **Extensions → Apps Script**, supprimez le
   contenu par défaut de `Code.gs` et collez-y l'intégralité du fichier
   [`backend/Code.gs`](backend/Code.gs) fourni dans ce projet. Enregistrez.
3. Passez directement à l'étape 2 ci-dessous (déploiement du script). Vous
   n'avez **pas besoin** d'utiliser le bouton "Initialiser le Google Sheet"
   de l'application : les onglets et les centres sont déjà en place. Ouvrez
   simplement l'onglet `Admins` du classeur et changez le mot de passe par
   défaut (`admin` / `admin123`).

**Option manuelle** (si vous préférez repartir de zéro) :

1. Allez sur [sheets.google.com](https://sheets.google.com) et créez un
   nouveau classeur vide. Nommez-le par exemple **"BDD Suivi Financier ZS"**.
2. Menu **Extensions → Apps Script**. Cela ouvre l'éditeur de script,
   attaché à ce classeur.
3. Supprimez le contenu par défaut du fichier `Code.gs` et collez-y
   l'intégralité du fichier [`backend/Code.gs`](backend/Code.gs) fourni dans
   ce projet.
4. Cliquez sur **Enregistrer** (icône disquette).
5. Depuis l'application, utilisez le bouton **"Initialiser le Google
   Sheet"** (écran de configuration) pour créer les onglets et importer les
   centres automatiquement — voir étape 3 ci-dessous.

Dans les deux cas, l'étape suivante (déploiement du script Apps Script) est
obligatoire.

## 2. Déployer le script comme API web

1. Dans l'éditeur Apps Script, cliquez sur **Déployer → Nouveau déploiement**.
2. Type de déploiement : **Application Web**.
3. Paramètres :
   - **Exécuter en tant que** : *Moi (votre compte)*
   - **Qui a accès** : *Tout le monde* (indispensable pour que l'app y accède
     sans que chaque utilisateur ait un compte Google)
4. Cliquez sur **Déployer**, autorisez les permissions demandées (c'est votre
   propre script, sur votre propre Sheet).
5. Copiez l'**URL de l'application Web** obtenue (elle se termine par
   `/exec`). C'est cette URL que l'application va utiliser comme backend.

> ⚠️ À chaque fois que vous modifiez `Code.gs`, il faut créer une **nouvelle
> version** du déploiement (Déployer → Gérer les déploiements → crayon →
> Nouvelle version) pour que les changements soient pris en compte.

## 3. Premier lancement de l'application

**Recommandé : pré-remplir l'URL pour toutes les équipes.** Ouvrez
[`js/config.js`](js/config.js) et collez votre URL `/exec` à la place de
`"COLLEZ_ICI_VOTRE_URL_/exec"` :
```js
window.APP_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AAAA.../exec"
};
```
Ainsi, **personne n'a jamais besoin de saisir l'URL manuellement** : l'écran
"Configuration initiale" ne s'affichera plus jamais, sur aucun appareil ni
navigateur, y compris après avoir vidé le cache. C'est la méthode à utiliser
avant de publier l'app sur GitHub Pages / de la distribuer aux équipes.

**Sans cette étape**, l'URL est simplement mémorisée dans le navigateur
(stockage local) après l'avoir saisie une première fois : l'écran de
configuration ne réapparaît alors que sur un nouvel appareil, un autre
navigateur, en navigation privée, ou après un vidage du cache.

1. Si vous n'avez pas rempli `js/config.js`, ouvrez `index.html` et collez
   l'URL `/exec` obtenue à l'étape 2 dans l'écran **Configuration initiale**.
2. Un bloc **"Première utilisation ?"** apparaît : renseignez l'identifiant
   et le mot de passe souhaités pour le compte **administrateur**, puis
   cliquez sur **Initialiser le Google Sheet**. Cette action, à ne faire
   qu'une seule fois (inutile si vous avez importé le fichier
   `data/Suivi_Financier_ZS_GoogleSheet.xlsx` fourni) :
   - crée tous les onglets nécessaires (`Centres`, `Equipes`,
     `Affectations`, `Admins`, `Recettes`, `Depenses`, `Sessions`) ;
   - importe automatiquement les **35 centres de santé** (Abomey,
     Agbangnizoun, Djidja) déjà répertoriés ;
   - crée votre compte administrateur.
3. Connectez-vous avec ce compte administrateur.

## 4. Utilisation

### Côté administrateur
- **Tableau de bord** : analyses globales, filtrables par commune ou par
  centre, avec les totaux recette/versement/dépense/justification, les
  écarts, un graphique d'évolution et des tableaux détaillés par commune et
  par centre.
- **Paramétrage des comptes** : créer un compte équipe (nom + identifiant +
  mot de passe généré ou choisi), le modifier, le désactiver ou le
  supprimer.
- **Affectation des sites** : choisir une équipe dans la liste puis cocher,
  parmi tous les centres (regroupés par commune), ceux qu'elle doit
  collecter. Une équipe ne peut se connecter qu'avec ses identifiants et ne
  verra jamais les centres qui ne lui sont pas affectés (le contrôle est
  appliqué côté serveur, pas seulement dans l'interface).

### Côté équipe
- **Tableau de bord** : mêmes analyses que l'admin, mais restreintes aux
  seuls centres affectés à l'équipe connectée.
- **Saisie** : on choisit d'abord le centre à renseigner par une sélection
  en cascade **Commune → Arrondissement → Centre** (limitée aux centres
  affectés à l'équipe). Une fois le centre choisi, les deux formulaires
  **Recette** et **Dépense** de ce centre apparaissent côte à côte, chacun
  avec son propre bouton **Enregistrer** et son historique. Un bouton
  "Changer de centre" permet de revenir à la sélection pour passer à un
  autre centre.

Chaque équipe se connecte avec son propre identifiant/mot de passe et ne
peut ni voir ni modifier les données des autres équipes.

## 5. Publier sur GitHub (et en faire une application mobile)

1. Créez un dépôt GitHub (ex. `suivi-financier-zs`) et poussez-y l'intégralité
   de ce dossier (`index.html`, `css/`, `js/`, `manifest.json`, `sw.js`,
   `icons/`, `backend/Code.gs` à titre de référence, ce `README.md`).
   ```bash
   git init
   git add .
   git commit -m "Suivi Financier ZS"
   git branch -M main
   git remote add origin https://github.com/VOTRE-COMPTE/suivi-financier-zs.git
   git push -u origin main
   ```
2. Dans le dépôt GitHub : **Settings → Pages → Source : branche `main`,
   dossier `/root`**. Enregistrez. GitHub vous donne une URL du type
   `https://votre-compte.github.io/suivi-financier-zs/`.
3. Ouvrez cette URL sur un téléphone (Android ou iPhone) :
   - **Android (Chrome)** : menu ⋮ → *Ajouter à l'écran d'accueil* /
     *Installer l'application*.
   - **iPhone (Safari)** : bouton Partager → *Sur l'écran d'accueil*.
   L'application s'installe avec son icône, s'ouvre en plein écran comme une
   application native, et se met à jour automatiquement à chaque nouvelle
   visite en ligne.

L'application reste connectée en direct au Google Sheet : toute saisie est
immédiatement visible dans le classeur, et toute modification du classeur
(ex. correction manuelle d'un montant) est reflétée au prochain
rafraîchissement du tableau de bord.

## 6. Sécurité — à savoir

- Les mots de passe sont stockés en clair dans l'onglet `Equipes`/`Admins`
  du Google Sheet. C'est un choix pragmatique adapté à un usage interne à
  petite échelle (pas de serveur à gérer), mais **ne convient pas** à un
  usage à fort enjeu de confidentialité. Restreignez l'accès au Google Sheet
  lui-même (partage) au strict nécessaire.
- Le contrôle d'accès "une équipe ne voit que ses centres" est appliqué côté
  serveur (Apps Script), pas seulement côté interface : même en modifiant le
  code de l'application dans le navigateur, une équipe ne peut pas récupérer
  les données d'un centre qui ne lui est pas affecté.
- Changez le mot de passe administrateur par défaut dès la première
  connexion (onglet `Admins` du Google Sheet, ou via une future évolution de
  l'écran équipes pour les comptes admin).

## 7. Structure du projet

```
index.html              Page unique de l'application (SPA)
css/style.css            Habillage visuel
js/api.js                 Communication avec l'API Google Apps Script
js/app.js                 Logique de l'application (vues, formulaires, tableaux de bord)
js/centres-seed.js        Liste des 35 centres, utilisée uniquement lors de l'initialisation
js/config.js              URL de l'API pré-remplie (à éditer une fois pour toutes les équipes)
manifest.json            Manifeste PWA (installation mobile)
sw.js                     Service worker (app shell hors-ligne)
icons/                    Icônes de l'application
backend/Code.gs           Script Google Apps Script à coller dans le Google Sheet
```
