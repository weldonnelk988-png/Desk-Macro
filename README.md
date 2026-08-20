# Desk Macro

Site perso d'analyse fondamentale multi-actifs : Banques Centrales, Data Économique,
Drivers Macro, Thèse Macro (par instrument), Trades. Données synchronisées entre
appareils via Firebase Firestore.

## 1. Installer les dépendances

```bash
npm install
```

## 2. Configurer Firebase

1. Va sur https://firebase.google.com → crée un projet gratuit.
2. Dans le projet, active **Firestore Database** (mode test pour commencer).
3. Paramètres du projet (roue crantée) → Vos applications → ajoute une application Web
   → copie l'objet de config.
4. Colle cet objet dans `src/firebase.js` à la place des `"REMPLACE_MOI"`.
5. Dans Firestore → Règles, colle le contenu de `firestore.rules` (fourni dans ce repo)
   et publie.
6. Menu de gauche → **Build → Authentication** → **Get started** → active la méthode
   **Email/Mot de passe**.
7. Onglet **Users** → **Add user** → renseigne ton email et un mot de passe. C'est ce
   compte qui te servira à te connecter sur le site.

## 3. Lancer en local

```bash
npm run dev
```

## 4. Déployer

**Option simple (recommandée) : Vercel ou Netlify**
- Connecte ton repo GitHub sur vercel.com ou netlify.com
- Build command : `npm run build` — Output : `dist`
- Déploiement automatique à chaque push, aucune config supplémentaire.

**Option GitHub Pages**
1. Dans `vite.config.js`, remplace `base: "/"` par `base: "/NOM-DU-REPO/"`.
2. `npm install` (installe `gh-pages`, déjà dans les dépendances).
3. `npm run deploy`
4. Dans les paramètres GitHub du repo → Pages → source = branche `gh-pages`.

## Sécurité

Le site demande maintenant un email/mot de passe pour se connecter (Firebase Auth),
et les règles Firestore fournies n'autorisent la lecture/écriture qu'aux utilisateurs
connectés. Crée ton compte via Authentication → Users → Add user (étape 6-7 ci-dessus) —
c'est cet email + mot de passe qui te servent à te connecter sur le site, sur
n'importe quel appareil.

## Fonctionnalités

- Banques Centrales, Data Économique, Drivers Macro, Thèse Macro (par instrument),
  Trades — chacune éditable et sauvegardée automatiquement.
- Références `@` dans les thèses et les raisons de trade, vers une banque, une donnée
  économique, un driver, ou un autre instrument.
- Historique daté de chaque thèse (capturé quand tu quittes le champ de texte).
- Alertes de fraîcheur : une fiche non mise à jour depuis plus de 14 jours est signalée.
- Recherche globale dans la barre latérale.
- Export PDF sélectif (impression navigateur) et sauvegarde/import JSON complet.

## Sauvegarde / Import

Le bouton "Sauvegarder (JSON)" dans la barre latérale exporte toutes tes données dans
un fichier téléchargeable. "Importer une sauvegarde" permet de les recharger — utile
pour migrer tes données existantes vers Firestore la première fois.
