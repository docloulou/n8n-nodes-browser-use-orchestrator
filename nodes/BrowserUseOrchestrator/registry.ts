import { SCHEMAS, type JsonSchemaObject } from './schemas.generated';

/**
 * Registre des tools/routes exposés par browser-use-cdp-orchestrator.
 *
 * C'est le SEUL endroit qui liste explicitement les actions : il mappe chaque
 * opération vers son transport (REST `/ui/api/*` ou MCP `/mcp`) et sa route.
 * Les PARAMÈTRES, eux, sont dérivés des schémas Zod de
 * `browser-use-cdp-orchestrator/config.ts`, figés en JSON Schema dans `schemas.generated.ts`
 * (cf. `properties.ts`). Ajouter un paramètre à un tool ne demande
 * donc QUE de mettre à jour le submodule puis relancer le build.
 */

export type Transport = 'rest' | 'mcp';
export type HttpMethod = 'GET' | 'POST';

export interface RestConfig {
	method: HttpMethod;
	/** Construit le chemin (les `pathParams` sont injectés dans l'URL). */
	path: (params: Record<string, unknown>) => string;
	/** Champs du schéma qui vont dans l'URL et non dans le body. */
	pathParams: string[];
	hasBody: boolean;
}

export interface ToolDef {
	resource: string;
	/** Valeur de l'opération n8n = nom du tool MCP. */
	operation: string;
	name: string;
	action: string;
	description: string;
	transport: Transport;
	rest?: RestConfig;
	/**
	 * Vrai si l'opération lance un job asynchrone : la réponse peut être soit le
	 * résultat final (status terminal), soit un `job_id` avec status=running si
	 * l'agent dépasse `wait_seconds`. Ces opérations exposent le choix
	 * synchrone/asynchrone côté node (cf. `executionMode`).
	 */
	producesJob?: boolean;
}

export interface ResourceDef {
	value: string;
	name: string;
}

export const RESOURCES: ResourceDef[] = [
	{ value: 'agent', name: 'Agent' },
	{ value: 'job', name: 'Job' },
	{ value: 'session', name: 'Session' },
	{ value: 'secret', name: 'Secret' },
	{ value: 'profile', name: 'Profile' },
	{ value: 'browser', name: 'Browser' },
];

const launch = (name: string): RestConfig => ({
	method: 'POST',
	path: () => `/ui/api/launch/${name}`,
	pathParams: [],
	hasBody: true,
});

export const TOOLS: ToolDef[] = [
	// --- Agent (lancements, transport REST /ui/api/launch/*) ---
	{
		resource: 'agent',
		operation: 'run_task_agent',
		name: 'Run Task Agent',
		action: 'Run an autonomous web task agent',
		description: 'Tâche web autonome en langage naturel (naviguer, cliquer, remplir, extraire)',
		transport: 'rest',
		rest: launch('run_task_agent'),
		producesJob: true,
	},
	{
		resource: 'agent',
		operation: 'run_vision_agent',
		name: 'Run Vision Agent',
		action: 'Capture and describe a page with a vision model',
		description: "Capture full-page d'une URL + description par un LLM vision",
		transport: 'rest',
		rest: launch('run_vision_agent'),
		producesJob: true,
	},
	{
		resource: 'agent',
		operation: 'fetch_page',
		name: 'Fetch Page',
		action: 'Read a page as markdown (fast, no agent loop)',
		description: "Lecture rapide d'une page en markdown, sans boucle d'agent ni LLM",
		transport: 'rest',
		rest: launch('fetch_page'),
		producesJob: true,
	},
	{
		resource: 'agent',
		operation: 'run_session_step',
		name: 'Run Session Step',
		action: 'Run one step of a persistent multi-step session',
		description: "Une étape d'un scénario multi-étapes dans un navigateur persistant",
		transport: 'rest',
		rest: launch('run_session_step'),
		producesJob: true,
	},
	// Stagehand : exposé UNIQUEMENT par le serveur MCP (pas de route REST générique
	// `/ui/api/launch/run_stagehand_agent` — côté REST, l'UI passe par un formulaire
	// par agent `stagehand:<agent>`). On le pilote donc via MCP, comme await_job.
	{
		resource: 'agent',
		operation: 'run_stagehand_agent',
		name: 'Run Stagehand Agent',
		action: 'Run a hand-written Stagehand agent',
		description: 'Lance un agent Stagehand fait main (TypeScript) choisi par son nom',
		transport: 'mcp',
		producesJob: true,
	},
	{
		resource: 'agent',
		operation: 'list_stagehand_agents',
		name: 'List Stagehand Agents',
		action: 'List available Stagehand agents',
		description: 'Agents Stagehand découverts (nom, description, schéma de paramètres)',
		transport: 'mcp',
	},

	// --- Job (suivi, transport REST /ui/api/jobs/* + state) ---
	{
		resource: 'job',
		operation: 'await_job',
		name: 'Await Job',
		action: 'Wait for a job to finish',
		description: "Bloque jusqu'à la fin du job puis renvoie son état et son résultat",
		transport: 'mcp',
	},
	{
		resource: 'job',
		operation: 'cancel_job',
		name: 'Cancel Job',
		action: 'Cancel a running job',
		description: 'Annule un job en cours (agent interrompu, navigateur fermé, slot libéré)',
		transport: 'rest',
		rest: {
			method: 'POST',
			path: (p) => `/ui/api/jobs/${encodeURIComponent(String(p.job_id ?? ''))}/cancel`,
			pathParams: ['job_id'],
			hasBody: false,
		},
	},
	{
		resource: 'job',
		operation: 'list_jobs',
		name: 'List Jobs',
		action: 'List jobs, sessions and browser capacity',
		description: 'Jobs (en cours et terminés), sessions ouvertes et capacité navigateur',
		transport: 'rest',
		rest: {
			method: 'GET',
			path: () => '/ui/api/state',
			pathParams: [],
			hasBody: false,
		},
	},

	// --- Session (multi-step, transport REST /ui/api/sessions/*) ---
	{
		resource: 'session',
		operation: 'get_session_screenshot',
		name: 'Get Session Screenshot',
		action: 'Screenshot the current page of a session',
		description: "Capture la page courante d'une session multi-étapes, sans step d'agent",
		// MCP plutôt que REST : l'endpoint REST ignore full_page (toujours full-page),
		// le tool MCP l'honore. Voir README.
		transport: 'mcp',
	},
	{
		resource: 'session',
		operation: 'close_session',
		name: 'Close Session',
		action: 'Close a persistent browser session',
		description: "Ferme le navigateur d'une session multi-étapes et libère un slot",
		transport: 'rest',
		rest: {
			method: 'POST',
			path: (p) => `/ui/api/sessions/${encodeURIComponent(String(p.session_id ?? ''))}/close`,
			pathParams: ['session_id'],
			hasBody: false,
		},
	},

	// --- Secret (transport MCP) ---
	{
		resource: 'secret',
		operation: 'list_secrets',
		name: 'List Secrets',
		action: 'List available secret names',
		description: 'Noms des secrets utilisables via le paramètre `secrets` des tools run',
		transport: 'mcp',
	},

	// --- Profile (transport MCP) ---
	{
		resource: 'profile',
		operation: 'list_profiles',
		name: 'List Profiles',
		action: 'List browser profiles',
		description: 'Profils navigateur cloud (cookies et connexions persistants)',
		transport: 'mcp',
	},
	{
		resource: 'profile',
		operation: 'create_profile',
		name: 'Create Profile',
		action: 'Create a browser profile',
		description: 'Crée un profil navigateur persistant et renvoie son id',
		transport: 'mcp',
	},

	// --- Browser partagé (transport MCP) ---
	{
		resource: 'browser',
		operation: 'get_browser_cdp',
		name: 'Get Browser CDP',
		action: 'Get the shared browser CDP URL',
		description: "URL CDP d'un navigateur partagé pour outils externes (Playwright, DevTools)",
		transport: 'mcp',
	},
	{
		resource: 'browser',
		operation: 'close_shared_browser',
		name: 'Close Shared Browser',
		action: 'Close the shared browser',
		description: 'Ferme le navigateur partagé et libère un slot de capacité',
		transport: 'mcp',
	},
];

export type { JsonSchemaObject };

/** JSON Schema (draft-7) figé d'un tool (undefined = tool sans paramètre). */
export function getInputJsonSchema(tool: ToolDef): JsonSchemaObject | undefined {
	return SCHEMAS[tool.operation];
}

export function findTool(operation: string): ToolDef | undefined {
	return TOOLS.find((tool) => tool.operation === operation);
}
