# n8n-nodes-browser-use-orchestrator

Node communautaire n8n pour [**browser-use-cdp-orchestrator**](https://github.com/docloulou/browser-use-cdp-orchestrator) :
pilote des agents web browser-use (navigateurs cloud en CDP) directement depuis un workflow n8n.

Les paramètres du node sont **générés depuis les schémas Zod de l'orchestrateur**
(`config.ts`). Quand le schéma change côté orchestrateur, on **recolle un seul fichier**
et on rebuild — les champs n8n se mettent à jour tout seuls.

## Sommaire

- [Architecture](#architecture)
- [Opérations exposées](#opérations-exposées)
- [Installation](#installation)
- [Identifiants (credentials)](#identifiants-credentials)
- [🔄 Synchroniser avec l'orchestrateur (copier-coller)](#-synchroniser-avec-lorchestrateur-copier-coller)
- [Développement](#développement)
- [Notes & limites](#notes--limites)

## Architecture

Un **node unique** (`Browser Use Orchestrator`) suivant la convention n8n
**Resource → Operation**. Chaque tool/route « utile » de l'orchestrateur est une opération.

Pipeline de génération :

```
orchestrator/config.ts   (schémas Zod, copié VERBATIM depuis le repo orchestrateur)
        │  npm run generate  (z.toJSONSchema, en devDependency uniquement)
        ▼
schemas.generated.ts     (JSON Schema figé — artefact de build, AUCUNE dépendance runtime)
        │  properties.ts   (JSON Schema → INodeProperties n8n, au chargement du module)
        ▼
BrowserUseOrchestrator.node.ts   (description + execute hybride REST/MCP)
```

| Fichier | Rôle |
|---|---|
| `nodes/BrowserUseOrchestrator/orchestrator/config.ts` | **Source de vérité**, copie verbatim de l'orchestrateur (le seul fichier à recoller au sync). |
| `scripts/generate-schemas.ts` | Fige les schémas Zod en JSON Schema (draft-7). |
| `nodes/BrowserUseOrchestrator/schemas.generated.ts` | Artefact généré, consommé au runtime (sans zod). |
| `properties.ts` | Convertit le JSON Schema en propriétés n8n. |
| `registry.ts` | **Seul** endroit qui liste les tools et leur transport (REST `/ui/api/*` ou MCP `/mcp`). |
| `transport.ts` | Appels REST + client MCP (JSON-RPC stateless, parse du flux SSE). |

**Transport hybride** : l'orchestrateur expose les actions de deux façons. Le node choisit la
plus adaptée par opération.

- **REST** (`/ui/api/*`) pour les lancements, jobs et sessions (JSON simple, lié directement aux schémas Zod).
- **MCP** (`POST /mcp`, JSON-RPC en mode *stateless*) pour ce que l'API REST n'expose pas (secrets, profils, navigateur partagé, `await_job`).

## Opérations exposées

| Resource | Operation | Transport | Description |
|---|---|---|---|
| Agent | `run_task_agent` | REST | Tâche web autonome en langage naturel. |
| Agent | `run_vision_agent` | REST | Capture full-page + description par un LLM vision. |
| Agent | `fetch_page` | REST | Lecture rapide d'une page en markdown (sans boucle d'agent). |
| Agent | `run_session_step` | REST | Une étape d'un scénario multi-étapes (navigateur persistant). |
| Job | `await_job` | MCP | Attend la fin d'un job et renvoie son résultat. |
| Job | `cancel_job` | REST | Annule un job en cours. |
| Job | `list_jobs` | REST | Jobs, sessions ouvertes et capacité navigateur. |
| Session | `get_session_screenshot` | REST | Capture la page courante d'une session. |
| Session | `close_session` | REST | Ferme une session persistante. |
| Secret | `list_secrets` | MCP | Noms des secrets disponibles. |
| Profile | `list_profiles` | MCP | Liste des profils navigateur. |
| Profile | `create_profile` | MCP | Crée un profil navigateur. |
| Browser | `get_browser_cdp` | MCP | URL CDP du navigateur partagé. |
| Browser | `close_shared_browser` | MCP | Ferme le navigateur partagé. |

Le node est `usableAsTool` : il peut être branché comme outil d'un AI Agent n8n.

## Installation

```bash
npm install      # installe les devDependencies (dont @n8n/node-cli et zod)
npm run build    # génère les schémas puis compile vers dist/
```

Pour tester en local dans n8n :

```bash
npm run dev      # lance n8n avec le node monté en hot-reload
```

Pour une installation manuelle dans un n8n self-hosted, lier le package compilé dans
`~/.n8n/custom` (voir la doc n8n « Run your node locally »).

## Identifiants (credentials)

Créer un identifiant **Browser Use Orchestrator API** :

| Champ | Description |
|---|---|
| **Base URL** | URL publique du serveur orchestrateur, ex. `http://localhost:3000` (sans slash final). |
| **Auth Token** | Valeur de `AUTH_TOKEN` (bearer). Laisser vide si l'orchestrateur tourne sans auth. |

Le test d'identifiant interroge `GET /healthz`. Le token est injecté en
`Authorization: Bearer <token>` sur toutes les requêtes (REST et MCP).

## Installer depuis l'UI de n8n

Une fois le package **publié sur npm** (voir section suivante) :

1. Dans n8n : **Settings → Community Nodes → Install** (réservé Owner/Admin).
2. Saisir le nom du package : `n8n-nodes-browser-use-orchestrator`
   (optionnel : `n8n-nodes-browser-use-orchestrator@0.1.0` pour une version précise).
3. Cocher « I understand the risks… » puis **Install**.

Prérequis côté instance : `N8N_COMMUNITY_PACKAGES_ENABLED=true` (défaut sur self-hosted).
Sur **n8n Cloud**, seuls les nodes *vérifiés* (soumis via le Creator Portal) sont installables.

## Publier sur npm (GitHub Actions)

Le scaffold fournit `.github/workflows/publish.yml` (publication avec *provenance*,
obligatoire pour la vérification n8n à partir du 1er mai 2026).

⚠️ **Monorepo** : GitHub n'exécute que les workflows situés dans `.github/workflows/` **à la
racine du dépôt**. Comme ce package est dans un sous-dossier, deux options :
- **(simple)** faire de ce dossier son propre dépôt Git (racine = package) ;
- **(monorepo)** remonter le workflow à la racine du dépôt et ajouter
  `working-directory: n8n-nodes-browser-use-orchestrator` à chaque step (`npm ci`, `npm run release`).

Mettre à jour `repository.url` dans `package.json` pour pointer le dépôt **réel** qui publie
(la provenance exige que le package corresponde au dépôt/commit du workflow).

Setup unique (une des deux) :
- **OIDC Trusted Publishing** (recommandé, sans secret) : npmjs.com → package → Settings →
  Trusted Publishers → GitHub Actions (repo + `publish.yml`). Laisser `NPM_TOKEN` non défini.
- **NPM_TOKEN** : créer un Granular Access Token (read/write) et l'ajouter en secret GitHub `NPM_TOKEN`.

Release :

```bash
npm run release   # lint + build + bump version + changelog + tag + push
```

Le push du tag `*.*.*` déclenche le workflow qui publie sur npm. Ensuite, le package est
installable depuis l'UI (section précédente).

## Utiliser comme outil d'un AI Agent

Le node est `usableAsTool: true` : il se branche sur l'entrée **Tool** d'un node *AI Agent*.

**Activer les community nodes comme outils** (n8n < 1.85, désormais activé par défaut depuis 1.85) :

```bash
export N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true
```

(ou dans `docker-compose.yml`, bloc `environment:`).

**Remplissage automatique des champs par le LLM** : oui. Quand le node est utilisé comme
outil, chaque paramètre de données (`task`, `url`, `fields`, `secrets`…) peut être laissé au
modèle via le bouton **« Let the model define this parameter »** (qui insère une expression
`{{ $fromAI(...) }}`). Le modèle remplit alors la valeur à partir du **displayName** et de la
**description** — toutes deux dérivées des schémas Zod de l'orchestrateur, donc déjà riches et
explicites. Les sélecteurs `Resource`/`Operation` sont volontairement `noDataExpression`
(figés par l'utilisateur) : on ajoute en général **un node-outil par opération** et le modèle
ne remplit que les paramètres.

## 🔄 Synchroniser avec l'orchestrateur (copier-coller)

Quand tu modifies un schéma Zod côté `browser-use-cdp-orchestrator` :

1. **Recoller** le fichier `config.ts` de l'orchestrateur dans
   `nodes/BrowserUseOrchestrator/orchestrator/config.ts` (écrasement complet, verbatim).
2. **Rebuild** :

```bash
npm run build
```

C'est tout. `npm run build` relance `npm run generate` (Zod → JSON Schema) ; les nouveaux
paramètres apparaissent automatiquement dans le node, avec leurs descriptions, types,
champs requis et bornes.

**Quand faut-il toucher autre chose ?** Uniquement si tu **ajoutes / supprimes un tool**
(pas un simple paramètre) : ajoute alors une entrée dans `registry.ts` (resource,
operation, transport et route). Pour `config.ts` du côté générateur, si tu exposes un
nouveau tool avec input, ajoute son schéma dans la map `INPUTS` de
`scripts/generate-schemas.ts`.

## Développement

```bash
npm run generate   # régénère schemas.generated.ts depuis config.ts
npm run build      # generate + compile
npm run lint       # lint n8n (mode strict, compatibilité n8n Cloud)
npm run dev        # n8n local avec hot-reload
```

## Notes & limites

- **Zod v4 requis** par `config.ts` (`z.toJSONSchema`, `z.strictObject`…). Il reste en
  **devDependency** : le node n'a **aucune dépendance runtime** (contrainte des community nodes n8n).
- **MCP stateless** : le client envoie un `tools/call` JSON-RPC unique à `POST /mcp` ;
  la réponse arrive en flux SSE et est parsée pour en extraire le résultat. Le délai
  d'attente HTTP est calé sur `wait_seconds`.
- **`get_session_screenshot` (REST)** : l'endpoint REST capture toujours la page entière ;
  le paramètre `full_page` est donc sans effet par cette voie. Pour l'honorer, passer ce
  tool en `transport: 'mcp'` dans `registry.ts`.
- **Champs dynamiques `fields`** : saisis en JSON (ex. `{"prix": "number: prix en euros"}`).
- **Champs liste** (`secrets`, `allowed_domains`) : ajout de valeurs multiples (rendu en tableau).

## Licence

MIT
