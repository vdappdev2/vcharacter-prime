<script lang="ts">
	const modifierFormula = `modifier = floor((total - 13) / 2)`;
</script>

<svelte:head>
	<title>Game guide — The Primordial Trial</title>
	<meta name="description" content="A complete guide to character stats, traits, and how they shape your journey through The Primordial Trial." />
</svelte:head>

<main class="max-w-3xl mx-auto px-6 py-12 prose-doc">
	<h1>The Primordial Trial — Game Guide</h1>
	<p>A complete guide to character stats, traits, and how they shape your journey through The Primordial Trial.</p>

	<hr/>

	<h2>Character Creation</h2>
	<p>Your character is created through <strong>provably fair dice rolls</strong> — 4d6 per stat, a d6 for element, a d12 for spirit animal, and a d2 for sex. The randomness comes from a combination of your client seed and a Verus block hash, meaning no one (not even the game) can manipulate the outcome. Every roll is stored on-chain and can be independently verified.</p>

	<hr/>

	<h2>The Six Stats</h2>
	<p>Each stat is the sum of 4d6 (range 4–24, average ~14). Your <strong>modifier</strong> is derived from the total:</p>
	<pre><code>{modifierFormula}</code></pre>
	<table>
		<thead>
			<tr><th>Total</th><th>Modifier</th></tr>
		</thead>
		<tbody>
			<tr><td>4–5</td><td>-4</td></tr>
			<tr><td>6–7</td><td>-3</td></tr>
			<tr><td>8–9</td><td>-2</td></tr>
			<tr><td>10–11</td><td>-1</td></tr>
			<tr><td>12–13</td><td>0</td></tr>
			<tr><td>14–15</td><td>+1</td></tr>
			<tr><td>16–17</td><td>+2</td></tr>
			<tr><td>18–19</td><td>+3</td></tr>
			<tr><td>20–21</td><td>+4</td></tr>
			<tr><td>22–24</td><td>+5</td></tr>
		</tbody>
	</table>
	<p>An average roll of 14 gives +1, so a typical character already has a slight edge.</p>

	<hr/>

	<h3>STR — Strength</h3>
	<p><strong>Role:</strong> Primary attack stat</p>
	<ul>
		<li>Added to every attack roll (d20 + STR modifier vs enemy defense)</li>
		<li>Added to every damage roll</li>
		<li><strong>Path of Might</strong> requires STR 16+ — grants +1 damage for the entire trial</li>
	</ul>
	<p>STR is your bread-and-butter combat stat. High STR means you hit more often and hit harder on every single round.</p>

	<hr/>

	<h3>DEX — Dexterity</h3>
	<p><strong>Role:</strong> Primary defense stat</p>
	<ul>
		<li>Your base defense is <strong>10 + DEX modifier</strong> — enemies must roll this or higher to hit you</li>
		<li><strong>Path of Shadows</strong> requires DEX 16+ — grants +1 defense for the entire trial</li>
		<li><strong>Puzzle Chamber</strong> includes a DEX lock-picking check (DC 14) — success heals 8 HP, failure deals 3 damage</li>
	</ul>
	<p>High DEX means enemies miss you more often. Over a long fight, that adds up fast.</p>

	<hr/>

	<h3>CON — Constitution</h3>
	<p><strong>Role:</strong> Survivability</p>
	<ul>
		<li>Your max HP is <strong>20 + (CON modifier × 3)</strong> — a CON modifier of +3 gives you 29 HP instead of 20</li>
		<li>CON modifier also <strong>reduces incoming damage</strong> (minimum 1 damage per hit)</li>
		<li><strong>Path of Endurance</strong> requires CON 16+ — grants +3 max HP immediately</li>
		<li>Minimum HP is always 5, even with a negative CON modifier</li>
	</ul>
	<p>CON keeps you alive through sheer toughness. The damage reduction is especially strong against enemies with low base damage.</p>

	<hr/>

	<h3>INT — Intelligence</h3>
	<p><strong>Role:</strong> Growing offensive power (Exploit Weakness)</p>
	<ul>
		<li><strong>Round 1:</strong> INT has no combat effect — your character is sizing up the enemy</li>
		<li><strong>Round 2+:</strong> Your INT modifier (if positive) is added to every attack roll alongside STR</li>
	</ul>
	<p>This represents your character recognizing the enemy's patterns and exploiting weaknesses. A character with STR +2 and INT +2 attacks at +2 in round 1 but +4 from round 2 onward.</p>
	<p>INT also has key uses outside combat:</p>
	<ul>
		<li><strong>Path of Cunning</strong> requires INT 14+ — grants +2 to puzzle checks for the entire trial</li>
		<li><strong>Puzzle Chamber</strong> includes an INT rune-deciphering check (DC 14) — success gives +2 attack vs the final boss, failure deals 4 damage</li>
	</ul>

	<hr/>

	<h3>WIS — Wisdom</h3>
	<p><strong>Role:</strong> Growing defensive power (Insightful Defense) + Spirit Bond</p>
	<p>WIS has two combat roles:</p>
	<p><strong>Insightful Defense:</strong></p>
	<ul>
		<li><strong>Round 1:</strong> WIS has no defense effect</li>
		<li><strong>Round 2+:</strong> Your WIS modifier (if positive) is added to your defense alongside DEX</li>
	</ul>
	<p>This represents reading the enemy's attack patterns. A character with DEX +1 and WIS +2 has defense 11 in round 1 but 13 from round 2 onward.</p>
	<p><strong>Spirit Bond:</strong><br/>
	WIS enhances your spirit animal's ability (see Spirit Animals below). Higher WIS means a stronger one-time spirit power.</p>
	<p>WIS also has uses outside combat:</p>
	<ul>
		<li><strong>Path of Spirit</strong> requires WIS 14+ — grants +2 to the Spirit Bargain CHA check</li>
		<li><strong>Puzzle Chamber</strong> includes a WIS perception check (DC 14) — success: you sense the Primordial readying its strike and slip past it (the Primordial skips its first attack in the boss fight). Failure: the Primordial attacks you first, while you're unprepared (a free attack before your first action).</li>
	</ul>

	<hr/>

	<h3>CHA — Charisma</h3>
	<p><strong>Role:</strong> Spirit Bargain negotiation</p>
	<ul>
		<li><strong>Path of Charm</strong> requires CHA 14+ — grants +1 attack for the entire trial</li>
		<li><strong>Scene 5 — Spirit's Bargain:</strong> You make a CHA check (DC 15) to negotiate with the ancestral spirit
			<ul>
				<li><strong>Pass:</strong> You receive <em>both</em> the Gift of Power (+2 damage vs boss) and Gift of Wisdom (+2 defense vs boss)</li>
				<li><strong>Fail:</strong> You must choose only one gift — and choosing Power alone triggers Hard Mode (a stronger Primordial boss)</li>
			</ul>
		</li>
	</ul>
	<p>CHA is a one-time check, but it's arguably the most consequential roll in the game. Getting both gifts is a massive advantage in the final fight, and failing can make the boss significantly harder.</p>

	<hr/>

	<h2>Stat Comparison at a Glance</h2>
	<table>
		<thead>
			<tr><th>Stat</th><th>Combat Role</th><th>When Active</th><th>Type</th></tr>
		</thead>
		<tbody>
			<tr><td>STR</td><td>Attack rolls + damage</td><td>Every round</td><td>Offensive</td></tr>
			<tr><td>DEX</td><td>Defense value</td><td>Every round</td><td>Defensive</td></tr>
			<tr><td>CON</td><td>Max HP + damage reduction</td><td>Always</td><td>Survivability</td></tr>
			<tr><td>INT</td><td>Attack rolls (pattern recognition)</td><td>Round 2+</td><td>Offensive (growing)</td></tr>
			<tr><td>WIS</td><td>Defense + spirit ability enhancement</td><td>Round 2+ / one-use</td><td>Defensive (growing)</td></tr>
			<tr><td>CHA</td><td>Bargain check</td><td>One-time</td><td>Utility</td></tr>
		</tbody>
	</table>
	<p><strong>No stat is wasted.</strong> STR/DEX/CON carry you every round, INT/WIS ramp up as fights go longer, and CHA determines whether you enter the final battle with one gift or two.</p>

	<hr/>

	<h2>Elements</h2>
	<p>Your element is rolled on a d6. Each element provides a unique passive benefit:</p>
	<table>
		<thead>
			<tr><th>Element</th><th>Effect</th></tr>
		</thead>
		<tbody>
			<tr><td><strong>Fire</strong></td><td>+3 damage on your first successful attack each combat</td></tr>
			<tr><td><strong>Water</strong></td><td>+3 to the WIS perception check (Scene 4)</td></tr>
			<tr><td><strong>Earth</strong></td><td>+2 defense (always active)</td></tr>
			<tr><td><strong>Air</strong></td><td>+4 to your round-1 attack roll, every combat</td></tr>
			<tr><td><strong>Wood</strong></td><td>Heals 2 HP at the end of each combat. <em>Last gasp:</em> if you and the enemy reach 0 HP in the same round, the regen pulls you back — victory through sacrifice.</td></tr>
			<tr><td><strong>Metal</strong></td><td>+1 damage on all attacks</td></tr>
		</tbody>
	</table>
	<p>Your element also determines which <strong>Guardian</strong> you face in Scene 3 — the guardian is always your counter-element:</p>
	<table>
		<thead>
			<tr><th>Your Element</th><th>Guardian</th><th>Guardian Traits</th></tr>
		</thead>
		<tbody>
			<tr><td>Fire</td><td>Water Serpent</td><td>18 HP, fast, "Extinguish" reduces fire damage</td></tr>
			<tr><td>Water</td><td>Earth Golem</td><td>22 HP, tanky, "Absorb" heals when hit by water</td></tr>
			<tr><td>Earth</td><td>Air Elemental</td><td>14 HP, aggressive, "Erode" ignores earth defense</td></tr>
			<tr><td>Air</td><td>Fire Phoenix</td><td>16 HP, aggressive, "Updraft" removes air initiative</td></tr>
			<tr><td>Wood</td><td>Metal Construct</td><td>20 HP, balanced, "Chop" deals +3 vs wood</td></tr>
			<tr><td>Metal</td><td>Fire Forge</td><td>18 HP, balanced, "Melt" gives -2 defense to metal</td></tr>
		</tbody>
	</table>

	<hr/>

	<h2>Spirit Animals</h2>
	<p>Your spirit animal is rolled on a d12. Each grants a <strong>one-use ability</strong> that can be activated during any combat encounter. Choose your moment wisely — you only get one use per trial.</p>
	<p>Spirit animals with numeric effects are enhanced by your <strong>WIS modifier</strong> (Spirit Bond). Higher WIS = stronger spirit power.</p>

	<h3>Combat Spirits (enhanced by WIS)</h3>
	<table>
		<thead>
			<tr><th>Spirit</th><th>Ability</th><th>Base Effect</th><th>With WIS Bonus</th></tr>
		</thead>
		<tbody>
			<tr><td><strong>Wolf</strong></td><td>Pack Tactics</td><td>+5 to next attack</td><td>+5 + WIS mod</td></tr>
			<tr><td><strong>Dragon</strong></td><td>Dragon Fire</td><td>8 direct damage</td><td>8 + WIS mod</td></tr>
			<tr><td><strong>Tiger</strong></td><td>Pounce</td><td>+3 damage on next attack</td><td>+3 + WIS mod</td></tr>
			<tr><td><strong>Whale</strong></td><td>Ocean Vitality</td><td>Heal 6 HP</td><td>Heal 6 + WIS mod</td></tr>
			<tr><td><strong>Frog</strong></td><td>Venom</td><td>2 poison damage/round for 3 rounds</td><td>(2 + WIS mod/2) per round</td></tr>
		</tbody>
	</table>

	<h3>Tactical Spirits (not affected by WIS)</h3>
	<table>
		<thead>
			<tr><th>Spirit</th><th>Ability</th><th>Effect</th></tr>
		</thead>
		<tbody>
			<tr><td><strong>Bear</strong></td><td>Mighty Roar</td><td>Enemy skips their next turn (stun)</td></tr>
			<tr><td><strong>Eagle</strong></td><td>Perfect Clarity</td><td>Automatically succeed on next check/attack</td></tr>
			<tr><td><strong>Spider</strong></td><td>Spectral Webs</td><td>Enemy's next attack automatically misses</td></tr>
			<tr><td><strong>Owl</strong></td><td>Night Whispers</td><td>Automatically succeed on perception/puzzle check</td></tr>
			<tr><td><strong>Octopus</strong></td><td>Escape Artist</td><td>Immune to grapple and traps</td></tr>
			<tr><td><strong>Elephant</strong></td><td>Unshakeable</td><td>Immune to fear and stun effects</td></tr>
			<tr><td><strong>Deer</strong></td><td>Swift Escape</td><td>Can flee combat without penalty</td></tr>
		</tbody>
	</table>
	<p><strong>Strategy tip:</strong> Combat spirits (Wolf, Dragon, Tiger) benefit from being used in later rounds when their WIS bonus stacks with existing momentum. Tactical spirits (Bear, Spider) are best used at critical moments regardless of WIS.</p>

	<hr/>

	<h2>The Trial — Scene by Scene</h2>

	<h3>Scene 1: The Summoning</h3>
	<p>Introduction to the trial. No mechanical choices.</p>

	<h3>Scene 2: The Three Paths</h3>
	<p>Choose one of six paths into the trial grounds. Each requires a minimum stat:</p>
	<table>
		<thead>
			<tr><th>Path</th><th>Requirement</th><th>Bonus</th></tr>
		</thead>
		<tbody>
			<tr><td>Path of Might</td><td>STR 16+</td><td>+1 damage (entire trial)</td></tr>
			<tr><td>Path of Endurance</td><td>CON 16+</td><td>+3 max HP (immediate)</td></tr>
			<tr><td>Path of Cunning</td><td>INT 14+</td><td>+2 to puzzle checks</td></tr>
			<tr><td>Path of Spirit</td><td>WIS 14+</td><td>+2 to Spirit Bargain CHA check</td></tr>
			<tr><td>Path of Charm</td><td>CHA 14+</td><td>+1 attack (entire trial)</td></tr>
			<tr><td>Path of Shadows</td><td>DEX 16+</td><td>+1 defense (entire trial)</td></tr>
		</tbody>
	</table>
	<p>You can only choose paths you qualify for. Higher-requirement paths (STR/CON/DEX need 16+) tend to offer direct combat bonuses, while moderate-requirement paths (INT/WIS/CHA need 14+) offer strategic advantages.</p>

	<h3>Scene 3: The First Guardian</h3>
	<p>Combat against your element's counter-guardian. This is your first real test. See the Elements section for guardian matchups.</p>

	<h3>Scene 4: The Puzzle Chamber</h3>
	<p>Three skill checks in sequence:</p>
	<ol>
		<li><strong>Decipher Runes</strong> (INT, DC 14) — Success: +2 attack vs boss. Failure: 4 damage.</li>
		<li><strong>Sense True Path</strong> (WIS, DC 14) — Success: the Primordial skips its first attack in the boss fight. Failure: the Primordial attacks you first, while you're unprepared — a free attack before your first action.</li>
		<li><strong>Pick Lock</strong> (DEX, DC 14) — Success: Heal 8 HP. Failure: 3 damage.</li>
	</ol>

	<h3>Scene 5: The Spirit's Bargain</h3>
	<p>A CHA check (DC 15) determines your negotiating power:</p>
	<ul>
		<li><strong>Pass:</strong> Receive both Gift of Power (+2 damage) and Gift of Wisdom (+2 defense) vs the final boss</li>
		<li><strong>Fail:</strong> Choose one gift. Choosing Power alone triggers <strong>Hard Mode</strong> — the Primordial is stronger (28 HP, +5 attack, 14 defense, 6 base damage, regenerates 2 HP/round)</li>
	</ul>

	<h3>Scene 6: The Final Trial</h3>
	<p>Battle against <strong>The Primordial</strong> — a being of pure elemental chaos.</p>
	<p><strong>Standard Mode:</strong> 25 HP, +4 attack, 13 defense, 5 base damage, d6 extra damage on special<br/>
	<strong>Hard Mode:</strong> 28 HP, +5 attack, 14 defense, 6 base damage, d6 extra damage + 2 HP regen/round</p>
	<p>This is where every stat comes together. STR and INT power your attacks, DEX and WIS protect you, CON keeps you standing, and the gifts from your CHA bargain tip the scales.</p>

	<h3>Scene 7: Mark of the Worthy</h3>
	<p>Victory! Your achievement is recorded on-chain — permanently verifiable as part of your character's history.</p>

	<hr/>

	<h2>Combat Mechanics</h2>
	<p>Each combat round:</p>
	<ol>
		<li><strong>You act first</strong> (choose Attack, Defend, or Spirit Ability)</li>
		<li><strong>Enemy attacks</strong> (unless stunned or otherwise incapacitated)</li>
	</ol>
	<p><strong>Attack:</strong> Roll d20 + STR modifier (+ INT modifier from round 2+) vs enemy defense. Hit = deal weapon damage (d6+2) + STR modifier + element/buff bonuses.</p>
	<p><strong>Defend:</strong> Skip your attack but gain +4 defense for this round.</p>
	<p><strong>Spirit Ability:</strong> Use your one-time spirit animal power (see Spirit Animals).</p>
	<p><strong>Damage reduction:</strong> Your CON modifier (if positive) reduces all incoming damage (minimum 1).</p>

	<hr/>

	<h2>On-Chain Verification</h2>
	<p>Everything about your character — dice rolls, totals, modifiers, traits, and trial achievements — is stored on the Verus blockchain via your VerusID's content multimap. Anyone can:</p>
	<ol>
		<li>Look up your VerusID</li>
		<li>Extract the stored character data</li>
		<li>Re-derive all dice rolls from the stored seeds and block hashes</li>
		<li>Verify that every stat matches the provably fair derivation</li>
		<li>Replay your boss fight to confirm the achievement is legitimate</li>
	</ol>
	<p>No trust required. The math speaks for itself.</p>
</main>
