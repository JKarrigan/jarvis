# Handoff: Reel — Home Media Library App

> Source of truth for the media frontend's visual + interaction spec. This was provided
> as an external design handoff; it is reproduced here so the token tables, gradient
> formulas, typography scale, and animation keyframes live in-repo. The original design
> references (`Reel.dc.html`, `Mobile Preview.dc.html`) are authored in a bespoke HTML
> component runtime and are NOT in this repo — treat this document as the spec.

## Overview
**Reel** is a sleek, cinematic home-media library app (a personal Jellyfin-style front end) for browsing, organizing, and choosing what to watch. It supports **movies** and **TV shows** today and is structured to expand to other media types later. It runs as a single-page app with a persistent left icon rail (desktop) / bottom tab bar (mobile), a full-bleed browse home, rich detail pages, franchise + custom collections, a season/episode browser, a gamified "Movie Picker," a watchlist, and a stats view. The whole UI re-themes between five color directions.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, motion, and copy are all final and exact. The only placeholders are **artwork**: posters/backdrops/avatars are rendered as CSS gradients derived from a per-title hue (see "Artwork placeholders"). When wired to a real Jellyfin server these become real image URLs (`/Items/{id}/Images/Primary` and `/Backdrop`) — build the components to accept an image `src` with the gradient as the loading/fallback state.

---

## Design Tokens

### Fonts
- **Display / headings:** `'Schibsted Grotesk'`, weights 500/600/700/800. Used for the logo, all `<h1>/<h2>/<h3>`, big numbers, titles on cards.
- **UI / body:** `'Manrope'`, weights 400/500/600/700/800. Everything else.
- Monospace (file-detail values only): `ui-monospace, Menlo, monospace`.

### Themes (5 directions — user-switchable in Settings; default = Ember)
Each theme defines: `accent`, `accentSoft`, `surface`, `surface2`, `border`, `glow`, and a page `bg` gradient. Implement as a set of CSS variables on the app root that swap when the theme changes.

| Theme | accent | accentSoft | surface | surface2 | border | glow |
|---|---|---|---|---|---|---|
| **Ember** (default) | `#e0a872` | `#f2cea0` | `rgba(255,255,255,0.04)` | `rgba(255,255,255,0.06)` | `rgba(255,235,210,0.09)` | `rgba(224,168,114,0.40)` |
| **Aurora** | `#c08af0` | `#d9b6f7` | `rgba(255,255,255,0.04)` | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.08)` | `rgba(192,138,240,0.38)` |
| **Sage** | `#86cfa6` | `#b3e3cb` | `rgba(255,255,255,0.04)` | `rgba(255,255,255,0.06)` | `rgba(210,245,225,0.09)` | `rgba(134,207,166,0.34)` |
| **Midnight** | `#8ea6ff` | `#b9c6ff` | `rgba(255,255,255,0.045)` | `rgba(255,255,255,0.07)` | `rgba(150,170,255,0.12)` | `rgba(120,140,255,0.40)` |
| **Noir** | `#b9b4d6` | `#d6d2ea` | `rgba(255,255,255,0.05)` | `rgba(255,255,255,0.08)` | `rgba(255,255,255,0.11)` | `rgba(185,180,214,0.22)` |

**Page background gradients** (the `bg` value, applied to the app root):
- Ember: `radial-gradient(120% 80% at 72% -12%, rgba(224,168,114,0.20), transparent 55%), radial-gradient(85% 70% at 8% 6%, rgba(196,116,78,0.12), transparent 50%), linear-gradient(180deg,#13100b,#100c07 60%,#0b0805)`
- Aurora: `radial-gradient(120% 80% at 72% -12%, rgba(168,108,224,0.24), transparent 55%), radial-gradient(90% 70% at 8% 6%, rgba(96,110,212,0.14), transparent 50%), linear-gradient(180deg,#0e0b16,#0a0810 60%,#08060d)`
- Sage: `radial-gradient(120% 80% at 72% -12%, rgba(110,200,150,0.16), transparent 55%), radial-gradient(85% 70% at 8% 6%, rgba(80,150,140,0.11), transparent 50%), linear-gradient(180deg,#0b1410,#08110c 60%,#060e09)`
- Midnight: `radial-gradient(120% 85% at 70% -14%, rgba(90,110,230,0.30), transparent 55%), radial-gradient(80% 70% at 12% 4%, rgba(150,90,230,0.14), transparent 50%), linear-gradient(180deg,#090c1c,#070914 62%,#05060f)`
- Noir: `radial-gradient(110% 70% at 70% -10%, rgba(120,116,150,0.16), transparent 55%), linear-gradient(180deg,#101015,#0c0c10 60%,#090909)`

### Core neutral colors (theme-independent)
- **Primary text:** `#f3eff8`
- **Body base bg (under gradient):** `#08060d`
- **Ink-on-accent** (text/icons on accent-filled buttons): `#15101f`
- **Text opacities** used consistently: `rgba(255,255,255,0.78)` (strong body), `0.6`–`0.66` (secondary), `0.5` (tertiary), `0.42–0.45` (muted/labels), `0.3` (dividers/dots).
- **Star / community rating gold:** `#f0c25a`
- **Positive (watched, good critic score):** `#7fd8a8`
- **Favorite heart (active):** `#ff7aa0`
- **Pass / thumbs-down (picker):** `#ff7a7a`
- **Critic score color logic:** `≥75 → #7fd8a8`, `60–74 → #f0c25a`, `<60 → #e88`

### Spacing & layout tokens
Responsive CSS variables that flip at the mobile breakpoint:

| Token | Desktop (>760px) | Mobile (≤760px) | Meaning |
|---|---|---|---|
| `--rail` | `96px` | `16px` | Left page gutter (clears the icon rail) |
| `--gx` | `56px` | `16px` | Right page gutter |
| `--navpad` | `0` | `86px` | Bottom padding so content clears the mobile tab bar |
| `--gridMin` | `206px` | `150px` | `minmax()` min for library/grid `auto-fill` |
| `--detail-dir` | `row` | `column` | Detail header poster+info direction |
| `--poster-w` | `268px` | `150px` | Detail page poster width |
| `--info-top` | `120px` | `0` | Top padding on detail info column |
| `--detail-pull` | `-230px` | `-90px` | Negative margin pulling poster/info up over backdrop |
| `--coll-dir` | `row` | `column` | Collection row direction (title vs. films) |
| `--coll-poster-w` | `218px` | `150px` | Poster width inside collection rows |

**Breakpoint:** single breakpoint at **`max-width: 760px`** = mobile.

**Standard poster card width** in horizontal rows (Recently Added, Watchlist, Recommendations, More-from-library): **`178px`**, aspect ratio **2/3**. Continue-watching cards: `300px`, aspect 16/9. Collection title-slot width on desktop: `208px`.

### Radii
- Cards / posters: `12–13px`
- Large cards / hero / modals / detail poster: `16–22px` (hero `22px`—full-bleed now, modal `18px`, detail poster `18px`)
- Pills / nav items: `10–13px`; fully-round controls `30px`/`50%`
- Buttons: `12–13px`
- Small badges: `6–8px`

### Shadows
- Card hover lift: `0 16px 34px rgba(0,0,0,0.5)` — larger cards `0 18px 40px rgba(0,0,0,0.55)`
- Accent CTA glow: `0 10px 30px var(--glow)` (and `0 12px 34px var(--glow)` on big CTAs)
- Detail poster: `0 30px 70px rgba(0,0,0,0.6)`
- Modal / dropdown: `0 18px 44px rgba(0,0,0,0.55)` to `0 30px 90px rgba(0,0,0,0.6)`
- Rail logo / accent badge: `0 6px 22px var(--glow)`

### Typography scale (key sizes)
- Hero title (home featured): `clamp(30px, 7vw, 54px)`, weight 800, line-height ~0.98, letter-spacing -0.025em
- Detail `<h1>`: `clamp(30px, 7.5vw, 52px)`, weight 800, letter-spacing -0.028em
- Collection banner `<h1>`: `clamp(34px, 8vw, 58px)`
- Picker swipe title: `clamp(36px, 9vw, 62px)`; winner title `clamp(40px, 10vw, 72px)`
- Section headings (`<h2>` "Recently added" etc.): `20px`, weight 700, letter-spacing -0.01em
- Card titles: `13.5–14px`, weight 600
- Body / synopsis: `15–17px`, line-height 1.6–1.7, `text-wrap: pretty`
- Eyebrow labels (uppercase): `10–12px`, weight 700, letter-spacing `0.1–0.16em`, `text-transform: uppercase`, colored `accentSoft` or `rgba(255,255,255,0.42)`
- Card meta / sub: `11.5–13px`, `rgba(255,255,255,0.42)`
- **Minimum body text ~12px; keep large cinematic type per the design.**

### Surface / glass recipe
- **Card surface:** background `var(--surface)`, `1px solid var(--border)`, rounded.
- **Glass overlays** (icon rail, floating buttons, bottom tab bar, badges over art): `background: rgba(8,6,13,0.3–0.66)` + `backdrop-filter: blur(16–22px) saturate(1.25)` (include `-webkit-` prefix).
- **Hover convention:** surfaces lighten to `rgba(255,255,255,0.06–0.13)`; cards translateY(-3 to -5px) + shadow.

---

## Artwork placeholders
Every title has a numeric `hue` (0–360). All imagery is generated from it.

```js
// portrait Primary / poster
poster(hue)  = `linear-gradient(160deg, hsl(${hue} 46% 31%) 0%, hsl(${hue+18} 54% 17%) 55%, hsl(${hue+8} 60% 8%) 100%)`
// wide Backdrop (deliberately different framing from poster)
backdrop(hue) = `radial-gradient(120% 150% at 80% 14%, hsl(${hue+46} 52% 33%) 0%, transparent 58%), linear-gradient(100deg, hsl(${hue} 36% 19%) 0%, hsl(${hue+22} 28% 9%) 68%, #0a0810 100%)`
// fallback backdrop when a title has no Backdrop image (defocused Primary)
backdropFallback(hue) = `radial-gradient(85% 95% at 50% 30%, hsl(${hue} 38% 26%) 0%, hsl(${hue+10} 44% 9%) 80%)`
// cast/crew avatar
avatar(hue)  = `linear-gradient(135deg, hsl(${hue} 40% 42%), hsl(${hue+30} 45% 26%))`
// collection art
collArt(hue) = `radial-gradient(120% 130% at 80% 10%, hsl(${hue+30} 58% 42%) 0%, transparent 56%), linear-gradient(135deg, hsl(${hue} 52% 30%) 0%, hsl(${hue+18} 46% 12%) 72%, #0a0810 100%)`
collColor(hue) = `hsl(${hue} 64% 66%)`  // collection accent text
```
On glass posters there's also a top-left sheen overlay: `radial-gradient(80% 50% at 28% 12%, rgba(255,255,255,0.16), transparent 58%)`.

**Jellyfin mapping note:** `Primary` and `Backdrop` are distinct image types. `BackdropImageTags` is frequently empty — when so, use the fallback backdrop and optionally show a small "No Backdrop image · falling back to Primary" tag. Community rating ⭐ = Jellyfin `CommunityRating`; Critics % = `CriticRating`.

---

## Navigation & Shell

### Desktop — left icon rail (fixed, glass, 74px wide)
Vertical, borderless, floats over content. Top: accent logo tile (play glyph). Then **Search** (opens modal), a thin divider, then nav icons: **Home, Movies, TV Shows, Favorites, Collections, Movie Picker**, and a **Picker List** icon (only when the list has items — shows a count badge). Bottom: **Settings** + profile avatar. Active item = `surface` bg + accent-colored icon; inactive icon `rgba(255,255,255,0.62)`; hover lightens.

### Mobile — bottom tab bar (fixed, glass, full width)
Tabs: **Home · Search · Collections · Picker** + (**List** with count badge if non-empty, else **Settings**). Icon + 10px label, active = accent color. Add `--navpad` bottom padding to scroll area.

### Floating controls
- **Back** pill (glass, top-left at `--back-left`) appears on detail / collection / season / stats views.
- **Search** opens a **centered modal**: dim+blur backdrop (`rgba(4,3,8,0.66)` + blur 8px), 640px panel, search input with icon, live results (poster thumb + title + "year · genres"); searches movies, shows, AND collections; click a result → its detail. Esc / × / backdrop closes. Search text is independent of the library grid filters.

---

## Screens / Views

### 1. Home / Browse
Vertical scroll, full-bleed. Order:
1. **Featured hero** — full-bleed backdrop ~`52vh`, left-weighted gradient scrim + bottom fade to `#0a0810`. Eyebrow ("Featured · Film/TV Series"), big title, ⭐rating + meta line, synopsis (max ~620px), **Play** (accent) + **More info** (glass) buttons.
2. **Continue watching** row (only if any in-progress) — 16/9 cards, center play glyph, "Xm left"/"S2 · 40% left" badge, bottom progress bar (accent fill on `rgba(255,255,255,0.18)`).
3. **Recently added** row — 178px posters, "New" accent badge, "Added today/Nd ago".
4. **Your watchlist** row (if non-empty) — 178px posters.
5. **Recommendations** row ("More {topGenre} for you") — 178px posters.
6. **Your library** grid — section header with **Sort / Genre / Show** dropdown filters + count; `auto-fill minmax(var(--gridMin),1fr)` grid; poster cards with ⭐ badge, watched check (accent circle), Film/Series badge, and a favorite-heart button overlay.

Rows 1–5 only render on the unfiltered "Home" state; choosing any filter/sort collapses the page to just the library grid (header title changes to "Movies"/"TV Shows"/"Favorites").

**Library filter dropdowns** (Sort / Genre / Show): glass button "Label: Value ⌄"; opens a popover, options with a check on the active one. Sort: Date added / Title (A–Z) / Year / Rating / Runtime. Show: All / Unwatched / Watched / Favorites. Clicking outside closes.

### 2. Movie / Show Detail
- **Backdrop** header (~`50vh`) with ken-burns-in animation, scrims fading to page bg.
- **Poster + info row** pulled up over the backdrop (`margin-top: var(--detail-pull)`), stacks to column on mobile. Poster animates up (`posterRise`).
- Info column: type eyebrow + Watched chip, big title, year · runtime/seasons · cert, genre chips, then **action row**: **Play/Resume** (accent), **Trailer** (glass), **Favorite** (heart toggle), **Watched** toggle, **Add to picker list** (label toggles to "In picker list" w/ check), **Watchlist** bookmark toggle, **Add to collection** (opens popover listing custom collections w/ checks).
- **Resume bar** (movies in-progress, and TV — next unwatched episode): wide glass card, 150×90 thumb w/ play, "Resume · S1·E3", episode title, "Up next · 44m".
- **Seasons** (TV only): list of season cards (74px art thumb, title, progress bar + "3 / 8 watched", chevron) → opens Season view.
- **Overview** (full-width): synopsis paragraph, then **Cast & crew** = horizontal scroll of rectangular cards (152px, 3/4 portrait, initials over avatar gradient, name + role; Director card gets an accent role badge).
- **Details row** (full-width, 3 cards): **Ratings** (Community ⭐ + Critics %), **File details** (Resolution, Video codec, Audio, Container, Size, Location — mono values), **Your rating** (5 interactive stars + private notes textarea).
- **More from your library** row at the bottom.

### 3. Season view
Backdrop header (~34vh) with show eyebrow + season title + **season switcher** pills. Episode list: each row = 160px wide 16/9 thumb (play glyph, "Up next" badge on next unwatched) + episode label `E3`, title, runtime, synopsis, and a round **watched toggle** (accent when watched). Toggling episodes updates show/season progress.

### 4. Collections (list)
Two sections, each row = **title slot on the left** ("Collection" eyebrow in the collection's accent color, big name, "N films ›") + a **full-width horizontal scroll row** of its film posters (218px desktop / 150px mobile). On mobile the row **stacks** (title above films).
- **Franchise collections** (built-in): Star Wars, The Lord of the Rings, Marvel, Aliens, Back to the Future, Studio Ghibli, Pixar, Disney, The Incredibles, Jurassic Park.
- **Your collections** (user-made): a "New collection" inline creator (name input → Create), then user rows. Empty state explains how to add via detail pages.

### 5. Collection detail
Themed full-bleed banner (~50vh, tinted to the collection hue) with "Collection" eyebrow, name, tagline, "N films · Xh total". Then **In this collection**:
- **Large collections (>4 titles):** poster grid (`minmax(var(--gridMin),1fr)`).
- **Small collections (≤4 titles):** full-width **list rows** — landscape image left (with watch-order number "01" overlay + Watched chip) and title/⭐/meta/synopsis right.

### 6. Movie Picker
A full-screen, **centered block with left-justified text** (max-width ~880px).
- **Setup:** "Movie picker" eyebrow, "Can't decide? Let's narrow it down." headline, intro copy, then filter groups (**Show me** type, **Genre**, **In the mood for** = Anything / Crowd-pleasers / Hidden gems / Quick watch / Go epic, **Order the deck** = Shuffle / Top rated / Newest / Shortest), a **Hide watched** toggle pill, and **Start picking** (accent CTA) + "N titles in the deck" count. Selected option = accent fill / ink text; unselected = `rgba(255,255,255,0.06)` chip.
- **Swipe:** each title fills the screen as a backdrop; centered block, left-aligned, type eyebrow, big title, ⭐+meta, synopsis, and **thumbs-down (pass)** + **thumbs-up (keep)** round buttons. Top-center shows `3 / 12` progress + `♥ N kept`. Supports **drag/swipe gestures** (left=pass, right=keep) AND the buttons AND arrow keys. Voting plays a directional card transition (`pickKeep`/`pickPass`), next card eases in (`pickIn`).
- **Results / shortlist:** kept titles in a grid with **Another round** (re-vote to narrow) + **New picker**.
- **Winner (1 left):** full-screen confetti shower + "★ Tonight's pick", big title, meta, synopsis, **Play now / View details / Pick again**.

### 7. Picker List (cart)
Built from **Add to picker list** buttons on detail pages. Rail/tab icon shows a **count badge** once non-empty. The page ("Your picker list") shows queued titles in a grid (each with a remove ×), **Start the roundup** (runs the picker on exactly this set), and **Clear list**. Empty state explains how to add.

### 8. Settings
Profile card (avatar, "Profile A", "Switch profile"). **Your year in film** entry card → Stats. **Appearance**: theme picker — 5 cards each previewing the theme's bg gradient + accent dot, active one ringed in its accent. Theme is framed as **per-profile** (each household member can pick their own).

### 9. Stats ("Your year in film")
Eyebrow + "The numbers so far". Stat cards: **hours watched** (+ days), **films finished**, **series watched**, **your average rating** (⭐). **Top genres** = horizontal bars (accent gradient fill, count at right). Footer chips: favorites count, watchlist count. All derived from watch/favorite/rating state.

---

## Interactions & Behavior
- **Navigation** remembers a `backTo` so **Back** returns where a detail/collection/season was opened from.
- **Hover:** cards lift (`translateY(-3…-5px)`) + shadow; surfaces lighten; CTAs `filter: brightness(1.06)`.
- **Keyboard:** picker swipe responds to ←/→/↑/↓; Esc closes the search modal.
- **Touch:** picker swipe supports drag — threshold ~60px horizontal and horizontal > vertical to count as a vote.
- **Loading:** on first mount show **skeleton shimmers** (~780ms) on the home view. Shimmer = moving `linear-gradient(100deg, rgba(255,255,255,0.04) 30%, 0.10 50%, 0.04 70%)`, `background-size: 920px 100%`, `animation: shimmer 1.25s linear infinite`.
- **Empty states** for watchlist-driven rows, custom collections, and picker list.

### Animations (keyframes — copy exactly)
```css
@keyframes reelFade   {from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)}}        /* view enter, ~.4s ease */
@keyframes pickerEnter{from{opacity:0;transform:translateY(22px) scale(.99)} to{opacity:1;transform:none}}      /* .55s cubic-bezier(.2,.7,.2,1) */
@keyframes pickIn     {from{opacity:0;transform:translateY(28px) scale(.985)} to{opacity:1;transform:none}}      /* next picker card .44s */
@keyframes pickKeep   {from{opacity:1;transform:none} to{opacity:0;transform:translateX(120px) rotate(3deg)}}    /* .27s */
@keyframes pickPass   {from{opacity:1;transform:none} to{opacity:0;transform:translateX(-120px) rotate(-3deg)}}  /* .27s */
@keyframes confettiFall{0%{transform:translateY(-14vh) rotate(0);opacity:0}8%{opacity:1}90%{opacity:1}100%{transform:translateY(112vh) rotate(720deg);opacity:.9}}
@keyframes winnerPop  {0%{opacity:0;transform:translateY(30px) scale(.96)}60%{opacity:1}100%{opacity:1;transform:none}}  /* .6s */
@keyframes shimmer    {0%{background-position:-460px 0}100%{background-position:460px 0}}
@keyframes kenburns   {0%{transform:scale(1.12);opacity:0}100%{transform:scale(1);opacity:1}}  /* detail backdrop, 1.1s ease */
@keyframes posterRise {0%{opacity:0;transform:translateY(26px) scale(.97)}100%{opacity:1;transform:none}}        /* detail poster .5s */
```
Confetti = ~46 absolutely-positioned 6–12×9–18px rects, random left/color/delay/duration, falling via `confettiFall`. Palette: `#e0a872,#f0c25a,#7fd8a8,#8ea6ff,#f06a8a,#f3eff8`.

---

## State Management
All client state (a single store / context):
- `view` (`browse | detail | season | collection | collections | customcoll | picker | picklist | stats | settings`) and `backTo`.
- `selectedId`, `selectedSeason`, `selectedCollectionId`, `selectedCustomColl`.
- `direction` (active theme key; default `ember`) — **per-profile**.
- Library filters: `filter` (all/movie/tv), `sort`, `genre`, `status`, `openMenu`.
- `query` + `searchOpen` (search is independent of library filters).
- Per-title user data: `fav{}`, `watched{}`, `rating{}`, `notes{}` (seed from item defaults).
- TV: `epWatched{ "showId:globalEpIndex": bool }`; episode watched falls back to `floor(progress * totalEpisodes)` when not explicitly toggled. Helpers: build deterministic season/episode structure from `seasons`/`episodes` counts; `nextEpisode` = first unwatched.
- `watchlist[]`, `customCollections[{id,name,items[]}]`, `pickList[]`.
- Picker: `pickerStage` (setup/swipe/results), `pType/pGenre/pMood/pSort/pHideWatched`, `pPool[]`, `pIdx`, `pKept[]`, `pRound`, `pExit` (keep/pass for exit anim).
- `isMobile` (from `window.innerWidth <= 760`), `booting` (true ~780ms on load).

### Recommendation algorithm
Build a genre-weight map from items the user has watched OR favorited (each title's genres +1 each). For each **unwatched, not-in-progress** library title, score = `genreAffinity*2 + imdbRating` where `genreAffinity` = sum of weights of that title's genres. Sort desc, take top 8. Row title = "More {highest-weight genre} for you".

### Picker pool
Filter library by type + genre + mood + hideWatched, then order by the chosen sort (Shuffle = Fisher–Yates; Top rated = imdb desc; Newest = year desc; Shortest = effective runtime asc, where a show's runtime ≈ `episodes*45`). "Start the roundup" from the picker list uses exactly the cart's ids.

### Data model (per title)
`{ id, title, year, type:'movie'|'tv', genres[], runtime (min, movies), seasons, episodes (tv), imdb (CommunityRating), rt (CriticRating), personal (0–5), cert, hue (0–360 for art), added (days ago), progress (0–1), watched, favorite, director ("Created by …" for tv), cast:[[name,role],…], file:{res,codec,size,audio,container,path}, synopsis }`. Collections: `{ id, name, tagline, hue, items:[titleId,…] }`.

---

## Repo mapping note
This app keeps Next.js file-based routes under `/media/*` with SSR Jellyfin fetching (`lib/jellyfinServer.ts`, server-only token) rather than the single client-SPA the original prototype used. All user state lives in a client `MediaProvider` context mounted in `app/media/layout.tsx`; `backTo` is handled by router navigation. Real Jellyfin `posterUrl`/`backdropUrl` are the image `src`; the hue gradients are loading/fallback states.
