import type { IDataObject, IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { buildFieldDefs, type FieldDef } from './properties';
import { findTool, getInputJsonSchema, type ToolDef } from './registry';

export const CREDENTIALS_NAME = 'browserUseOrchestratorApi';

const ADDITIONAL_FIELDS = 'additionalFields';
const DEFAULT_WAIT_SECONDS = 120;
const MAX_TIMEOUT_SECONDS = 660;

/** Borne haute d'attente synchrone d'un seul appel (cf. orchestrator/config.ts). */
const MAX_WAIT_SECONDS = 600;

/** Statuts terminaux d'un job : plus rien à attendre. */
const TERMINAL_STATUSES = new Set(['done', 'error', 'cancelled']);

function isTerminal(state: IDataObject): boolean {
	return typeof state.status === 'string' && TERMINAL_STATUSES.has(state.status);
}

function baseUrlFrom(credentials: IDataObject): string {
	return String(credentials.baseUrl ?? '').replace(/\/+$/, '');
}

/** Timeout HTTP calé sur `wait_seconds` (+ marge pour le retour réseau). */
function computeTimeout(args: IDataObject): number {
	const wait = typeof args.wait_seconds === 'number' ? args.wait_seconds : DEFAULT_WAIT_SECONDS;
	return Math.min(wait + 30, MAX_TIMEOUT_SECONDS) * 1000;
}

/** Applique la transformation propre au type du champ, en ignorant les vides. */
function assign(target: IDataObject, def: FieldDef, value: unknown, skipEmpty: boolean): void {
	if (value === undefined || value === null) return;

	switch (def.kind) {
		case 'boolean':
			target[def.name] = Boolean(value);
			return;
		case 'number':
			target[def.name] = typeof value === 'string' ? Number(value) : (value as number);
			return;
		case 'string': {
			const str = String(value);
			if (skipEmpty && str.trim() === '') return;
			target[def.name] = str;
			return;
		}
		case 'stringArray': {
			const raw = Array.isArray(value)
				? (value as unknown[])
				: String(value)
						.split(',')
						.map((entry) => entry.trim());
			const arr = raw.map(String).filter((entry) => entry !== '');
			if (arr.length || !skipEmpty) target[def.name] = arr;
			return;
		}
		case 'record': {
			let obj: unknown = value;
			if (typeof value === 'string') {
				const trimmed = value.trim();
				if (skipEmpty && (trimmed === '' || trimmed === '{}')) return;
				obj = trimmed === '' ? {} : JSON.parse(trimmed);
			}
			if (obj && typeof obj === 'object') {
				if (skipEmpty && Object.keys(obj as IDataObject).length === 0) return;
				target[def.name] = obj as IDataObject;
			}
			return;
		}
	}
}

/** Rassemble les arguments d'un tool depuis les paramètres n8n du node. */
export function collectArgs(ctx: IExecuteFunctions, itemIndex: number, tool: ToolDef): IDataObject {
	const schema = getInputJsonSchema(tool);
	if (!schema) return {};

	const defs = buildFieldDefs(schema as never);
	const args: IDataObject = {};

	for (const def of defs.filter((d) => d.required)) {
		assign(args, def, ctx.getNodeParameter(def.name, itemIndex), false);
	}

	const optional = defs.filter((d) => !d.required);
	if (optional.length) {
		const additional = ctx.getNodeParameter(ADDITIONAL_FIELDS, itemIndex, {}) as IDataObject;
		for (const def of optional) {
			if (!(def.name in additional)) continue;
			assign(args, def, additional[def.name], true);
		}
	}

	return args;
}

/** Appel via l'API REST de l'UI (`/ui/api/*`). */
export async function restCall(
	ctx: IExecuteFunctions,
	tool: ToolDef,
	args: IDataObject,
): Promise<IDataObject> {
	const credentials = await ctx.getCredentials(CREDENTIALS_NAME);
	const rest = tool.rest;
	if (!rest) {
		throw new NodeOperationError(ctx.getNode(), `Tool "${tool.operation}" sans configuration REST.`);
	}

	const pathParams: IDataObject = {};
	const body: IDataObject = { ...args };
	for (const key of rest.pathParams) {
		pathParams[key] = args[key];
		delete body[key];
	}

	const options: IHttpRequestOptions = {
		method: rest.method,
		url: `${baseUrlFrom(credentials)}${rest.path(pathParams)}`,
		headers: { 'Content-Type': 'application/json' },
		json: true,
		timeout: computeTimeout(args),
	};
	if (rest.method !== 'GET' && rest.hasBody) options.body = body;

	return (await ctx.helpers.httpRequestWithAuthentication.call(
		ctx,
		CREDENTIALS_NAME,
		options,
	)) as IDataObject;
}

interface JsonRpcMessage {
	id?: number | string;
	result?: { isError?: boolean; structuredContent?: IDataObject; content?: Array<{ type: string; text?: string }> };
	error?: { message?: string };
}

/** Extrait le texte des blocs `content` d'un résultat de tool MCP. */
function textContent(result: JsonRpcMessage['result']): string {
	if (!result?.content) return '';
	return result.content
		.filter((part) => part.type === 'text' && typeof part.text === 'string')
		.map((part) => part.text)
		.join('\n');
}

/**
 * Le serveur MCP répond en flux SSE (`event: message` / `data: {...}`). On
 * collecte les lignes `data:`, on ignore les notifications (heartbeats), et on
 * retient la réponse JSON-RPC portant notre `id`.
 */
function parseMcpResponse(raw: unknown, id: number): JsonRpcMessage | null {
	if (typeof raw !== 'string') {
		const obj = raw as JsonRpcMessage | JsonRpcMessage[];
		if (Array.isArray(obj)) return obj.find((msg) => msg.id === id) ?? obj[0] ?? null;
		return obj ?? null;
	}

	let fallback: JsonRpcMessage | null = null;
	for (const line of raw.split(/\r?\n/)) {
		if (!line.startsWith('data:')) continue;
		const payload = line.slice(5).trim();
		if (!payload) continue;
		try {
			const msg = JSON.parse(payload) as JsonRpcMessage;
			if (msg && (msg.result !== undefined || msg.error !== undefined)) {
				if (msg.id === id) return msg;
				fallback = msg;
			}
		} catch {
			// ligne non-JSON (commentaire keep-alive) : ignorée
		}
	}
	return fallback;
}

/** Appel d'un tool via le serveur MCP (`POST /mcp`, JSON-RPC stateless). */
export async function mcpCall(
	ctx: IExecuteFunctions,
	tool: ToolDef,
	args: IDataObject,
): Promise<IDataObject> {
	const credentials = await ctx.getCredentials(CREDENTIALS_NAME);
	const id = Date.now();
	const requestBody = {
		jsonrpc: '2.0',
		id,
		method: 'tools/call',
		params: { name: tool.operation, arguments: args },
	};

	const options: IHttpRequestOptions = {
		method: 'POST',
		url: `${baseUrlFrom(credentials)}/mcp`,
		headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
		body: JSON.stringify(requestBody),
		timeout: computeTimeout(args),
	};

	const raw = await ctx.helpers.httpRequestWithAuthentication.call(ctx, CREDENTIALS_NAME, options);
	const message = parseMcpResponse(raw, id);

	if (!message) {
		throw new NodeOperationError(ctx.getNode(), 'Réponse MCP vide ou illisible.');
	}
	if (message.error) {
		throw new NodeOperationError(ctx.getNode(), message.error.message ?? 'Erreur MCP.');
	}
	if (message.result?.isError) {
		throw new NodeOperationError(ctx.getNode(), textContent(message.result) || 'Le tool MCP a renvoyé une erreur.');
	}

	if (message.result?.structuredContent !== undefined) return message.result.structuredContent;
	const text = textContent(message.result);
	try {
		return JSON.parse(text) as IDataObject;
	} catch {
		return { text };
	}
}

/**
 * Mode SYNCHRONE pour une opération qui lance un job : lance puis attend la fin.
 *
 * Le serveur attend déjà jusqu'à `wait_seconds` côté launch ; s'il dépasse, il
 * renvoie un `job_id` avec status=running. On enchaîne alors des `await_job`
 * (chacun plafonné à `MAX_WAIT_SECONDS`) jusqu'au statut terminal ou jusqu'à
 * épuisement du budget total `maxWaitSeconds`. Si le budget expire avant la fin,
 * on renvoie le dernier état connu (avec son `job_id`) : le job continue côté
 * serveur et reste récupérable via l'opération Await Job.
 */
export async function runJobToCompletion(
	ctx: IExecuteFunctions,
	tool: ToolDef,
	args: IDataObject,
	maxWaitSeconds: number,
): Promise<IDataObject> {
	const deadline = Date.now() + Math.max(0, maxWaitSeconds) * 1000;

	let state = await restCall(ctx, tool, args);
	if (isTerminal(state) || typeof state.job_id !== 'string') return state;

	const awaitTool = findTool('await_job');
	if (!awaitTool) return state;

	while (!isTerminal(state)) {
		const remaining = Math.ceil((deadline - Date.now()) / 1000);
		if (remaining <= 0) break;
		const window = Math.min(remaining, MAX_WAIT_SECONDS);
		state = await mcpCall(ctx, awaitTool, { job_id: state.job_id, wait_seconds: window });
	}

	return state;
}

/**
 * Mode ASYNCHRONE : lance sans attendre le résultat. On force `wait_seconds=0`
 * pour que le serveur renvoie immédiatement le `job_id` (status=running) ;
 * l'opération Await Job permettra de récupérer le résultat plus tard.
 */
export async function launchAsync(
	ctx: IExecuteFunctions,
	tool: ToolDef,
	args: IDataObject,
): Promise<IDataObject> {
	return restCall(ctx, tool, { ...args, wait_seconds: 0 });
}
