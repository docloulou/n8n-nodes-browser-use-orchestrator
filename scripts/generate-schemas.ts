/* eslint-disable no-console, @n8n/community-nodes/no-restricted-imports, @n8n/community-nodes/no-restricted-globals -- script de build (hors runtime n8n) */
/// <reference types="node" />
/**
 * Génère `nodes/BrowserUseOrchestrator/schemas.generated.ts` à partir des
 * schémas Zod de `nodes/BrowserUseOrchestrator/orchestrator/config.ts`.
 *
 * Pourquoi un build-time codegen : les community nodes n8n interdisent toute
 * dépendance runtime (`dependencies` doit être vide). Zod ne vit donc qu'en
 * devDependency : on fige les schémas en JSON Schema (draft-7) au build, et le
 * node ne dépend que de cet artefact statique.
 *
 * SYNC : re-coller `orchestrator/config.ts` puis `npm run build`
 * (qui relance ce script). Aucun autre fichier à toucher.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import {
	awaitJobInput,
	cancelJobInput,
	closeSessionInput,
	createProfileInput,
	fetchPageInput,
	sessionScreenshotInput,
	stepAgentInput,
	taskAgentInput,
	visionAgentInput,
} from '../nodes/BrowserUseOrchestrator/orchestrator/config';

/** Clé = nom du tool MCP (= valeur de l'opération n8n). */
const INPUTS: Record<string, z.ZodType> = {
	run_task_agent: taskAgentInput,
	run_vision_agent: visionAgentInput,
	fetch_page: fetchPageInput,
	run_session_step: stepAgentInput,
	await_job: awaitJobInput,
	cancel_job: cancelJobInput,
	close_session: closeSessionInput,
	get_session_screenshot: sessionScreenshotInput,
	create_profile: createProfileInput,
};

const schemas = Object.fromEntries(
	Object.entries(INPUTS).map(([name, schema]) => [name, z.toJSONSchema(schema, { target: 'draft-7' })]),
);

const out = join(process.cwd(), 'nodes/BrowserUseOrchestrator/schemas.generated.ts');
const contents =
	'// AUTO-GÉNÉRÉ par scripts/generate-schemas.ts — NE PAS ÉDITER À LA MAIN.\n' +
	'// Source : nodes/BrowserUseOrchestrator/orchestrator/config.ts (schémas Zod).\n' +
	'// Régénérer : npm run generate (ou npm run build).\n\n' +
	'export type JsonSchemaObject = Record<string, unknown>;\n\n' +
	`export const SCHEMAS: Record<string, JsonSchemaObject> = ${JSON.stringify(schemas, null, '\t')};\n`;

writeFileSync(out, contents);
console.log(`Schémas générés (${Object.keys(schemas).length}) → ${out}`);
