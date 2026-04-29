<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { CURRENT_NETWORK, SWITCH_NETWORK_URL } from '$lib/config';

	let { children } = $props();

	const isTestnet = CURRENT_NETWORK === 'testnet';
	const switchLabel = isTestnet ? 'Switch to Mainnet' : 'Switch to Testnet';

	const SITE_URL = 'https://prime.vcharacter.xyz';
	const OG_IMAGE = `${SITE_URL}/vcharacter-og-image.png`;
</script>

<svelte:head>
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="vcharacter-prime" />
	<meta property="og:image" content={OG_IMAGE} />
	<meta property="og:url" content="{SITE_URL}{$page.url.pathname}" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content={OG_IMAGE} />
</svelte:head>

<div class="min-h-screen flex flex-col">
	<!-- Network indicator -->
	<div class="text-center py-1">
		<span class="network-badge" class:network-badge-testnet={isTestnet} class:network-badge-mainnet={!isTestnet}>
			{CURRENT_NETWORK}
		</span>
	</div>

	<div class="flex-1">
		{@render children()}
	</div>

	<!-- Footer: site nav + network switch -->
	<footer class="text-center py-4 space-y-2">
		<nav class="text-xs space-x-3">
			<a href="/" class="network-switch-link">Create</a>
			<span class="text-secondary opacity-50">·</span>
			<a href="/play" class="network-switch-link">Play</a>
			<span class="text-secondary opacity-50">·</span>
			<a href="/verify" class="network-switch-link">Verify</a>
			<span class="text-secondary opacity-50">·</span>
			<a href="/how-it-works" class="network-switch-link">How it works</a>
			<span class="text-secondary opacity-50">·</span>
			<a href="/game-guide" class="network-switch-link">Game guide</a>
			<span class="text-secondary opacity-50">·</span>
			<a href="/verus-primer" class="network-switch-link">Verus Primer</a>
		</nav>
		{#if SWITCH_NETWORK_URL}
			<a href={SWITCH_NETWORK_URL} class="network-switch-link">
				{switchLabel} &rarr;
			</a>
		{/if}
	</footer>
</div>
