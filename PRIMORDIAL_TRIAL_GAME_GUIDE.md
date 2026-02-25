# The Primordial Trial — Game Guide

A complete guide to character stats, traits, and how they shape your journey through The Primordial Trial.

---

## Character Creation

Your character is created through **provably fair dice rolls** — 4d6 per stat, a d6 for element, a d12 for spirit animal, and a d2 for sex. The randomness comes from a combination of your client seed and a Verus block hash, meaning no one (not even the game) can manipulate the outcome. Every roll is stored on-chain and can be independently verified.

---

## The Six Stats

Each stat is the sum of 4d6 (range 4–24, average ~14). Your **modifier** is derived from the total:

```
modifier = floor((total - 13) / 2)
```

| Total | Modifier |
|-------|----------|
| 4–5 | -4 |
| 6–7 | -3 |
| 8–9 | -2 |
| 10–11 | -1 |
| 12–13 | 0 |
| 14–15 | +1 |
| 16–17 | +2 |
| 18–19 | +3 |
| 20–21 | +4 |
| 22–24 | +5 |

An average roll of 14 gives +1, so a typical character already has a slight edge.

---

### STR — Strength

**Role:** Primary attack stat

- Added to every attack roll (d20 + STR modifier vs enemy defense)
- Added to every damage roll
- **Path of Might** requires STR 16+ — grants +1 damage for the entire trial

STR is your bread-and-butter combat stat. High STR means you hit more often and hit harder on every single round.

---

### DEX — Dexterity

**Role:** Primary defense stat

- Your base defense is **10 + DEX modifier** — enemies must roll this or higher to hit you
- **Path of Shadows** requires DEX 16+ — grants +1 defense for the entire trial
- **Puzzle Chamber** includes a DEX lock-picking check (DC 14) — success heals 8 HP, failure deals 3 damage

High DEX means enemies miss you more often. Over a long fight, that adds up fast.

---

### CON — Constitution

**Role:** Survivability

- Your max HP is **20 + (CON modifier × 3)** — a CON modifier of +3 gives you 29 HP instead of 20
- CON modifier also **reduces incoming damage** (minimum 1 damage per hit)
- **Path of Endurance** requires CON 16+ — grants +3 max HP immediately
- Minimum HP is always 5, even with a negative CON modifier

CON keeps you alive through sheer toughness. The damage reduction is especially strong against enemies with low base damage.

---

### INT — Intelligence

**Role:** Growing offensive power (Exploit Weakness)

- **Round 1:** INT has no combat effect — your character is sizing up the enemy
- **Round 2+:** Your INT modifier (if positive) is added to every attack roll alongside STR

This represents your character recognizing the enemy's patterns and exploiting weaknesses. A character with STR +2 and INT +2 attacks at +2 in round 1 but +4 from round 2 onward.

INT also has key uses outside combat:

- **Path of Cunning** requires INT 14+ — grants +2 to puzzle checks for the entire trial
- **Puzzle Chamber** includes an INT rune-deciphering check (DC 14) — success gives +2 attack vs the final boss, failure deals 4 damage

---

### WIS — Wisdom

**Role:** Growing defensive power (Insightful Defense) + Spirit Bond

WIS has two combat roles:

**Insightful Defense:**
- **Round 1:** WIS has no defense effect
- **Round 2+:** Your WIS modifier (if positive) is added to your defense alongside DEX

This represents reading the enemy's attack patterns. A character with DEX +1 and WIS +2 has defense 11 in round 1 but 13 from round 2 onward.

**Spirit Bond:**
WIS enhances your spirit animal's ability (see Spirit Animals below). Higher WIS means a stronger one-time spirit power.

WIS also has uses outside combat:

- **Path of Spirit** requires WIS 14+ — grants +2 to the Spirit Bargain CHA check
- **Puzzle Chamber** includes a WIS perception check (DC 14) — success grants a combat advantage vs the final boss, failure puts you in a vulnerable position

---

### CHA — Charisma

**Role:** Spirit Bargain negotiation

- **Path of Charm** requires CHA 14+ — grants +1 attack for the entire trial
- **Scene 5 — Spirit's Bargain:** You make a CHA check (DC 15) to negotiate with the ancestral spirit
  - **Pass:** You receive *both* the Gift of Power (+2 damage vs boss) and Gift of Wisdom (+2 defense vs boss)
  - **Fail:** You must choose only one gift — and choosing Power alone triggers Hard Mode (a stronger Primordial boss)

CHA is a one-time check, but it's arguably the most consequential roll in the game. Getting both gifts is a massive advantage in the final fight, and failing can make the boss significantly harder.

---

## Stat Comparison at a Glance

| Stat | Combat Role | When Active | Type |
|------|------------|-------------|------|
| STR | Attack rolls + damage | Every round | Offensive |
| DEX | Defense value | Every round | Defensive |
| CON | Max HP + damage reduction | Always | Survivability |
| INT | Attack rolls (pattern recognition) | Round 2+ | Offensive (growing) |
| WIS | Defense + spirit ability enhancement | Round 2+ / one-use | Defensive (growing) |
| CHA | Bargain check | One-time | Utility |

**No stat is wasted.** STR/DEX/CON carry you every round, INT/WIS ramp up as fights go longer, and CHA determines whether you enter the final battle with one gift or two.

---

## Elements

Your element is rolled on a d6. Each element provides a unique passive benefit:

| Element | Effect |
|---------|--------|
| **Fire** | +2 damage vs Wood enemies |
| **Water** | Perception bonus (narrative advantage) |
| **Earth** | +2 defense (always active) |
| **Air** | Always acts first in combat |
| **Wood** | Regenerates 1 HP at the end of each scene |
| **Metal** | +1 damage on all attacks |

Your element also determines which **Guardian** you face in Scene 3 — the guardian is always your counter-element:

| Your Element | Guardian | Guardian Traits |
|-------------|----------|-----------------|
| Fire | Water Serpent | 18 HP, fast, "Extinguish" reduces fire damage |
| Water | Earth Golem | 22 HP, tanky, "Absorb" heals when hit by water |
| Earth | Air Elemental | 14 HP, aggressive, "Erode" ignores earth defense |
| Air | Fire Phoenix | 16 HP, aggressive, "Updraft" removes air initiative |
| Wood | Metal Construct | 20 HP, balanced, "Chop" deals +3 vs wood |
| Metal | Fire Forge | 18 HP, balanced, "Melt" gives -2 defense to metal |

---

## Spirit Animals

Your spirit animal is rolled on a d12. Each grants a **one-use ability** that can be activated during any combat encounter. Choose your moment wisely — you only get one use per trial.

Spirit animals with numeric effects are enhanced by your **WIS modifier** (Spirit Bond). Higher WIS = stronger spirit power.

### Combat Spirits (enhanced by WIS)

| Spirit | Ability | Base Effect | With WIS Bonus |
|--------|---------|-------------|----------------|
| **Wolf** | Pack Tactics | +5 to next attack | +5 + WIS mod |
| **Dragon** | Dragon Fire | 8 direct damage | 8 + WIS mod |
| **Tiger** | Pounce | +3 damage on next attack | +3 + WIS mod |
| **Whale** | Ocean Vitality | Heal 6 HP | Heal 6 + WIS mod |
| **Frog** | Venom | 2 poison damage/round for 3 rounds | (2 + WIS mod/2) per round |

### Tactical Spirits (not affected by WIS)

| Spirit | Ability | Effect |
|--------|---------|--------|
| **Bear** | Mighty Roar | Enemy skips their next turn (stun) |
| **Eagle** | Perfect Clarity | Automatically succeed on next check/attack |
| **Spider** | Spectral Webs | Enemy's next attack automatically misses |
| **Owl** | Night Whispers | Automatically succeed on perception/puzzle check |
| **Octopus** | Escape Artist | Immune to grapple and traps |
| **Elephant** | Unshakeable | Immune to fear and stun effects |
| **Deer** | Swift Escape | Can flee combat without penalty |

**Strategy tip:** Combat spirits (Wolf, Dragon, Tiger) benefit from being used in later rounds when their WIS bonus stacks with existing momentum. Tactical spirits (Bear, Spider) are best used at critical moments regardless of WIS.

---

## The Trial — Scene by Scene

### Scene 1: The Summoning
Introduction to the trial. No mechanical choices.

### Scene 2: The Three Paths
Choose one of six paths into the trial grounds. Each requires a minimum stat:

| Path | Requirement | Bonus |
|------|------------|-------|
| Path of Might | STR 16+ | +1 damage (entire trial) |
| Path of Endurance | CON 16+ | +3 max HP (immediate) |
| Path of Cunning | INT 14+ | +2 to puzzle checks |
| Path of Spirit | WIS 14+ | +2 to Spirit Bargain CHA check |
| Path of Charm | CHA 14+ | +1 attack (entire trial) |
| Path of Shadows | DEX 16+ | +1 defense (entire trial) |

You can only choose paths you qualify for. Higher-requirement paths (STR/CON/DEX need 16+) tend to offer direct combat bonuses, while moderate-requirement paths (INT/WIS/CHA need 14+) offer strategic advantages.

### Scene 3: The First Guardian
Combat against your element's counter-guardian. This is your first real test. See the Elements section for guardian matchups.

### Scene 4: The Puzzle Chamber
Three skill checks in sequence:

1. **Decipher Runes** (INT, DC 14) — Success: +2 attack vs boss. Failure: 4 damage.
2. **Sense True Path** (WIS, DC 14) — Success: Combat advantage vs boss. Failure: Boss gets a free attack.
3. **Pick Lock** (DEX, DC 14) — Success: Heal 8 HP. Failure: 3 damage.

### Scene 5: The Spirit's Bargain
A CHA check (DC 15) determines your negotiating power:
- **Pass:** Receive both Gift of Power (+2 damage) and Gift of Wisdom (+2 defense) vs the final boss
- **Fail:** Choose one gift. Choosing Power alone triggers **Hard Mode** — the Primordial is stronger (28 HP, +5 attack, 14 defense, 6 base damage, regenerates 2 HP/round)

### Scene 6: The Final Trial
Battle against **The Primordial** — a being of pure elemental chaos.

**Standard Mode:** 25 HP, +4 attack, 13 defense, 5 base damage, d6 extra damage on special
**Hard Mode:** 28 HP, +5 attack, 14 defense, 6 base damage, d6 extra damage + 2 HP regen/round

This is where every stat comes together. STR and INT power your attacks, DEX and WIS protect you, CON keeps you standing, and the gifts from your CHA bargain tip the scales.

### Scene 7: Mark of the Worthy
Victory! Your achievement is recorded on-chain — provably fair, permanently verifiable.

---

## Combat Mechanics

Each combat round:
1. **You act first** (choose Attack, Defend, or Spirit Ability)
2. **Enemy attacks** (unless stunned or otherwise incapacitated)

**Attack:** Roll d20 + STR modifier (+ INT modifier from round 2+) vs enemy defense. Hit = deal weapon damage (d6+2) + STR modifier + element/buff bonuses.

**Defend:** Skip your attack but gain +4 defense for this round.

**Spirit Ability:** Use your one-time spirit animal power (see Spirit Animals).

**Damage reduction:** Your CON modifier (if positive) reduces all incoming damage (minimum 1).

---

## On-Chain Verification

Everything about your character — dice rolls, totals, modifiers, traits, and trial achievements — is stored on the Verus blockchain via your VerusID's content multimap. Anyone can:

1. Look up your VerusID
2. Extract the stored character data
3. Re-derive all dice rolls from the stored seeds and block hashes
4. Verify that every stat matches the provably fair derivation
5. Replay your boss fight to confirm the achievement is legitimate

No trust required. The math speaks for itself.
