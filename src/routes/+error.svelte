<script lang="ts">
	import { page } from '$app/stores';

	$: status = $page.status;
	$: message = $page.error?.message ?? 'Something went wrong.';
	$: isNotFound = status === 404;
</script>

<svelte:head>
	<title>{status} — vcharacter-prime</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="container mx-auto px-4 py-16 max-w-2xl text-center">
	<h1 class="text-6xl font-bold text-accent mb-4">{status}</h1>
	<p class="text-secondary mb-8">
		{#if isNotFound}
			That page doesn't exist.
		{:else}
			{message}
		{/if}
	</p>

	<nav class="space-x-4">
		<a href="/" class="network-switch-link">Create a character</a>
		<span class="text-secondary opacity-50">·</span>
		<a href="/verify" class="network-switch-link">Verify a character</a>
		<span class="text-secondary opacity-50">·</span>
		<a href="/how-it-works" class="network-switch-link">How it works</a>
	</nav>
</main>
