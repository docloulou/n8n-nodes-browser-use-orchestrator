import { configWithoutCloudSupport } from '@n8n/node-cli/eslint';

export default [
	{ ignores: ['browser-use-cdp-orchestrator/**'] },
	...configWithoutCloudSupport,
];
