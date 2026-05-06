# PeSAR

PeSAR est un projet qui suit et expose le **taux EUR → ARS (pesos argentins)**, avec une source principale **Western Union** et un **fallback** sur `dolarapi.com`.  
Il comprend :

- Une **app mobile Expo / React Native** (avec `expo-router`)
- Un **backend serverless Vercel** (`/api/*`) qui scrape, stocke l’historique dans Redis et sert les endpoints
- Une **landing page** (`/`) avec **graphique**, sélection de période (1J/1S/1M/3M/6M/1A), mode jour/nuit automatique
- Une **documentation** accessible via `**/docs`**

## Fonctionnement global

- Un job (GitHub Actions) appelle périodiquement `GET /api/scrape-rate` (protégé par secret)
- Le backend récupère le taux via :
  - **Western Union (GraphQL router)** en priorité
  - **fallback** sur `https://dolarapi.com/v1/cotizaciones` si WU échoue
- Le taux est stocké dans **Upstash Redis** :
  - `latest_rate` (dernier point)
  - `rate_history` (historique roulant, ~3 mois à intervalle 15 min)
- Les pages web (`/` et `/docs`) consomment `GET /api/latest-rate` et `GET /api/rate-history`

## Pages

- `**/`**: dashboard (taux en grand + graphique + boutons de période + % vert/rouge)
- `**/docs**`: documentation API (rewrite vers `public/docs.html`)

## Design (palette + mini-maquette)

La landing (`public/index.html`) suit un style **fluide / futuriste**, avec effet **glass**, grille subtile et “lumières” animées, et **mode jour/nuit automatique** via `prefers-color-scheme`.

### Palette (tokens CSS)

**Mode nuit (dark)** :

- **Background**: `#06061a` (`--bg`), `#0d0d2b` (`--bg2`)
- **Surface glass**: `rgba(255,255,255,0.04)` (`--card`)
- **Bordure**: `rgba(255,255,255,0.08)` (`--card-border`)
- **Texte**: `#ffffff` (`--text`)
- **Texte secondaire**: `rgba(255,255,255,0.45)` (`--text-muted`), `rgba(255,255,255,0.7)` (`--text-soft`)
- **Accent principal**: `#2979ff` (`--accent`) + glow `rgba(41,121,255,0.35)` (`--accent-glow`)
- **Accent secondaire**: `#00d2ff` (`--accent2`)
- **Up (vert)**: `#00e676` (`--up`) + bg `rgba(0,230,118,0.12)` (`--up-bg`)
- **Down (rouge)**: `#ff1744` (`--down`) + bg `rgba(255,23,68,0.12)` (`--down-bg`)
- **Neutral**: `rgba(255,255,255,0.3)` (`--neutral`) + bg `rgba(255,255,255,0.06)` (`--neutral-bg`)

**Mode jour (light)** :

- **Background**: `#eef2ff` (`--bg`), `#e8edff` (`--bg2`)
- **Surface glass**: `rgba(255,255,255,0.75)` (`--card`)
- **Bordure**: `rgba(41,121,255,0.15)` (`--card-border`)
- **Texte**: `#0a0a2e` (`--text`)
- **Accent principal**: `#1a5fff` (`--accent`)
- **Accent secondaire**: `#0099cc` (`--accent2`)
- **Up (vert)**: `#00a94f` (`--up`)
- **Down (rouge)**: `#d50032` (`--down`)

### UI kit (éléments)

- **Typo**: system font stack (iOS/Android/desktop), chiffres en grand en `font-weight: 800`, tracking négatif.
- **Hero**: taux en grand avec gradient texte + badge ▲/▼ (vert/rouge) + “dernière MAJ”.
- **Range selector**: boutons `1J/1S/1M/3M/6M/1A` avec badge de variation `%` (vert/rouge) + état actif (glow accent).
- **Chart**: courbe lissée + remplissage en gradient (bleu si hausse, rouge si baisse) + tooltips.
- **Stats bar**: `Min / Max / Moy` sous le graphique.
- **Background**: blobs radiaux flous + grille (style “sci‑fi”) + carte glass (blur).

## API

### `GET /api/latest-rate`

Retourne le dernier taux stocké.

Réponse (exemple) :

```json
{
  "ok": true,
  "rate": 1234.56,
  "timestamp": "2026-05-06T15:00:00.000Z"
}
```

### `GET /api/rate-history`

Retourne l’historique stocké (du plus ancien au plus récent côté UI).

Réponse (exemple) :

```json
{
  "ok": true,
  "history": [
    { "rate": 1230.0, "timestamp": "2026-05-05T15:00:00.000Z" },
    { "rate": 1234.56, "timestamp": "2026-05-06T15:00:00.000Z" }
  ]
}
```

### `POST /api/register-token`

Enregistre un token Expo Push Notifications (utilisé pour envoyer des mises à jour silencieuses).

### `GET /api/scrape-rate` 🔒

Déclenche le scraping, stocke le nouveau point et (optionnellement) notifie les appareils enregistrés.  
Protégé par :

```
Authorization: Bearer <CRON_SECRET>
```

## Variables d’environnement

Voir `.env.example` pour la liste complète.

### Côté Vercel (backend)

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `CRON_SECRET` (doit matcher le secret GitHub Actions)

### Côté app (Expo)

- `EXPO_PUBLIC_BACKEND_URL` (URL du déploiement Vercel)

## Lancer en local

Installer :

```bash
npm install
```

Lancer l’app Expo :

```bash
npm run start
```

Backend :

- Les endpoints sont dans `api/*.ts` (runtime Vercel).
- Pour tester localement, le plus simple est d’utiliser le tooling Vercel (`vercel dev`) ou de déployer sur Vercel.

## Déploiement

- **Frontend (landing / docs)**: servi via `public/` sur Vercel
- **API**: fonctions serverless dans `api/`
- **Cron**: GitHub Actions appelle `GET /api/scrape-rate` toutes les 15 minutes (voir `.github/workflows/`)

## Notes importantes

- Le taux affiché dépend de la source (WU en priorité, sinon `dolarapi`).
- L’historique “long” (1M/3M/6M/1A) devient pertinent après accumulation des points (scrapes réguliers).