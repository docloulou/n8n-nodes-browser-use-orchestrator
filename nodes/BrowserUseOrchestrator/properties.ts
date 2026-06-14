import type { INodeProperties } from 'n8n-workflow';

/**
 * Conversion JSON Schema (draft-7) -> propriétés n8n.
 *
 * Les schémas viennent de `browser-use-cdp-orchestrator/config.ts` (Zod)
 * convertis via `z.toJSONSchema` — la même source que l'UI web de l'orchestrateur.
 * Ainsi, modifier un paramètre côté orchestrateur = mettre à jour le submodule + rebuild,
 * sans toucher ce fichier.
 */

export type FieldKind = 'string' | 'number' | 'boolean' | 'stringArray' | 'record';

export interface FieldDef {
	/** Nom machine = clé envoyée à l'API (ex: `wait_seconds`). */
	name: string;
	required: boolean;
	kind: FieldKind;
	/** Propriété n8n de base, sans `displayOptions` (ajouté par le node). */
	prop: INodeProperties;
}

interface JsonSchemaNode {
	type?: string | string[];
	description?: string;
	properties?: Record<string, JsonSchemaNode>;
	required?: string[];
	items?: JsonSchemaNode;
	additionalProperties?: boolean | JsonSchemaNode;
	enum?: unknown[];
	minimum?: number;
	maximum?: number;
	anyOf?: JsonSchemaNode[];
	oneOf?: JsonSchemaNode[];
}

const ACRONYMS = new Set(['id', 'url', 'cdp', 'llm', 'ui']);

/** `wait_seconds` -> "Wait Seconds", `job_id` -> "Job ID". */
export function titleCase(name: string): string {
	return name
		.split(/[_\s]+/)
		.filter(Boolean)
		.map((word) =>
			ACRONYMS.has(word.toLowerCase())
				? word.toUpperCase()
				: word.charAt(0).toUpperCase() + word.slice(1),
		)
		.join(' ');
}

function resolveType(type?: string | string[]): string | undefined {
	if (Array.isArray(type)) return type.find((entry) => entry !== 'null');
	return type;
}

/** Aplati les wrappers `anyOf`/`oneOf` (générés par `.optional()`/`.nullable()`). */
function normalize(node: JsonSchemaNode): JsonSchemaNode {
	const variants = node.anyOf ?? node.oneOf;
	if (!node.type && variants && variants.length > 0) {
		const sub = variants.find((entry) => entry.type && entry.type !== 'null') ?? variants[0];
		return { ...sub, description: node.description ?? sub.description };
	}
	return node;
}

function buildField(name: string, raw: JsonSchemaNode, required: boolean): FieldDef {
	const node = normalize(raw);
	const displayName = titleCase(name);
	const description = (node.description ?? '').trim() || undefined;
	const type = resolveType(node.type);

	if (type === 'boolean') {
		return { name, required, kind: 'boolean', prop: { displayName, name, type: 'boolean', default: false, description } };
	}

	if (type === 'number' || type === 'integer') {
		const typeOptions: Record<string, number> = {};
		if (typeof node.minimum === 'number') typeOptions.minValue = node.minimum;
		if (typeof node.maximum === 'number') typeOptions.maxValue = node.maximum;
		return {
			name,
			required,
			kind: 'number',
			prop: {
				displayName,
				name,
				type: 'number',
				default: 0,
				description,
				...(Object.keys(typeOptions).length ? { typeOptions } : {}),
			},
		};
	}

	if (type === 'array') {
		return {
			name,
			required,
			kind: 'stringArray',
			prop: {
				displayName,
				name,
				type: 'string',
				typeOptions: { multipleValues: true },
				default: [],
				placeholder: 'Add value',
				description,
			},
		};
	}

	if (type === 'object') {
		return {
			name,
			required,
			kind: 'record',
			prop: {
				displayName,
				name,
				type: 'json',
				default: '{}',
				description,
			},
		};
	}

	return { name, required, kind: 'string', prop: { displayName, name, type: 'string', default: '', description } };
}

/** Construit les définitions de champ depuis un JSON Schema d'objet. */
export function buildFieldDefs(schema: JsonSchemaNode): FieldDef[] {
	const properties = schema.properties ?? {};
	const required = new Set(schema.required ?? []);
	return Object.entries(properties).map(([name, raw]) => buildField(name, raw, required.has(name)));
}
