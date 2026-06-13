import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { buildFieldDefs } from './properties';
import { findTool, getInputJsonSchema, RESOURCES, TOOLS } from './registry';
import { collectArgs, launchAsync, mcpCall, restCall, runJobToCompletion } from './transport';

/** Budget d'attente par défaut (s) en mode synchrone. */
const DEFAULT_SYNC_MAX_WAIT_SECONDS = 300;

/**
 * Construit la liste des propriétés du node :
 *  - 1 sélecteur "Resource",
 *  - 1 sélecteur "Operation" par resource,
 *  - les paramètres de chaque tool, dérivés des schémas Zod de l'orchestrateur.
 *
 * Tout est généré au chargement du module : re-coller `orchestrator/config.ts`
 * suffit à propager un changement de schéma (les champs apparaissent seuls).
 */
function buildProperties(): INodeProperties[] {
	const properties: INodeProperties[] = [
		{
			displayName: 'Resource',
			name: 'resource',
			type: 'options',
			noDataExpression: true,
			options: RESOURCES.map((resource) => ({ name: resource.name, value: resource.value })),
			default: 'agent',
		},
	];

	for (const resource of RESOURCES) {
		const tools = TOOLS.filter((tool) => tool.resource === resource.value);
		if (!tools.length) continue;
		// eslint-disable-next-line n8n-nodes-base/node-param-default-missing -- défaut dynamique (1re opération de la resource)
		properties.push({
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			noDataExpression: true,
			displayOptions: { show: { resource: [resource.value] } },
			options: tools.map((tool) => ({
				name: tool.name,
				value: tool.operation,
				description: tool.description,
				action: tool.action,
			})),
			default: tools[0].operation,
		});
	}

	for (const tool of TOOLS) {
		const schema = getInputJsonSchema(tool);
		if (!schema) continue;

		const defs = buildFieldDefs(schema as never);
		const show = { resource: [tool.resource], operation: [tool.operation] };

		for (const def of defs.filter((d) => d.required)) {
			properties.push({ ...def.prop, required: true, displayOptions: { show } });
		}

		const optional = defs.filter((d) => !d.required);
		if (optional.length) {
			properties.push({
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show },
				options: optional.map((def) => def.prop),
			});
		}
	}

	// Choix synchrone/asynchrone pour les opérations qui lancent un job.
	const jobOps = TOOLS.filter((tool) => tool.producesJob).map((tool) => tool.operation);
	if (jobOps.length) {
		properties.push(
			{
				displayName: 'Execution Mode',
				name: 'executionMode',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Asynchronous (Return Job ID)',
						value: 'async',
						description: 'Lance le job et rend la main immédiatement avec un job_id (à suivre via Await Job)',
					},
					{
						name: 'Synchronous (Wait for Result)',
						value: 'sync',
						description: "Attend la fin du job et renvoie son résultat (relance Await Job en interne jusqu'à la fin ou l'expiration de Max Wait)",
					},
				],
				default: 'sync',
				displayOptions: { show: { operation: jobOps } },
			},
			{
				displayName: 'Max Wait (Seconds)',
				name: 'syncMaxWaitSeconds',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: DEFAULT_SYNC_MAX_WAIT_SECONDS,
				description:
					"Mode synchrone : durée totale max d'attente avant de rendre la main. Si le job n'est pas fini, le node renvoie l'état courant (avec job_id) ; le job continue côté serveur et reste récupérable via Await Job.",
				displayOptions: { show: { operation: jobOps, executionMode: ['sync'] } },
			},
		);
	}

	return properties;
}

export class BrowserUseOrchestrator implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Browser Use Orchestrator',
		name: 'browserUseOrchestrator',
		icon: { light: 'file:browseruse.svg', dark: 'file:browseruse.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["operation"] }}',
		description: 'Pilote browser-use-cdp-orchestrator (agents web, sessions, jobs, profils)',
		defaults: { name: 'Browser Use Orchestrator' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'browserUseOrchestratorApi', required: true }],
		properties: buildProperties(),
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				const tool = findTool(operation);
				if (!tool) {
					throw new NodeOperationError(this.getNode(), `Opération inconnue : ${operation}`, {
						itemIndex: i,
					});
				}

				const args = collectArgs(this, i, tool);
				let data: IDataObject;

				if (tool.producesJob) {
					const executionMode = this.getNodeParameter('executionMode', i, 'sync') as string;
					if (executionMode === 'async') {
						data = await launchAsync(this, tool, args);
					} else {
						const maxWait = this.getNodeParameter(
							'syncMaxWaitSeconds',
							i,
							DEFAULT_SYNC_MAX_WAIT_SECONDS,
						) as number;
						data = await runJobToCompletion(this, tool, args, maxWait);
					}
				} else {
					data =
						tool.transport === 'rest'
							? await restCall(this, tool, args)
							: await mcpCall(this, tool, args);
				}

				returnData.push({ json: data ?? {}, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
