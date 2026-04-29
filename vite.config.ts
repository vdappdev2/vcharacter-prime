import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.ngrok-free.dev']
	},
	// Inject package.json version as a build-time constant. Read here in the
	// Node-side config (no FS-allow widening, no runtime fetch). Consumed in
	// src/lib/config.ts via a `declare const __APP_VERSION__: string` ambient.
	define: {
		__APP_VERSION__: JSON.stringify(packageJson.version)
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'node'
	}
});
