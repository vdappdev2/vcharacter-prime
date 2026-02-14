<script lang="ts">
	import '../app.css';
	import { CURRENT_NETWORK, SWITCH_NETWORK_URL } from '$lib/config';

	let { children } = $props();

	const isTestnet = CURRENT_NETWORK === 'testnet';
	const switchLabel = isTestnet ? 'Switch to Mainnet' : 'Switch to Testnet';
</script>

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

	<!-- Footer with network switch -->
	{#if SWITCH_NETWORK_URL}
		<footer class="text-center py-4">
			<a href={SWITCH_NETWORK_URL} class="network-switch-link">
				{switchLabel} &rarr;
			</a>
		</footer>
	{/if}
</div>
