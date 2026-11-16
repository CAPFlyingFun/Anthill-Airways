# 🐜✈️ Anthill Airways

**Start as an ant. End up running an airline to an island full of dinosaurs, a volcano… and a 5-star resort.**

An idle arcade tycoon (walk around, stack stuff on your back, unlock new land) with
**gate runs**: send your goods down a lane through `+ / x / - / ÷ / ?` gates to grow
(or shrink!) your payout.

▶️ **Play:** https://capflyingfun.github.io/Anthill-Airways/
On iPhone: open in Safari → Share → **Add to Home Screen** to install it as an app (works offline).

## 🐜✈️ Airport Tycoon (new, v0.68)
The new direction: an **insect-scale airport tycoon run by your fire ant colony**. Start it from ⚙️ Settings → 💾 an empty
save slot → 🐜✈️ Airport Tycoon. Everything is real size (1 unit = 2 mm): the lawn is a forest, a ladybug is your first
plane and flower nectar is the fuel. Your colony's ants are the real 3D models; every other bug, plant and airport piece
is built from code (`src/tycoon/`: `bugs/`, `flora/`, `airport/`, with the game in `airfield.ts`). The first airfield:
nectar → fuel → check-in → board → fly → land, with ants to hire for each job.
Art lab (dev only): `npx vite`, then `/Anthill-Airways/lab/?show=bugs|flora|airport`.

**v0.69, ideas from AirportPRG:** 🧳 seed-bags (each passenger's bag goes to the BAG DROP; a plane waits for its
passengers' bags on its gate's BAGS pad), 🗼 a one-bug-at-a-time runway (planes wait at the HOLD line or circle in a
holding pattern until the tower clears them: automatic since v0.69.2), ✈️ flight
chips along the bottom and a flight card per plane (`flightUi.ts`), and 📅 daily goals with ⭐ stars and a cash
bonus (`goals.ts`).

**v0.70:** ✈️ the fleet grows (🐝 bees → 🪽 dragonflies → 🦋 butterflies) and 🗺️ route tiles open longer routes with
higher fares (`fleet.ts`); ⬆️ the STAFF pad by the nest upgrades every ant job (`staff.ts`); 🎁 a Pollen Gift Shop
and a 👑 VIP Lounge (golden VIPs pay ×3 and board first); and 🦎 events (a lizard on the runway to shoo, a 🌧️ dew
shower, a 🪶 feather to find: `events.ts`). Take-offs and landings run themselves (v0.69.2).

## 🏝️ Anthill Island (test version, v0.33)

The new one-island game from the design doc, playable in its own save slot: **⚙️ Settings → Save slots →
an empty slot → 🏝️ Anthill Island (test)**. Your Anthill Airways slots aren't touched. This test is the
opening: the backyard, the café plot and, from v0.30, the Corner Store plot.

You're a person (Jack's model) with an **ant farm** in the backyard; the ants become your workforce. Every
station is a little business of its own, **raw supply → converter → counter → cash pad**, and every station
gets the same four helpers, each hired on a tile where it works:

| Helper | Job | 🏡 Backyard | ☕ Corner Café |
|---|---|---|---|
| 🐜 Gatherer (ant) | raw supply → the converter's IN | Farm Lv 2: Lv 2, $40 (bread box → farm) | Lv 8, $300 (bean sacks → coffee machine) |
| 🐜 Carrier (ant) | the converter's OUT → the counter's shelf | Farm Lv 3: Lv 3, $100 (farm → snack stand) | Lv 9, $400 (machine → café counter) |
| 🧑 Cashier (a person) | serves at the counter for you | Lv 4, $150 | Lv 10, $500 |
| 🏦 Banker (ant) | the cash pad → your wallet: idle income | Lv 5, $250 | Lv 11, $700 |

A **2nd cashier** at either counter is its ⬆️ panel's **LINE** upgrade (a second line, served at the same time;
at the snack stand, two neighbors at once), and after it **Bigger orders** (customers and neighbors want more).

- 🍞 Grab crumbs from the bread box → the farm's **IN** tray → the ants turn them into 🍪 snack packs on **OUT**.
- 🍪🙋 **The snack stand: the neighbors' orders.** Your neighbors line up at the snack stand by the street with
  their orders (a bubble over each one: "🙋 Rosa · 🍪 3/5"). The first one comes 8 s after the farm's first pack and
  wants **5 snack packs**, the next one **10**, then 6-11 (+1 every 3 levels); a new neighbor every 20 s (twice as
  often with the 2nd cashier). Stand on **SELL**: your packs go on the shelf and into their arms. Each pack pays
  **$7** (+5% per level) onto the stand's 💵 cash pad, and a filled order gives **lots of XP** (10 + 3 per pack;
  a quarter of that when the cashier fills it while you're elsewhere).
- 📦 **The delivery crate** turns up with Farm Lv 3: fill it with the snack packs and crumbs it asks for (6 + 6,
  then 8 + 8, then 10 + 10), it goes off for 60 s and comes back with **3 🪵 planks** (shown next to the area
  name). While it's away, its spot is empty: you can walk through it.
- 🏡 **New plots**: the tile by the east gate opens the **Corner Café** plot. It needs **Lv 7**, **2 ants working**,
  **3 planks** and **$400**; the sign over the gate ticks them off. The new plot hides a 🎁 **chest** ($150 + 40 XP; once opened, it's gone).
- 🛒 **The Corner Store** (v0.30), the plot after the café: its tile is by the café's east gate (once the café has its
  Gatherer) and needs **Lv 12**, **4 ants working**, **6 planks** and **$2,500**. 🥬 Grocery crates → the **packing table**
  (3.2 s a bag) → the checkout's SELL spot (**$50 a bag**, a shopper every 7 s). Its own four helpers: a gatherer (Lv 13,
  $1,500), a carrier (Lv 14, $2,000), a cashier (Lv 15, $2,500) and a banker ant (Lv 16, $3,500). Its plot hides a chest
  too ($600 + 80 XP). First-pass numbers: not balance-tested like the café's yet.
- ☕ **The café sells coffee**: 🫘 bean sacks → the **coffee machine** (3 s a cup) → the café's SELL spot ($20 a cup).
- Measured idle income with no bonuses (Lv 8): about **$240/min** from the backyard (the farm sells all it makes)
  and **$320/min** from the café.
- 💤 **Offline earnings**: while you're away (60 s or more), your helpers keep working. Coming back (or opening the
  app) shows the welcome-back card: your **+$/min** rate (what the banker ants collect) x the time away (4 h max)
  x 50%, the same rules and upgrades as the classic game, without the bonus gate run.
- ⬆️ The building panels work here too (bread box, farm, snack stand, bean sacks, coffee machine, café, Staff),
  and the arrow-and-quest tutorial (15 steps) walks you through all of it (⚙️ Settings → 📖 How to play has this
  game's guide).
- 🏘️ **The neighborhood** (v0.31, step 1 of "the street comes alive"): real houses across the street and up a side street
  that meets it at the corner (gable roofs, doors with porches, windows, garages and driveways: built to hold up in
  the 👁️ first-person view), a second sidewalk and crosswalks. Your customers come **out of a house's front door**,
  cross at the crosswalk, shop, and **walk home into a house** (not always the same one); a few neighbors are always
  out for a stroll. Your own house is a real house too. Each house is one merged mesh. Code: `src/world/neighborhood.ts`.
- 🚗 **Cars** (v0.32, step 2): procedural cars, vans and delivery trucks (`src/world/traffic.ts`) drive the street on
  the right, turn at the corner, keep their distance and brake for people on the crosswalks. Some customers **come
  by car**: it parks at the curb by the shop, one or two people get out, shop, walk back, and it drives off (people
  in a car aren't drawn, which is the point). A truck comes by when the delivery crate goes off.
- 🏬 **Shops are buildings** (v0.32, step 3): the café and the store stand in real buildings on their plots
  (`src/world/buildings.ts`): walls, shop-front windows, an awning and a sign on the street, a flat roof. In the 👁️
  first-person view the walls and roof are whole; in the top-down view only low wall stubs show, so you see in
  ("roofs off"). A lot's picket fence comes down when its shop goes up. Known: name tags show through walls in
  first person, and the ceiling reads dark from inside.
- 🚶 **Out on the street** (v0.33): once your first order is filled you can leave the yard by the gap in its fence
  (and a shop by its front door), walk both sidewalks, cross the street and go up the side street to the corner.
  Not into the neighbors' gardens; parked cars aren't solid yet. The cars brake for you.
- 🗺️ **The minimap** (top right, under the 👁️ 🎒 buttons, after Beyond Extinction's): north up, centred on you
  (the blue arrow), the stations as icons (a red **!** on a counter whose buyers wait at an empty shelf), glowing
  tiles as gold squares, and the quest as a pulsing gold ring (or a gold arrow on the edge when it's further
  away). Tap it for the whole map with names (`src/ui/minimap.ts`).
- Older saves are moved over automatically: v0.27's café cashier and banker (once Farm Lv 4 and 5) stay hired at
  the café; v0.28 added the stand and the café's coffee; v0.29 moved the neighbors' orders to the stand (the
  garden table is gone; an order open there is dropped). Mid-tutorial saves pick up at the first order.

Code: `src/homeMain.ts` (boot + loop + offline pay), `src/world/homeWorld.ts` (the backyard and the café),
`src/data/home.ts` (every number). Not in this test yet: the farm close-up and ride-along cam, and the next areas (airport, hotel, hospital, zoo).

## 🧪 DEV Room (temporary, v0.29.2 to v0.37)

Hidden from Settings since v0.29.6 (the button is still in the page, `hidden`); **`?devroom=1`** opens it. A performance test for the Custom Character Builder
System's female body: the builder's model is loaded **once** from the builder's own site, then cloned 1 to 20
times, each clone with her own belly size, height and painted outfit (Joshua's saved looks Char1 to Char3, in
turn). It shows frames per second, the slowest frame, triangles drawn and draw calls, with the game's current
small Sarah to compare. The outfits are stand-ins painted by height in the shader; the builder's real painted
clothes are not copied here. v0.29.3 adds test switches: **Detail** 100/50/25/10% (a lighter triangle list worked out
in the browser after loading, the model file untouched), body shapes on/off, full/plain materials and 2x/1x
sharpness, to find what the cost really is. v0.29.4: **Body shapes: live / baked / off** (baked = each person's
final shape worked out once into her own plain body, nothing blended per frame) and **Hidden pieces: drawn /
skipped** (the underwear pieces under the painted outfit, about half the body's points and 13 of its 14 draw calls). v0.29.5: **Motion: walk / idle / off**, using the builder's own
posing code (a copy in `src/vendor/ccbs/`, see its README): she breathes and sways standing, and walks with her
weight, on her bones, so it works the same with baked shapes. v0.33: Detail **5%** and **3%** (about 11.8k and 7.1k triangles a character with
hidden pieces skipped), **Smart detail** (her head keeps three times her body's share of triangles, same total), counts of
30 and 40, and an "each character: N triangles as drawn" line. v0.34: Smart detail is an **importance map**: her face and hands count 3x, her bust 3x, her belly 2x and her navel 6x
(found from her own body shapes: the points the navel, breastGrow and belly shapes move), fading smoothly so there are
no seams; the lightening also respects the skin picture's layout, and light baked bodies get corrected lighting directions. v0.35: **Auto** detail by distance from the camera to each person, in 3D (so zooming in raises it, as walking up to her
does in first person). Joshua's table, in metres (a unit is 0.6 m, people being 2.8 units tall): 0-4 m 30%, 4-8 m 20%,
8-12 m 10%, 12-15 m 5%, 15 m+ 3% (v0.36; the first table went up to 100% within 3 m). Each level's body is baked the first time she needs it, the two
heaviest are let go again once she is far away, and there is a 5% margin at each edge so nobody flickers. v0.37: **Looks: random** (the default): each character gets a belly of 0-50%, the builder's breast SIZE from -100 to +100,
her own tee and leggings colours (never a skin-toned tee), height, sleeves and leggings' length; **🎲 Shuffle** deals everyone
new ones. The DEV Room opens on 40 walking with auto detail, baked, smart detail on, hidden pieces skipped. Baked bodies keep four motion shapes live (the belly's sag,
drop and swing, the bust's drop), driven by the builder's spring rules; the other 39 are baked in. Nothing in the room touches the save. Code: `src/devRoom.ts`. Remove when the
character decision is made.

## 🎓 Tutorial and How to play

- A new game opens with a welcome card: **▶️ Show me how** or **Skip tutorial**.
- The guided tutorial (`src/world/tutorial.ts`) walks the first area step by step: the **quest card**
  (top left, under the area name, after Beyond Extinction's) says what to do (*🎯 QUEST 3/14*, a progress
  bar when there's something to count, a ✓ when it's done), a yellow arrow points where (or sits on the
  screen edge, pointing the way, when it's off-screen), and each step finishes itself when you do it. It
  ends once 🗺️ **Big Order: Tunnels** (the second area) is unlocked.
- 📱 **The HUD keeps the bottom corners free for your thumbs**: your level and the quest top left; your cash,
  👁️ and 🎒 (and, on Anthill Island, the minimap) top right; only the ⬆️ / 🚀 buttons, in the middle, at the bottom.
- **⚙️ Settings → 📖 How to play** (`src/ui/howto.ts`) has the whole game explained, plus
  **🔁 Replay the tutorial**. Saves that were already past the old hints don't get the tutorial again.

## Phase 1 prototype — Nest Entrance

- Drag anywhere for a floating joystick (WASD / arrows on desktop)
- 🎒 The backpack button (top right, under your cash) shows how much you carry ("5/8", red when full);
  tap it to see what's in it (ARK-style slots + a weight bar, closes by itself)
- Crumb piles → oven (IN / OUT) → SELL counter → beetle customers pay → collect cash
- Glowing tiles: pour cash in to unlock (crumb pile, cashier, gate runs, backpack,
  worker ants, faster oven, Big Order)
- Gate runs: load 5+ snack packs on the beetle cart, tap **LAUNCH RUN**, steer through gates
- Automation: Cashier, Worker Ants (crumbs → oven) and the **Runner Ant** (oven → counter)
- **XP & levels (ARK style):** XP comes from *doing* things (picking up, dropping off, selling,
  gate runs, helpers' sales, a fixed amount per unlock tile: 15 / 40 / 80 / 150 / 250 by world),
  never from money spent. Level L → L+1 takes **100 + 15 × (L − 1)** XP. Each level = 1 point for
  Carry (+1), Movement Speed (+2%), Work Speed (+3%), Haggling (+1% cash), Luck (? gates + fewer
  run losses), 😄 Charm (+1% customers), 📣 Leadership (+1.5% helpers), 🛡️ Toughness (−1.2% heat)
  or 💤 Night Manager (+0.5% offline share). Every stat (and each of the Queen's) **caps at 50**.
  All per-point values live in one table: `STAT_FX` / `QUEEN_FX` / `SHARD_FX` in `src/data/config.ts`.
- **⚖️ Balance pass (v0.25):** everything maxed used to multiply income ×141 (stats × upgrade pads ×
  shards); now it's about ×20–25. 🔒 The Big Orders between areas need a player level (Hangar,
  Airstrip, Island, Volcano, Resort), so a big offline payout can't skip whole areas. Older saves keep
  their level, cash, upgrades and shards, get a backup copy, one free stat respec and their
  half-earned eruption shards carried over (`src/core/migrate.ts`).
- Autosaves to the browser; Settings has sound + reset
- Every helper wears a gold **role title** over its head (🐜 WORKER, 🏃 RUNNER, 💵 CASHIER,
  🏦 BANKER…), and so does every crew member and creature with a job in the later acts

## Act 2 — The Airport (human scale)

Finish Act 1 (**Big Order: Airstrip**) and a 🧍 button appears top left. The camera zooms out
from your colony (now a planter box in the terminal) to human scale. Tap 🐜 to go back.
Both worlds keep running while you're in the other one, and the Bankers keep collecting.

- You're the terminal manager (Jack's model). Passengers check in (ticket cash + suitcases) → carry 🧳 bags to the
  **TO PLANE** belt → the plane takes off when its hold is full and pays per bag when it lands
- **The fleet:** Cessna 172 → Twin Prop → Learjet → Airliner, plus a **Helipad** 🚁
  (small hold, quick trips, big fares)
- **Ant Café:** the colony ships 🍱 snack boxes (faster the more of Act 1 you built) →
  carry them to the café → travellers buy them
- **Crew:** Check-in Agent, Baggage Handler, Barista, Café Host (the Anthill Airways
  flight crew), and your **personal assistant** (Sarah's model), who collects the cash
- The people (~11 MB) only download once you reach Act 2

## Act 3 — Dino Island 🏝️🦖

Buy **Big Order: Island** at the airport and the 🌍 button lets you fly between the
Colony, the Airport and Dino Island (all three keep earning in the background).

- 🥤 **Juice Bar**: pick 🍈 fruit → the BLENDER → sell 🥤 smoothies to tourists
- 🦖 **Dilo Show**: carry 🍖 from the supply drop to FEED. While the Dilophosaurus has a
  full belly, the crowd in the stands pays; a hungry dino means no show
- 🦤 **Dodo Ranch**: the Dodos (with their own walk animation) lay 🥚 in the nests →
  sell them at the Dodo Shop
- 🚤 **Photo Safari**: tourists fly in and wait on the pier → a gate run on the open sea.
  Sail past a breaching sea creature for a 📸 bonus, and the Megalodon boss at the finish
  pays ×1.25. The boat is away ~25 s per trip
- Crew for every job, a Boat Captain who runs safaris by himself, and **Sarah** 👩‍💼, who
  comes along as your island assistant and collects the cash (on the island, Jack and Sarah
  go by their names; at the airport and volcano they're just your role and your assistant)
- The island's models (Dodo, Dilophosaurus, 5 sea creatures, 5 trees) come from the
  Beyond-Extinction repo and only download the first time you fly there

## Act 4 — Mount Anthill 🌋🦖

Buy **Big Order: Volcano** on the island and the 🌍 menu gets a 🌋 Volcano stop. Helicopter
tours fly in to an active volcano:

- 💎 **Obsidian Mine**: mine 🪨 obsidian → the FORGE → sell polished 💎 gems at the Gem Shop
- ⚡ **Geothermal Plant**: carry 🔥 magma from the lava vent to MAGMA IN. While it's powered,
  **all your cash in every world is +25%**, and it sells power to the grid.
  Magma is hot: carry it too long and it burns away!
- 🚁 **Heli Tours**: a helicopter gate run over a lava valley: dodge ash clouds and lava bombs,
  fly past erupting lava fountains for 📸 bonuses, and the **Lava Rex** at the finish pays ×1.25
- 🦖 **Lava Rex**: a procedural T-Rex with glowing lava cracks. Feed it 🍖 at TAME (24 meat)
  and it's tamed (saddle and all): it hauls 40 at a time, and it's heat-proof
- 🐜 **Fire Ant Kingdom**: giant fire ants, your colony's ancient cousins! Bring the Fire
  Queen 💎 tribute; while she's pleased, her colony fills the vault with 🔶 Fire Crystals
  ($450 each at the Crystal Exchange). **🔶 Crystal Vault 2** opens a second vault (double the
  crystals) with its own Fire Ant Hauler; one 💎 Vault upgrade speeds up both
- Crew: Gem Shop Clerk, Obsidian Miner, Gem Runner, Tour Pilot, Crystal Trader, Fire Ant
  Haulers, and your personal assistant (Sarah's model) collecting the cash
- **Dangers:** 🥵 **heat** (stand near the lava lake and the heat bar fills; full = you drop
  everything; cool off at ❄️ MIST or buy the Heat Suit) and 🌋 **eruptions** (every 4–6 min:
  lava bombs land on red rings near you, lava flows cross the paths, and the tourists in line
  need evacuating, or half of them flee)

## Prestige: The Big Eruption 💎

The last volcano tile (**$6M**) opens the ERUPT altar. Stand on it to blow the top off the
mountain: **Dino Island and the Volcano reset** (unlocks + cash), and you earn
**💎 Obsidian Shards** (12 × √millions the **island + volcano** earned since the last eruption, e.g.
$30M ≈ 65 shards; offline pay and bonus runs don't count).
You keep the colony, the airport, your level, stats and the Queen.

Spend shards at the **💎 Obsidian Shrine** (tap your level): permanent upgrades that survive
every eruption: 💰 Obsidian Riches (+2% all cash per level, ×2 at 50), 👟 Lava Legs (+6% speed),
🍀 Lucky Ash (better gates), 🚀 Head Start (+$100k after each eruption) and 💤 Night Shift (+5% offline
share and +48 min offline time per level).

## Act 5 — The Anthill Grand Resort 🏨⭐

Buy **Big Order: Resort** at the volcano and the 🌍 menu gets a 🏨 Resort stop. Everyone your
airline flies in needs a bed:

- 🛎️ **Front desk**: guests check in (they pay a fee) and leave 🧳 luggage on the BAGS cart
- 🛗 **Elevator**: carry the luggage to the glass elevator. Each bag = a guest in a room
- 🛏️ **Rooms**: occupied rooms pay every night. Guests check out after a while, leaving a
  dirty room and 🧺 laundry down the chute
- 🧺 **Laundry**: laundry → WASHERS → clean 🧻 towels → LINEN (each towel makes up a room)
- 🍽️ **Kitchen & Buffet**: 🥬 groceries → KITCHEN → 🍽️ trays → sell at the BUFFET
- 🏊 **Pool & Spa** (3★): keep the towel rack stocked and the loungers pay
- 🌟 **Celebrity Penthouse** (4★) and the ✨ **5-Star Grand Gala** (5★, every price ×1.5 for good)
- ⭐ **Stars (1–5)**: clean rooms, a short line at the desk and no luggage pile-up (plus the
  kitchen and pool) raise your rating. Every star raises every price at the resort
- 🏗️ **The tower grows a floor (3 more rooms) with every unlock** you buy
- 🛒 **Bellhop Dash**: with 5+ bags on the cart, race them down the hotel hallways on a brass
  luggage trolley: dodge wet-floor signs and room-service carts, pass guests at open doors for
  💵 tips, and a celebrity at the finish tips ×1.25. Dashed bags check straight into rooms
- **Trouble:** 😡 complaints (sort them at the CONCIERGE desk in time or lose a star), ⚡ power
  outages (the elevator stops: fix it at the GENERATOR), 🐜 ants raiding the kitchen (walk over
  them!), and a 🦤 Dodo that escaped from the island (catch it!)
- Crew: Clerk, Bellhop, Housekeeper, Linen Runner, Chef, Waiter, Buffet Server, Pool Attendant,
  Engineer, Concierge, and your personal assistant (Sarah's model)
- Eruptions don't touch the resort: it's yours for good

## Building upgrades ⬆️ (v0.26)

No more pads on the ground: every building has its own **upgrade panel**, in every world.

- Walk up to a building and a purple **⬆️ button** appears at the bottom, in the middle (*⬆️ ⚙️ Oven*); it glows
  gold when you can afford a level. Tap it, or just **tap the building** (tap a helper for the
  **👷 Staff** tab), to open the panel. A quick tap opens it; dragging still walks.
- Each upgrade shows its level pips, what it does now → after the next level, and **×1 / ×5 / MAX**
  buttons (MAX = as many levels as you can afford). Up to **Lv 10**; each level costs ×1.85 more.
- ⭐ **Lv 5 and Lv 10 are milestones** with a bigger jump. The totals at Lv 5 and Lv 10 are exactly
  what the old pads gave, so the balance didn't move, and every level bought on the pads is kept
  (same upgrade ids in the save).

What's in the panels:

- ⚙️ **Machines** (oven, presses, blender, forge, washers, kitchen): cook speed (×3.5 at Lv 10)
- 🛒 **Shops & desks**: prices (×2) and customers (×1.8). Their 👥 line upgrade (once the first
  cashier works there) first hires a **2nd cashier** (a second line served at the same time), then
  becomes **Bigger orders**: customers buy +20% more per visit per level (check-in parties pay +20%)
- 🍞🌿🍬 **Resource piles** (one upgrade per kind, shared by every pile of that kind): regrow speed (×4)
- 👷 **Staff** tab (one per world): all helpers' speed (×2) and carry (+10); Bankers' and
  assistants' grab speed (×2.5) and cash (+60%)
- 🗑️ **Trash bin** (on the colony's first bin): money per piece in every world's bins ($1 → $50)

Code: `src/world/upgradePad.ts` (buildings, rows, effects, tapping), the panel in `src/ui/hud.ts`
(`openUpgrades`), the curves in `src/core/upgrades.ts`.

**Helper levels:** every helper earns 1 XP per item they deliver and levels up by themselves
(up to Lv 20, +4% speed each). Their level shows on their title (🐜 WORKER · Lv 3).

**📊 Lifetime stats:** tap your level, then *Lifetime stats*: cash earned (overall and per
world), time played, sales, items made, gate runs and your best run, helpers, upgrades and
your idle income.

## 👑 The Queen & 🗑️ paid trash

At level 20 the Queen is **crowned**. She stays on her throne (the 🏦 Banker Ants do the collecting)
and earns XP from the cash they bring in. Her points: 💰 **Tribute** (+2% on all Banker cash),
✋ **Grab Speed** (Bankers grab 4% faster) and 🗑️ **Royal Bins** (+4% trash money).

**Trash pays!** Every piece you dump in a 🗑️ bin (any world) pays **$1**, up to **$50** with the
colony's 🗑️ **Trash bin** upgrade (Lv 10). The bins take **100 pieces every 5 minutes**: your first piece
starts a ⏱️ 5-minute timer, and once 100 are in, the bin says *"Please wait… 27s remaining"* until the
timer runs out (it keeps counting while the game is closed).

## ✈️ Departures board

Under the zone name, a **🛫 Next:** chip shows your next big stop and how many of its steps are done
(*Next: 🦖 Dino Island · 1/2 steps*). Tap it for the full **DEPARTURES** board: Tunnels → Hangar →
Airport → Dino Island → Mount Anthill → Grand Resort, each marked DEPARTED ✅, NEXT (with its Big
Order's price) or LATER, so from the very first snack pack you can see where it all leads.

## 📦 Delivery contracts, 🚩 full carts & ⚠️ risky gates

Every regular gate run (cart, raft, safari, heli tour, bellhop dash) comes with a **contract**:
*"finish with 21 snack packs"*, shown at the start and over the cart (📦 14/21 → ✅). Fill it and the
haul pays **+50%**; miss it and you still get the regular haul. The goal is about 1.5× what you
*usually* load in that world, so loading more makes a safe route enough, and a light load needs a gamble.

🚩 **The cart holds up to ×6 what you loaded** (v0.26; the launch button says how many: *🚩 cart holds
up to 72*). Gates past that point can't add anything: the count shows **60 FULL**, a good gate says
*🚩 FULL*, and the rest of the run is about dodging the − / ÷ gates and the hazards to keep the haul.
Finish-line bonuses still count on top: the contract's +50% and the ×1.25 photo snaps (Megalodon,
celebrity, Lava Rex). A run that fills the cart is graded **FULL CART! 🏆**. The contract never asks for
more than the cart holds. The offline **bonus run** has no cap (its payout already tops out at ×2).
`CONFIG.run.maxLoad` in `src/data/config.ts`.

From your 3rd run, one or two rows are **risky**: a small safe **+N** on one side, a gold **×2 ⚠️ RISKY**
gate on the other with a big hazard right behind it (a puddle, shark, lava bomb or wet-floor sign).
Hit it and you lose 35% of the load, unless you swerve around it right after the gate.

## ⚠️ Station status tags

When something's holding up production, a small orange tag pops up over that station (after a
couple of seconds, so it doesn't flicker) and disappears once it's fixed:
😴 *Idle · needs crumbs* · 📦 *OUT full · pick it up* · 🛒 *Shelf full · slow buyers* ·
😟 *Shelf empty · buyers waiting* · 🙋 *No cashier · stand here* · 🧳 *BAGS full · pick them up*.
They show in every world, so you can tell which upgrade will help most.

If the game can't start (the browser refuses 3D graphics, or something crashes while loading), the
loading card turns into an explanation with a 🔄 **Retry** button instead of hanging.

## 🔊 Sound & music

- **Sound effects + music** are mp3 files in `public/audio/` (`manifest.json` lists which exist). Any
  sound that doesn't exist yet falls back to a tiny synth beep, so the game is never silent.
- **Plays with the iPhone's silent switch on** (only the volume buttons matter, like a music app).
- Settings has **🎵 Music** and **🔊 Effects** volume sliders (saved on your device) and the Sound on/off button.
- Each world has its own music (crossfades as you travel; gate runs get a chase loop), plus quiet
  ambience on the island (waves) and the volcano (rumbling), and a pterosaur cry over the island now and then.
- **From Beyond Extinction (Godot):** the island music, island + volcano ambience, the Lava Rex roar,
  the Dilophosaurus hiss, the dodo cluck, the splash and the pterosaur cry (`audio/supplied/`).
- **Everything else is made with ElevenLabs** from the prompts in `audio/sounds.json`, by the manual-only
  **Generate audio (ElevenLabs)** GitHub Action (`scripts/gen-audio.py`). It needs the `ELEVENLABS_API_KEY`
  repository secret, only makes sounds that are missing or whose prompt changed (re-runs are free), evens
  out the loudness, and commits the files back to the branch it ran on. Start with mode **dry-run**.

## Movement speed 🐢🐇

Settings has a **Movement speed** slider: how fast everyone walks, from 0.2x (slow) to 3x
(1x is normal, and there's a button to snap back). It affects you, the ants, people, dinos and
other creatures. Machines, cooking, flying items and food keep their normal pace. It's saved on
your device.

## Challenges ⚠️

Each act costs more than the last (Act 2 ≈ $290k total, the island ≈ $2.7M, the volcano ≈
$12.5M + the $6M eruption), and things go wrong:

- ⛈️ **Storms** (airport + island): a 15 s warning, then ~45 s of rain. Flights, safaris and
  island arrivals are grounded, the supply drop stops and fruit grows slower
- ⭐ **VIPs + rush hour** (airport): VIPs tip 6× but only wait 30 s; rush hour floods the
  check-in line for 40 s
- 🦖 **Dilo escape** (island): starve the Dilophosaurus for 20 s and it breaks out. If it
  chomps you, you drop everything. Lure it back to FEED with 🍖
- 🦖 **Thieves** (island): a baby Dilo sneaks in to steal. Catch it for a reward

## Save slots 💾

Settings has **3 save slots**, each a completely separate game (its own cash, levels and
unlocks). Your existing progress is Slot 1. Only the slot you're playing earns offline income;
switching pauses the one you leave, so slots never stack. Tapping an **empty** slot asks which game to start:
🏝️ **Anthill Island** (the new test version) or 🐜 **Anthill Airways** (`save.campaign`); resetting a slot keeps its game.

## Idle earnings 💤

While you play, the game measures your **automated** income (shown under your cash as +$/min): only cash
that helpers collect on their own (💼 Banker Ants, your assistants) counts, not bills you
pick up yourself. The colony's first Banker Ant ($300) starts your idle income. When you
come back after a while, the colony and airport pay **50% of that rate for the time away**
(up to **4 hours**). 💤 Night Manager points add up to +25%, and each 💎 Night Shift level adds +5% and
48 minutes (best: 100% for 8 hours). Collect it, or risk it on a **Bonus Run**: a tougher gate run
(more ÷ gates, double hazards, gates that 🔀 swap sides at the last second) that pays
**×0.75 to ×2**: 0.5 + half the share of bundles that reach the finish (`bonusRunMult` in config).

## First-person view 👁️

The eye button (top right, under your cash) switches either world to **first person**: you see through the
ant Major's eyes or your human character's, and your body is hidden. The **left half** of the screen is the joystick (walk + strafe), the **right half** is drag-to-look, in portrait and landscape.

## 3D models

Real rigged bug models, compressed for phones (`public/models`), legs animated in code:
fire ant **Major** (you), **Worker**, **Queen** and larvae, aphid, housefly, earthworm and
props from *Thronemound Colony Sim*; **Black Widow** and **Jumping Spider** from the
*TRADDOMIUM* releases; Huntsman, Wolf Spider, Ant-Mimicking Spider and the 10 people
(Jack, Sarah, the Director, passengers and flight crew) from TRADDOMIUM's "Modelsv1"
release. People walk with code-driven arms + legs too. The Lava Rex is built from shapes in
code (`src/actors/rex.ts`) until a real model is ready.

## Project layout

| Folder | What's in it |
| --- | --- |
| `src/data/config.ts` | **Every tunable number** (speeds, costs, gate math). Balance the game here. |
| `src/core` | Input (joystick), save, sound effects |
| `src/world` | The base map, stations, items/stacks, labels |
| `src/actors` | Ant & beetle models, player, worker AI |
| `src/runs` | Gate run mode |
| `src/ui` | HUD overlay |

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build into dist/
```

Pushing to `main` deploys automatically with GitHub Actions
(Settings → Pages → Source: **GitHub Actions**).

Tips: in the browser console, `game.base.addCash(500)` gives test cash and
`game.progress.addXp(100)` gives XP. Add `?speed=4` to the URL to fast-forward.
