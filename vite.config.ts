import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		allowedHosts: ['.ngrok-free.app', '.ngrok.io', '.ngrok-free.dev']
	}
});
