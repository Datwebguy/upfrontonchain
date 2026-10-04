# Upfront: design

**What it should feel like:** money moving in plain sight. Calm, confident and alive, like a well-designed finance product, not a crypto template.

**Banned:**
- purple-to-blue gradients,
- glowing orbs,
- glassmorphism cards everywhere,
- stock 3D blobs,
- emoji in headings,
- "Revolutionizing DeFi"-style copy,
- generic icon grids,
- dark mode with neon by default.

---

## 1. Brand

### Name and voice
- **Upfront**, always written with a capital U in text and lowercase in the logo wordmark (`upfront`).
- **Voice:** short, direct, honest. Talk like a person, not a protocol.
- **One idea per sentence.** If a sentence needs a comma, try splitting it.

### Logo
- **Mark:** a soft, rounded **U** (the pool), with a small solid **coin** sitting just above and slightly ahead of it, as if dropping in. It reads as "money comes in, and it comes first."
- **Wordmark:** `upfront` in the display font, tight letter spacing. The mark sits on the left.
- **Animated version** (website hero and app loading only): the coin drops into the U once, the U gives a tiny bounce, then the coin rises back to rest above it. 600ms, once per visit.
- **Versions to export:**
  - mark only,
  - mark + wordmark,
  - one-colour ink,
  - one-colour bone (for dark backgrounds),
  - a 1024px app icon.
- **Favicon:** the mark only, coin in Signal orange, U in Ink, on a transparent background. Provide `favicon.svg`, `favicon.ico` (32/16), `apple-touch-icon.png` (180) and `icon-512.png`. Make sure the coin is still visible at 16px; if not, enlarge the coin for the small sizes.

### Colour

| Token | Hex | Use |
|---|---|---|
| Ink | `#111311` | Main text, dark sections, primary buttons |
| Bone | `#F3EFE6` | Website background, light surfaces |
| Paper | `#FBF9F4` | Cards on Bone |
| Signal | `#FF5A1F` | The one accent: coins, live fees, key buttons, the "upfront" moment |
| Moss | `#1F4D3A` | Earnings, success, repayment progress |
| Sky | `#C9DEF2` | Lender side, info |
| Graphite | `#5D605B` | Secondary text |
| Line | `#E2DCCF` | Borders, dividers |

**Rules:**
- Signal is used sparingly: one Signal element per screen area. It is the colour of money moving.
- The website is light (Bone). The app has light and dark themes. Dark uses Ink, with Bone text and the same Signal.
- Every pair of text and background colours must pass WCAG AA contrast.

### Type (Google Fonts)

| Role | Font | Notes |
|---|---|---|
| Display (headlines, logo) | **Bricolage Grotesque** (600–800) | Characterful without being loud. Tight tracking on big sizes. |
| Body and UI | **Geist** (400–600) | Clean, very readable at small sizes |
| Numbers | **Geist Mono** with tabular figures | Every amount, fee and percentage, so numbers line up and don't jump while counting |
| Accent (rare) | **Instrument Serif** italic | One word per headline at most, for emphasis, e.g. "Get paid *upfront*." |

**Scale (website):**
- hero 88/96px desktop, 48px mobile,
- section headings 48px,
- body 18px.

**Scale (app):**
- page titles 28px,
- body 15px,
- big numbers 40px.

---

## 2. Motion

**Library:** Motion (motion.dev) for React. Every animation must mean something: money arriving, splitting or repaying.

| Moment | Animation |
|---|---|
| Website hero background | A slow **fee stream**: thin lines flow left to right into rounded "pools". When real swaps happen on Upfront pools, a Signal-coloured coin travels along a line and drops in. Coins appear **only for real swap events**, read live from the chain. With no events, the lines flow calmly with no coins. Nothing is invented. |
| Headlines | Words rise in one by one (40ms stagger) on first view only |
| Section reveals | Fade and rise 16px as each section scrolls into view |
| "How it works" | A sticky three-step sequence. As you scroll: a pool is created, a trade drops a coin that splits into coloured shares, and an "Upfront" offer slides in. |
| Live numbers | Count up from the previous value to the new one. Never from zero on every refresh. |
| App: fee split | When a trade lands on your pool, the coin splits into the owner, referrer, app and protocol bars |
| App: repayment | The progress bar fills smoothly. At 100% it changes from Signal to Moss, with a short single pulse. |
| Buttons | 1–2px lift and a darker shade on hover. A press scales to 0.98. |
| Page transitions (app) | 150ms crossfade. No sliding panels. |

**Rules:**
- **Respect `prefers-reduced-motion`.** Turn off the stream, staggers and count-ups, and show final states.
- **Keep animations short.** No animation over 800ms, except the background stream.
- **Never block input with an animation.**

---

## 3. Website (landing page)

**Goal:** a first-time visitor understands Upfront in 10 seconds and knows exactly where to click.

**Top bar** (sticky, Bone with a hairline border on scroll):
- logo on the left,
- links: How it works · For you · FAQ,
- on the right: **Open app** (Ink button).

### Sections, in order

1. **Hero**
   - **Headline:** "Every trade in your pool *pays you*."
   - **Subline:** "And you can get those earnings upfront."
   - **Buttons:** **Launch a pool** (Signal, primary) → `/app/launch` · **Earn as a lender** (outline) → `/app/lend`.
   - **Small line under the buttons:** "Built on Robinhood Chain · Paid in USDG".
   - **Background:** the live fee stream.
2. **Live strip**
   - Three live numbers from the contracts: Fees paid to owners · Paid upfront · Repaid.
   - **If a number is zero, show the word "Starting"** instead of a big zero. Never invent a number.
3. **How it works** (sticky scroll, three steps, each one short line):
   1. "Launch a pool. Your fee is shown to every trader."
   2. "Every trade pays you in USDG."
   3. "Get your future earnings upfront. They repay themselves."
   - **Button:** **Launch a pool**.
4. **For you** (tabs; each tab shows one line plus one button)
   - **Creators:** "Your coin's trades pay you." → Launch a pool
   - **Trading apps:** "Earn from your users' trades, openly." → Launch a pool
   - **Communities:** "Bring the traders, earn the fees." → Launch a pool
   - **Traders:** "The fee you see is the fee you pay." → Trade
   - **Lenders:** "Earn from advances that repay themselves." → Lend
5. **Honest fees**
   - **The core promise, in one line:** "No hidden cut. The fee is on screen before you trade."
   - **Live proof:** a comparison of the total fee shown against the total fee charged on recent Upfront swaps, read from chain events (they will always match).
6. **FAQ:** an accordion with text from `FAQ.md`. Open one question at a time.
7. **Final call:** a big Ink section with the line "Your pool. Your fees. *Upfront.*" and both buttons again.
8. **Footer** (see §5).

**Website copy rules:**
- No paragraph over two lines on desktop.
- No jargon: no "hook", "delta", "bps", "PoolManager", "smart contract", "protocol-owned".
- Every section ends with a way into the app.

---

## 4. App

**Goal:** someone who has never used it can launch a pool, trade, claim or lend without reading instructions.

**Layout:**
- **Desktop:** a left sidebar with Home · Launch · Trade · Lend; wallet and network at the top right.
- **Mobile:** a bottom tab bar with the same four items.

**Text rules:**
- **Labels, numbers and buttons only.** Explanations live in a small "?" tooltip, one sentence each.
- **At most one helper line per screen.**
- **Every button says what happens:** "Launch pool", "Claim 120.40 USDG", "Get 8,000 USDG now", "Deposit".
- **Raw transactions are called "Receipt"**, linking to the explorer. Never show a raw hash as the main text.

### First visit (not connected)
- **Home shows one card:** "Connect your wallet to launch, trade or lend" with a **Connect** button.
- **Wrong network:** a single banner, "Switch to Robinhood Chain", with a **Switch** button. Nothing else is blocked visually.
- **No USDG or ETH on testnet:** a small card with links to the Robinhood faucet and the Paxos faucet.

### Launch (3 steps, progress dots at the top)
1. **Token:** a searchable list read live (logo, symbol, name). The pair is always USDG, shown as a fixed chip.
2. **Fee and split:**
   - a fee slider with presets,
   - a split shown as one horizontal bar with draggable sections (You · App · Referrer), the protocol share fixed and labelled,
   - one "?" line under the bar: "Referrer = whoever sends the trade. No referrer? That share is yours.",
   - a live preview: "On a $1,000 trade, you earn $X."
3. **Add funds:** amount inputs, then **Launch pool**.

**Success screen:**
- the pool link, a **Copy link** button, a **Share on X** button with pre-filled text and @upfrontonchain,
- **Go to my pool**.

### Pool
- **Top:** big earnings number (USDG), with a **Claim** button next to it.
- **Middle:** an earnings chart by day, from on-chain events.
- **Upfront card:**
  - **Before eligibility:** a progress ring towards eligibility, with the time and earnings still needed.
  - **When eligible:** "Get X USDG now", a "Repaid from 20% of your fees" line, and an **Accept** button.
  - **During repayment:** a progress bar with the amount left.
- **Recent trades:** time, size, fee and a receipt link.

### Trade
- Two token inputs with a flip button.
- **Before the button,** one line in Signal with the **total** fee: "Fee: 0.55% · $5.50". Tapping it shows the breakdown: Pool 0.30% · Upfront 0.25%.
- **Button:** "Swap".

### Lend
- **Top:** your deposit and what it has earned.
- **Deposit / Withdraw** toggle with one input.
- **Below:** active advances. Each shows its pool, the amount and how much is repaid.
- **One-line risk note,** with a "?" for details.

### States
- **Every list has an honest empty state** with a next action.
- **Loading:** skeletons in the shape of the content. No spinners on full pages.
- **Errors:** plain words plus what to do. For example: "Not enough USDG. Get test USDG ↗"

---

## 5. Footer

**Background:** Ink, with Bone text. The Signal coin from the logo sits large and faded at the bottom right as a single graphic.

| Column | Links |
|---|---|
| **Upfront** | Logo, the line "Every trade pays you. Get it upfront.", @upfrontonchain |
| **Product** | Launch a pool · Trade · Lend · My pools |
| **Learn** | How it works · FAQ · Fees · Risks |
| **Build** | GitHub · Contracts on the explorer · Robinhood Chain docs |

**Bottom row:** "Built on Robinhood Chain · Paid in USDG" on the left, the year and a short risk line on the right ("Lending carries risk. Fees are shown before every trade.").

**Mobile:** the columns become an accordion.

---

## 6. Words to use in the product

| Don't say | Say |
|---|---|
| Hook | (don't mention) |
| Deploy a hook / pool | Launch a pool |
| Swap fee bps | Fee (%) |
| Advance / credit line | Get paid upfront / Your Upfront offer |
| Repayment share | Repaid from X% of your fees |
| ERC-4626 vault | Lend |
| Claimable balance | Ready to claim |
| Tx hash | Receipt |
| Revert / execution reverted | Plain reason + what to do |
| Insufficient allowance | Approve USDG first (with an **Approve** button) |

---

## 7. Quality bar

- **Lighthouse:** 90+ for performance and accessibility on the website.
- **Responsive:** works at 360px wide with no sideways scrolling.
- **Keyboard:** every action works with the keyboard, with visible focus rings in Signal.
- **One look:** every icon from one set (Lucide), at one stroke width.
- **Real images only:** token logos come from Robinhood's assets API (`logoUrl`) on mainnet, and from the explorer's token data on testnet. Use no stock images.
