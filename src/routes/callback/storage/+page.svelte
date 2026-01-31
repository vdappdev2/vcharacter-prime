<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<main class="container mx-auto px-4 py-8 max-w-2xl text-center">
	<div class="card glow-gold">
		{#if data.success}
			<div class="mb-4">
				<span class="text-4xl text-[var(--color-success)]">&#10003;</span>
			</div>
			<h1 class="text-2xl text-accent mb-4">Stored Successfully</h1>
			<p class="text-secondary mb-6">
				Your data has been saved to the blockchain.
			</p>
			<p class="text-xs text-secondary">
				You can return to your browser to see the confirmation.
			</p>
		{:else}
			<h1 class="text-2xl text-[var(--color-error)] mb-4">Storage Error</h1>
			<p class="text-secondary mb-6">{data.error || 'Unknown error'}</p>
			<a href="/" class="btn btn-primary">Return to Home</a>
		{/if}
	</div>
</main>
