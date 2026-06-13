/**
 * Configuration centrale : agents Python + schémas Zod (inputs/outputs).
 *
 * Tout ce qui décrit les agents (descriptions, options, schémas des tools MCP)
 * vit ici. `mcp.ts` et `runtime.ts` ne font que consommer ce registre.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Options des agents (une définition unique, réutilisée par tool et CLI)
// ---------------------------------------------------------------------------

export interface OptionDef {
    /** Flag CLI passé au script Python (usage manuel). */
    flag: string;
    /** Valeur par défaut si l'appelant ne précise rien. */
    default: boolean;
    /** Description destinée au LLM. */
    description: string;
}

export const optionDefs = {
    vision: {
        flag: "--vision",
        default: false,
        description:
            "Active la vision par step (screenshots envoyés au LLM). Plus lent et plus coûteux : à activer seulement si la tâche dépend d'éléments visuels (mise en page, images). Par défaut l'agent travaille sur le DOM seul.",
    },
    direct: {
        flag: "--direct",
        default: true,
        description:
            "Navigue directement vers l'URL puis capture full-page + description, SANS boucle d'agent (rapide, ~10-30s). Si false : un agent browser-use exécute la tâche pas à pas avant la capture (lent mais peut interagir).",
    },
    screenshot: {
        flag: "--screenshot",
        default: true,
        description:
            "Enregistre la capture full-page (JPEG) dans screenshots/ et renvoie son URL http dans le champ `url` du résultat.",
    },
} as const satisfies Record<string, OptionDef>;

export type OptionName = keyof typeof optionDefs;

// ---------------------------------------------------------------------------
// Registre des agents (1 tool MCP par agent)
// ---------------------------------------------------------------------------

export interface AgentDef {
    title: string;
    /** Description pour le LLM : quand choisir cet agent. */
    description: string;
    /** Ce que doit contenir le paramètre `task` pour cet agent. */
    taskHint: string;
    /** Forme du champ `result` du job (résumé compact pour la description du tool). */
    resultHint: string;
    /** Options supportées (clés de `optionDefs`) — défauts appliqués par le runtime. */
    options: readonly OptionName[];
    /** Défauts spécifiques à l'agent (prioritaires sur optionDefs[name].default). */
    optionDefaults?: Partial<Record<OptionName, boolean>>;
    /** Durée indicative d'un run, pour calibrer wait_seconds. */
    typicalDuration: string;
}

export const agents = {
    task: {
        title: "Automatisation web (tâche libre)",
        description:
            "Agent browser-use complet : exécute une tâche web en langage naturel (naviguer, cliquer, remplir, extraire). " +
            "À choisir pour toute action ou extraction multi-étapes sur un site. " +
            "Travaille sur le DOM seul par défaut (rapide) ; option vision pour les tâches visuelles.",
        taskHint:
            "Instruction en langage naturel, idéalement avec l'URL de départ et le résultat attendu. " +
            'Ex: "Va sur news.ycombinator.com et donne les 3 premiers posts (titre + url)". ' +
            "Précise le résultat attendu pour éviter les étapes de vérification inutiles.",
        resultHint:
            "result = {success, summary, results (texte libre, ou liste d'objets aux clés de `fields`), " +
            "extracted_data (fiche clé/valeur), final_url, blocker (cause si échec), confidence (high|medium|low), " +
            "screenshot_url (URL http de la capture finale si screenshot=true)}. " +
            "Fallback {result: string} si le parsing structuré échoue.",
        options: ["vision", "screenshot"],
        // Contrairement à l'agent vision, pas de capture par défaut (coût/latence).
        optionDefaults: { screenshot: false },
        typicalDuration: "15-90s selon la tâche",
    },
    vision: {
        title: "Description visuelle d'une page (full-page)",
        description:
            "Capture une page web en entier (full-page, JPEG) et la décrit via un LLM vision. " +
            "À choisir pour « décris cette page », vérifier un rendu, ou obtenir un screenshot + sa description.",
        taskHint:
            'URL à décrire (mode direct, défaut) — ex: "https://news.ycombinator.com". ' +
            "Si direct=false : instruction en langage naturel exécutée par l'agent avant la capture.",
        resultHint: "result = {description, url? (URL http du screenshot si screenshot=true)}.",
        options: ["direct", "screenshot"],
        typicalDuration: "10-30s en direct, plus si direct=false",
    },
} as const satisfies Record<string, AgentDef>;

export type AgentName = keyof typeof agents;

// ---------------------------------------------------------------------------
// Schéma dynamique `fields` (structure des results de l'agent task)
// ---------------------------------------------------------------------------

export const FIELD_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/;
export const MAX_RESULT_FIELDS = 12;
/** Types acceptés en préfixe de description : "number: prix en euros". */
export const FIELD_TYPES = ["string", "str", "number", "float", "int", "integer", "bool", "boolean"] as const;

/** Valide le schéma dynamique `fields` (noms = identifiants, nombre borné). */
export function validateFields(
    fields: Record<string, string> | undefined,
): { ok: true } | { ok: false; error: string } {
    if (!fields || Object.keys(fields).length === 0) return { ok: true };
    const names = Object.keys(fields);
    if (names.length > MAX_RESULT_FIELDS) {
        return { ok: false, error: `fields: maximum ${MAX_RESULT_FIELDS} champs (reçu ${names.length}).` };
    }
    for (const name of names) {
        if (!FIELD_NAME_RE.test(name)) {
            return {
                ok: false,
                error: `fields: nom de champ invalide "${name}" (attendu: identifiant [a-zA-Z_][a-zA-Z0-9_]*, max 40 caractères).`,
            };
        }
    }
    return { ok: true };
}

// ---------------------------------------------------------------------------
// Schémas des tools MCP (inputs/outputs) — centralisés ici
// ---------------------------------------------------------------------------

/** Borne haute d'attente synchrone d'un tool (les clients MCP timeout au-delà). */
export const MAX_WAIT_SECONDS = 600;
export const DEFAULT_LAUNCH_WAIT_SECONDS = 90;
export const DEFAULT_AWAIT_WAIT_SECONDS = 120;
export const DEFAULT_FETCH_WAIT_SECONDS = 60;

const waitSecondsField = (defaultSeconds: number) =>
    z
        .number()
        .int()
        .min(0)
        .max(MAX_WAIT_SECONDS)
        .optional()
        .describe(
            `Attente synchrone max (défaut ${defaultSeconds}s, max ${MAX_WAIT_SECONDS}s). ` +
                "Si l'agent finit à temps, le résultat est renvoyé directement. Sinon tu reçois un job_id : " +
                "reviens dessus avec await_job (PAS de polling en boucle). 0 = lancer sans attendre.",
        );

// strictObject : un paramètre inconnu doit être rejeté (pas silencieusement ignoré).

/** Override ponctuel du modèle LLM — champ commun aux tools run_*_agent. */
const modelField = z
    .string()
    .optional()
    .describe(
        "Id du modèle LLM à utiliser pour CE job (ex: \"gpt-4o-mini\"), servi par le même endpoint/clé que le .env. " +
            "Omis ou vide : OPENAI_MODEL du .env (et OPENAI_VISION_MODEL pour la description d'image). " +
            "Ne renseigner que pour changer délibérément de modèle.",
    );

/** Secrets injectés à l'agent (valeurs jamais exposées au LLM). */
const secretsField = z
    .array(z.string())
    .optional()
    .describe(
        "Noms de secrets (configurés côté serveur, cf list_secrets) mis à disposition de l'agent pour CE job. " +
            "Les VALEURS ne transitent jamais par le LLM : l'agent les insère via des placeholders sécurisés. " +
            "Dans `task`, référence le secret par son NOM (ex: \"connecte-toi avec l'identifiant mon_login et le mot de passe mon_password\"). " +
            "Recommandé : restreindre allowed_domains quand des secrets sont fournis.",
    );

/** Domaines autorisés pour la navigation (sandbox par job). */
const allowedDomainsField = z
    .array(z.string())
    .optional()
    .describe(
        'Liste de domaines autorisés pour la navigation (ex: ["example.com", "*.google.com"]). ' +
            "Toute navigation hors liste est bloquée. Omis : aucun filtrage. " +
            "Fortement recommandé quand des secrets sont fournis.",
    );

/** Profil navigateur cloud à charger (cookies/storage persistants). */
const profileIdField = z
    .string()
    .optional()
    .describe(
        "Id d'un profil navigateur browser-use à charger dans la session (cookies, localStorage et connexions " +
            "conservés d'un navigateur à l'autre). Créer/retrouver les profils via create_profile / list_profiles. " +
            "Omis : navigateur vierge.",
    );

/** Pays du proxy pour ce navigateur (code à 2 lettres). */
const proxyCountryField = z
    .string()
    .regex(/^[a-zA-Z]{2}$/, "code pays à 2 lettres")
    .optional()
    .describe(
        'Code pays du proxy du navigateur pour CE job (ex: "fr", "us", "de") — utile pour le contenu géo-restreint. ' +
            "Omis : BROWSER_PROXY_COUNTRY du .env.",
    );

const fieldsDescription =
    "Schéma dynamique des résultats : { nom_du_champ: description }. " +
    "Impose la structure de `results` : un objet par élément extrait avec exactement ces clés. " +
    `Noms = identifiants ([a-zA-Z_][a-zA-Z0-9_]*), max ${MAX_RESULT_FIELDS} champs. ` +
    'Type optionnel en préfixe de la description : "number: prix en euros", "bool: en stock", "int: nombre d\'avis" ' +
    "(défaut string ; valeurs nullables dans tous les cas). " +
    'Omis : results est un texte libre. Ex: {"titre": "titre du post", "prix": "number: prix en euros"}';

/** Capture finale d'un run task/step (URL dans result.screenshot_url). */
const finalScreenshotField = z
    .boolean()
    .optional()
    .describe(
        "Capture la page FINALE du run (JPEG full-page, servie par /screenshots) et ajoute son URL http " +
            "dans result.screenshot_url — feedback visuel du résultat. (défaut: false)",
    );

/** Input du tool run_task_agent. */
export const taskAgentInput = z.strictObject({
    task: z.string().min(1).describe(agents.task.taskHint),
    vision: z.boolean().optional().describe(`${optionDefs.vision.description} (défaut: false)`),
    screenshot: finalScreenshotField,
    model: modelField,
    fields: z.record(z.string(), z.string()).optional().describe(fieldsDescription),
    secrets: secretsField,
    allowed_domains: allowedDomainsField,
    profile_id: profileIdField,
    proxy_country: proxyCountryField,
    wait_seconds: waitSecondsField(DEFAULT_LAUNCH_WAIT_SECONDS),
});

/** Input du tool run_vision_agent. */
export const visionAgentInput = z.strictObject({
    task: z.string().min(1).describe(agents.vision.taskHint),
    direct: z.boolean().optional().describe(`${optionDefs.direct.description} (défaut: true)`),
    screenshot: z.boolean().optional().describe(`${optionDefs.screenshot.description} (défaut: true)`),
    model: modelField,
    profile_id: profileIdField,
    proxy_country: proxyCountryField,
    wait_seconds: waitSecondsField(DEFAULT_LAUNCH_WAIT_SECONDS),
});

/** Input du tool fetch_page (extraction markdown directe, sans boucle d'agent). */
export const fetchPageInput = z.strictObject({
    url: z.string().min(1).describe('URL de la page à lire (ex: "https://news.ycombinator.com").'),
    links: z
        .boolean()
        .optional()
        .describe("Inclut les liens (hrefs) dans le markdown extrait (défaut: false)."),
    profile_id: profileIdField,
    proxy_country: proxyCountryField,
    wait_seconds: waitSecondsField(DEFAULT_FETCH_WAIT_SECONDS),
});

export const jobStatusSchema = z
    .enum(["pending", "running", "done", "error", "cancelled"])
    .describe("pending/running = en cours, done = résultat dispo, error = échec, cancelled = annulé via cancel_job");

/** Progression temps réel du job (dernier step d'agent exécuté). */
export const jobProgressSchema = z
    .object({
        step: z.number().describe("Numéro du dernier step d'agent exécuté"),
        actions: z.array(z.string()).describe("Actions du step (click, input_text, navigate...)"),
        url: z.string().nullable().describe("URL de la page au moment du step"),
    })
    .nullable()
    .describe("Dernier step exécuté par l'agent (null tant que rien n'est remonté)");

/** Consommation LLM du job. */
export const jobUsageSchema = z
    .object({
        prompt_tokens: z.number().nullable(),
        completion_tokens: z.number().nullable(),
        total_tokens: z.number().nullable(),
        cost_usd: z.number().nullable().describe("Coût estimé (null/0 si le pricing du modèle est inconnu)"),
    })
    .nullable()
    .describe("Tokens et coût LLM du job (renseigné en fin de run)");

/** État d'un job — sortie commune des tools run_*_agent et await_job. */
export const jobStateSchema = z.object({
    job_id: z.string().describe("Identifiant à passer à await_job"),
    agent: z.string(),
    task: z.string(),
    session_id: z
        .string()
        .nullable()
        .describe("Session navigateur persistante associée (étapes run_session_step) ; null pour un job classique"),
    status: jobStatusSchema,
    result: z
        .unknown()
        .nullable()
        .describe("JSON renvoyé par l'agent quand status=done (forme décrite par le tool qui a lancé le job)"),
    error: z.string().nullable().describe("Message d'erreur quand status=error ou cancelled"),
    live_url: z
        .string()
        .nullable()
        .describe("URL pour REGARDER le navigateur en direct (à ouvrir dans un navigateur ; utile pendant le run)"),
    progress: jobProgressSchema,
    usage: jobUsageSchema,
    created_at: z.string(),
    finished_at: z.string().nullable(),
    duration_seconds: z.number().nullable().describe("Durée du run (null si en cours)"),
    next: z
        .string()
        .nullable()
        .describe("Instruction sur la prochaine action à faire (null si terminé)"),
});

export const awaitJobInput = z.strictObject({
    job_id: z.string().describe("Identifiant renvoyé par run_task_agent / run_vision_agent / fetch_page"),
    wait_seconds: z
        .number()
        .int()
        .min(0)
        .max(MAX_WAIT_SECONDS)
        .optional()
        .describe(
            `Attente synchrone max (défaut ${DEFAULT_AWAIT_WAIT_SECONDS}s, max ${MAX_WAIT_SECONDS}s). ` +
                "Bloque jusqu'à la fin du job ou l'expiration. 0 = état instantané sans attendre.",
        ),
});

export const cancelJobInput = z.strictObject({
    job_id: z.string().describe("Identifiant du job à annuler (cf list_jobs)"),
});

// ---------------------------------------------------------------------------
// Sessions persistantes (multi-step) : run_session_step / close_session
// ---------------------------------------------------------------------------

/** Input du tool run_session_step (une étape d'une boucle multi-step). */
export const stepAgentInput = z.strictObject({
    task: z
        .string()
        .min(1)
        .describe(
            "L'étape à exécuter, en langage naturel, avec le résultat attendu. " +
                "L'agent garde sa MÉMOIRE entre les étapes de la session (historique, contexte) " +
                "et le navigateur son état (page courante, cookies, connexions) : " +
                "tu peux enchaîner naturellement en référant aux étapes précédentes " +
                '(ex: "Maintenant ouvre le deuxième résultat et donne son prix"). ' +
                "Donne une URL à la première étape ou pour changer de site.",
        ),
    session_id: z
        .string()
        .optional()
        .describe(
            "Session navigateur à réutiliser (valeur renvoyée par l'étape précédente). " +
                "OMIS = ouvre une NOUVELLE session persistante (premier appel d'une boucle).",
        ),
    vision: z
        .boolean()
        .optional()
        .describe(
            `${optionDefs.vision.description} (défaut: false ; figé au PREMIER step de la session, ignoré ensuite)`,
        ),
    screenshot: finalScreenshotField.describe(
        "Capture la page en FIN D'ÉTAPE (JPEG full-page) et ajoute son URL http dans result.screenshot_url. " +
            "Peut changer à chaque étape — get_session_screenshot reste disponible pour capturer entre deux étapes. (défaut: false)",
    ),
    model: modelField.describe(
        "Id du modèle LLM pour la session (même endpoint/clé que le .env). " +
            "Figé au PREMIER step de la session, ignoré ensuite. Omis : OPENAI_MODEL du .env.",
    ),
    fields: z
        .record(z.string(), z.string())
        .optional()
        .describe(
            "Schéma dynamique des résultats de CETTE étape : { nom_du_champ: description } " +
                `(identifiants, max ${MAX_RESULT_FIELDS} champs ; type optionnel en préfixe : "number: prix"). ` +
                "Omis : results en texte libre.",
        ),
    secrets: secretsField.describe(
        "Noms de secrets (cf list_secrets) mis à disposition de l'agent de la session. " +
            "FIGÉS au PREMIER step de la session, ignorés ensuite. Les valeurs ne transitent jamais par le LLM.",
    ),
    allowed_domains: allowedDomainsField.describe(
        'Domaines autorisés pour la navigation (ex: ["example.com"]). ' +
            "FIGÉS au PREMIER step de la session (le navigateur est créé à ce moment-là).",
    ),
    profile_id: profileIdField.describe(
        "Id d'un profil navigateur browser-use à charger (cookies/connexions persistants). " +
            "FIGÉ au PREMIER step de la session, ignoré ensuite.",
    ),
    proxy_country: proxyCountryField.describe(
        'Code pays du proxy (ex: "fr"). FIGÉ au PREMIER step de la session, ignoré ensuite.',
    ),
    wait_seconds: waitSecondsField(DEFAULT_LAUNCH_WAIT_SECONDS),
});

/** État d'une session navigateur persistante. */
export const sessionStateSchema = z.object({
    session_id: z.string().describe("À passer à run_session_step pour continuer dans le même navigateur"),
    steps_done: z.number().describe("Nombre d'étapes terminées dans cette session"),
    busy: z.boolean().describe("true = une étape est en cours (une seule à la fois par session)"),
    live_url: z
        .string()
        .nullable()
        .describe("URL pour regarder le navigateur de la session en direct (et intervenir manuellement si besoin)"),
    created_at: z.string(),
    last_used_at: z.string(),
    idle_close_minutes: z
        .number()
        .describe("La session est fermée automatiquement après ce délai d'inactivité"),
});

/** Sortie de run_session_step : état du job + état de la session. */
export const stepJobStateSchema = jobStateSchema.extend({
    session: sessionStateSchema.describe("Session navigateur persistante utilisée par cette étape"),
});

export const closeSessionInput = z.strictObject({
    session_id: z.string().describe("Session à fermer (renvoyée par run_session_step)"),
});

export const closeSessionOutput = z.object({
    closed: z.boolean(),
    session_id: z.string(),
    steps_done: z.number().describe("Nombre total d'étapes exécutées dans la session"),
});

export const sessionScreenshotInput = z.strictObject({
    session_id: z.string().describe("Session dont il faut capturer la page courante (cf run_session_step)"),
    full_page: z
        .boolean()
        .optional()
        .describe("Capture toute la hauteur de la page (défaut: true) ; false = viewport seul."),
});

export const sessionScreenshotOutput = z.object({
    url: z.string().nullable().describe("URL http de la capture (JPEG) servie par /screenshots"),
    page_url: z.string().nullable().describe("URL de la page capturée"),
});

export const listJobsOutput = z.object({
    capacity: z
        .object({
            active: z.number().describe("Sessions navigateur cloud actuellement actives"),
            max: z.number().describe("Limite de sessions simultanées (MAX_CONCURRENT_BROWSERS)"),
        })
        .describe("Capacité navigateur : un nouveau job ne peut démarrer que si active < max."),
    sessions: z
        .array(sessionStateSchema)
        .describe("Sessions navigateur persistantes ouvertes (multi-step) — chacune occupe un slot"),
    jobs: z.array(jobStateSchema),
});

export const browserCdpOutput = z.object({
    cdp_url: z.string().describe("URL CDP http du navigateur cloud browser-use actif"),
    web_socket_debugger_url: z.string().nullable().describe("URL websocket CDP (devtools)"),
    browser: z.string().nullable().describe("Version du navigateur"),
    live_url: z.string().nullable().describe("URL pour regarder ce navigateur en direct"),
    session_id: z.string().describe("Id de la session navigateur cloud (API browser-use)"),
    created: z.boolean().describe("true si un nouveau navigateur a dû être créé"),
});

export const closeSharedBrowserOutput = z.object({
    closed: z.boolean(),
    session_id: z.string().nullable().describe("Session navigateur cloud arrêtée (null si aucune)"),
});

// ---------------------------------------------------------------------------
// Secrets et profils
// ---------------------------------------------------------------------------

export const listSecretsOutput = z.object({
    secrets: z
        .array(z.string())
        .describe("Noms des secrets utilisables via le paramètre `secrets` des tools run_*"),
});

export const listProfilesOutput = z.object({
    profiles: z.array(
        z.object({
            id: z.string().describe("À passer en profile_id aux tools run_*"),
            name: z.string().nullable(),
        }),
    ),
});

export const createProfileInput = z.strictObject({
    name: z.string().optional().describe("Nom lisible du profil (optionnel)"),
});

export const createProfileOutput = z.object({
    id: z.string().describe("Id du profil créé, à passer en profile_id aux tools run_*"),
    name: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Agents Stagehand (TypeScript, faits main) : list_stagehand_agents / run_stagehand_agent
// ---------------------------------------------------------------------------

/** Input du tool run_stagehand_agent : on choisit l'agent, le reste est optionnel. */
export const runStagehandAgentInput = z.strictObject({
    agent: z
        .string()
        .min(1)
        .describe(
            "Nom de l'agent Stagehand à lancer (cf list_stagehand_agents). " +
                "Les agents sont écrits en TypeScript dans stagehand/agents/ et découverts automatiquement.",
        ),
    input: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
            "Paramètres de l'agent, selon SON schéma (cf input_schema de list_stagehand_agents). " +
                "Souvent vide : la plupart des agents ne demandent rien d'autre que d'être choisis.",
        ),
    model: modelField.describe(
        "Id du modèle LLM pour cet agent (même endpoint/clé que le .env). " +
            "Omis : STAGEHAND_MODEL puis OPENAI_MODEL du .env.",
    ),
    profile_id: profileIdField,
    proxy_country: proxyCountryField,
    wait_seconds: waitSecondsField(DEFAULT_LAUNCH_WAIT_SECONDS),
});

/** Résumé d'un agent Stagehand exposé par list_stagehand_agents. */
export const stagehandAgentSummarySchema = z.object({
    name: z.string().describe("À passer en `agent` à run_stagehand_agent"),
    title: z.string(),
    description: z.string(),
    input_schema: z
        .unknown()
        .describe("JSON Schema (draft-7) des paramètres de l'agent (à fournir dans `input`)"),
});

export const listStagehandAgentsOutput = z.object({
    agents: z.array(stagehandAgentSummarySchema).describe("Agents Stagehand découverts dans stagehand/agents/"),
});

/**
 * Schéma d'entrée d'un agent Stagehand pour les FORMULAIRES UI : ses propres
 * paramètres + les champs communs (modèle, profil, proxy, attente). Le tool MCP
 * garde ces champs communs à plat (l'agent ne voit que son `input`).
 */
export function stagehandFormInput<S extends z.ZodObject<z.ZodRawShape>>(agentInput: S) {
    return agentInput.extend({
        model: modelField.describe(
            "Id du modèle LLM (même endpoint/clé que le .env). Omis : STAGEHAND_MODEL puis OPENAI_MODEL.",
        ),
        profile_id: profileIdField,
        proxy_country: proxyCountryField,
        wait_seconds: waitSecondsField(DEFAULT_LAUNCH_WAIT_SECONDS),
    });
}
