import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class BrowserUseOrchestratorApi implements ICredentialType {
	name = 'browserUseOrchestratorApi';

	displayName = 'Browser Use Orchestrator API';

	documentationUrl = 'https://github.com/docloulou/browser-use-cdp-orchestrator';

	icon: Icon = { light: 'file:browseruse.svg', dark: 'file:browseruse.dark.svg' };

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'http://localhost:3000',
			placeholder: 'https://orchestrator.example.com',
			required: true,
			description: "URL publique du serveur orchestrateur (sans slash final). Expose /mcp et /ui/api/*",
		},
		{
			displayName: 'Auth Token',
			name: 'authToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'Valeur de AUTH_TOKEN (bearer). Laisser vide si le serveur tourne sans authentification',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.authToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/healthz',
			method: 'GET',
		},
	};
}
