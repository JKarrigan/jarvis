# Media library pages: redesign spec

Status: built (sidebar collapse, library pages, list view, shared row). "As built" at the end lists where the code differs from this text. Follows the chrome redesign (labelled sidebar, `AppSwitch`)
described in `CLAUDE.md` under "App shell". `reel-spec.md` remains the reference for
tokens, themes and the screens this spec does not touch.

Visuals: the "Library and detail spec" page of the design canvas at
https://claude.ai/artifact/GVKQoXEnqwqoqzsKM4ZDC3 (private to its owner). The boards
that apply are the grid with the Filters popover open, the list view with the sidebar
collapsed, and the list on a phone. The two detail-page boards there are superseded:
detail pages keep their current design (see "Decided").

## Why

The chrome redesign made the sidebar 232px wide from `xl`. That exposed two things on
the movie and TV side of Reel, checked against the real library (208 movies):

- **The library is hard to scan.** It is a poster grid only. With the sidebar open,
  1440px shows five posters per row and about ten titles per screen. There is no way
  to see more at once, and no way to compare titles by year, runtime or rating.
- **The filter bar does not fit.** Seven controls (search, Genre, Tag, Director, Actor,
  Show, Sort) wrap onto two rows, with Sort alone on the second. Filters reset when you
  open a title and come back, because they live in component state.

## Scope

In scope:

1. A sidebar collapse toggle (both apps).
2. Library pages: Movies, TV shows, Favorites, the "Your library" section on Media
   Home, and the filmography on person pages. New header and filter bar, a density
   control, a list view, and filter state that survives navigation.
3. One shared row component, used by the list view and collection detail.

Out of scope: **detail pages** (movie, show, season, episode; see "Decided"), Books, Photos, Documents, the player, the Search modal, the Media Home
hero and rows, Collections list (already fixed), Movie picker, Stats, the Home (air)
app. No API, data-model or Jellyfin changes: every field used below is already on
`ReelTitle` / `ReelDetail`.

## Decided

- **Detail pages stay as they are.** The current hero fills the viewport
  (`min-h-svh`) so the ambient clip plays across the whole screen with the title block
  low over it. An earlier draft of this spec shortened the hero and added a two-column
  body; that would have cropped the clip and covered more of it, so it was dropped.
  No layout, action-row or body changes to `DetailView`, `SeasonView` or
  `EpisodeDetail`.
- **The sidebar stays glass.** It keeps its translucent, blurred background so the
  hero, backdrops and page gradient show through it, open or collapsed. The mockups
  draw it as a solid panel; that is a drawing shortcut, not the design.

## 1. Sidebar collapse

- A toggle at the bottom of each sidebar (above the profile row in Media, above the
  status card in Home) switches between the 232px labelled sidebar and the 74px/72px
  icon rail. It only appears from `xl`, where the labelled sidebar exists. Below `xl`
  the rail is already the only form.
- Keyboard: `[` toggles it, ignored while typing in an input or with a dialog open
  (same guard as the existing `useHotkeys`).
- **State is per device, shared by both apps**, in `localStorage` under
  `home.sidebar.v1` (`"open"` | `"collapsed"`, default open). It is about the screen,
  not the profile, so it does not go in `reel.media.v1`.
- **No layout flash.** The stored value is applied before first paint as
  `data-sidebar="collapsed"` on `<html>` by a small inline script in the root layout.
  Everything else is CSS: a Tailwind custom variant (working name `wide`) meaning
  "`xl` and not collapsed" replaces the `xl:` classes in `AirSidebar`, `MediaRail` and
  `AppSwitch`, and `.reel-root`'s `--rail: 264px` rule gains the same condition. No
  component reads the value during render, so server and client markup match.
  Check `node_modules/next/dist/docs/` for the current guidance on inline scripts in
  the root layout before writing it (`AGENTS.md`).
- The toggle itself is a button with `aria-pressed` and a label ("Collapse sidebar" /
  "Expand sidebar"); it updates the attribute and storage, and other tabs follow
  through the `storage` event.

## 2. Library pages

### 2.1 Header

One row: page title and count on the left ("Movies", "208 titles", or "37 of 208" when
filtered). On the right, in this order: Sort, the density control (grid only), and a
Grid / List segmented control. On phones the title sits on its own row and the three
controls share the next one.

### 2.2 Filter bar

One row that never wraps on desktop:

- **Search field** (unchanged behaviour: titles and credited names).
- **Genre** and **Show** (All / Unwatched / Watched / Favorites) stay as visible
  dropdowns: they are the two used most.
- **Filters** button with a count badge. It opens a popover on desktop and a sheet on
  phones (`media/Sheet.tsx`) holding Type (mixed views only), Tag, Director and Actor,
  each the existing searchable `FilterDropdown`.
- **Active filters** render under the bar as removable chips ("Director: William
  Wyler ×"), with "Clear all" at the end. This replaces the lone "Reset" link. Chips
  animate in and out (`AnimatePresence`), per the project rule on conditional UI.

### 2.3 Sort

- Same five keys as today: Date added, Title, Year, Rating, Runtime.
- **New: direction.** Each key has a natural default (added, year, rating: newest or
  highest first; title: A to Z; runtime: shortest first). Choosing the active key again,
  or clicking the active column header in list view, flips it. `sortTitles` in
  `selectors.ts` takes a `dir` argument; ties break by title so the order is stable.

### 2.4 Grid density

Three sizes, set through `--grid-min` on the grid container:

| Size | `--grid-min` | Posters per row at 1440px (sidebar open / collapsed) |
|---|---|---|
| Compact | 140px | 7 / 8 |
| Comfortable (new default) | 168px | 6 / 6 |
| Large (today's size) | 206px | 5 / 5 |

- Compact drops the meta line under the title and the hover lift, and keeps the title.
- Phones ignore the control's pixel values: Compact is three columns, the other two
  are two columns (today's layout).
- `sizes` on poster images follows the chosen size so Compact fetches the 180px
  rendition (`POSTER_WIDTHS`).

### 2.5 List view

A table on desktop, simplified rows on phones. One row per title, 56px tall.

| Column | Content | Sortable | Hidden below |
|---|---|---|---|
| Title | 32×48 poster, title, progress bar when partly watched | Title | never |
| Year | `year` | Year | never |
| Length | runtime, or "3 seasons" for shows | Runtime | `sm` |
| Rating | star and `imdb` to one decimal | Rating | never |
| Critics | `rt` percent, coloured by `criticColor` | no | `lg` |
| Genres | first two of `effectiveGenres` | no | `lg` |
| Director | first directing credit from `people`; blank for shows without one | no | `xl` |
| Added | "Today", "5d ago", then a date after 30 days | Date added | `md` |
| State | watched check, favorite heart, picker-list mark | no | never |

- The whole row links to the detail page. On hover or focus the State cell shows Play,
  Favorite, Watched and Picker list as real buttons (always visible on touch, using the
  existing `HOVER_REVEAL` rule).
- Column headers are buttons with `aria-sort`. The table is a real `<table>` with
  `<th scope="col">`; rows keep link semantics through a stretched link in the title
  cell rather than `role="button"` on the row.
- The header row is sticky at the top of the page.
- Phones: poster, title, one meta line (year · length · rating), and the state marks.
  No header row; sorting uses the Sort control.
- Long libraries: rows and grid cards get `content-visibility: auto` with an intrinsic
  size, so off-screen items cost no layout or paint. No virtualisation library.

### 2.6 State that survives navigation

- Filters, sort, direction and view are mirrored to the URL query
  (`?genre=Drama&show=unwatched&sort=year&dir=asc&view=list`) with
  `history.replaceState`, always passing a fresh state object (see the `pushState`
  note under "Photos UI" in `CLAUDE.md`). Coming back from a title restores the same
  list, and a filtered view can be bookmarked or shared.
- The server pages already read `genre` and `tag`; they pass the rest through to
  `useFilteredLibrary` as initial values. Unknown values fall back to defaults.
- Scroll position is restored on Back by the browser; the list must render the same
  number of items on first paint for that to land correctly, which it does (no
  pagination).
- **View and density are preferences, not page state.** They are saved per profile in
  `reel.media.v1` (`libraryView`, `gridSize`, both optional so no version bump) and
  used when the URL does not say otherwise.

### 2.7 Where it applies

- `LibraryView` (Movies, TV shows, Favorites): everything above.
- Media Home "Your library": the same filter bar and grid or list; the header's title
  stays "Your library".
- Person page filmography: density and Grid / List only, no filter bar.

## 3. Shared title row

One component, `TitleRow`, with two variants:

- **`compact`**: the list-view row in 2.5.
- **`wide`**: the collection-detail row. 16:9 backdrop thumbnail with the Play overlay,
  title, rating and meta, two lines of synopsis, the watched toggle. Adds what the
  current rows lack: position number in the collection, a progress bar, and the same
  Favorite and Picker list buttons as the list view. The row stops being a
  `div role="button"`: the title is a link stretched over the row and the buttons sit
  above it.

Season episode lists are not touched (detail pages are out of scope).

## Accessibility

- Every icon-only control has a visible tooltip and an accessible name; toggles expose
  `aria-pressed`, the view switch and density control are labelled groups.
- Text on artwork keeps the existing scrims; secondary text on the page background is
  at least `white/60` (the current `white/45` lines fail 4.5:1 on some themes).
- Popover and sheet use the existing dialog primitives (focus trap, Escape handled by
  the top-most layer only).
- Touch targets are at least 44px on phones; table rows are 56px.
- All new motion goes through framer-motion or the existing keyframes, so it follows
  `MotionConfig reducedMotion="user"` and the reduced-motion block in `globals.css`.

## Build order

Each step ships on its own and leaves the app working.

1. **Sidebar collapse**: custom variant, inline script, toggle in both sidebars.
2. **Library header and filter bar**: header row, Filters popover, chips, sort
   direction, URL state, density. Grid only.
3. **List view and `TitleRow`**: list view on library pages; collection detail and
   person filmography adopt the shared pieces.

## Testing

- Unit tests (`tests/**/*.test.ts`): `sortTitles` with direction and tie-breaks; the
  URL parse and serialise helpers (round trip, unknown values, defaults omitted); the
  "added" label; first-director selection from `people`.
- By hand, against the real library, at 375, 900, 1280 and 1440px, sidebar open and
  collapsed: Movies, TV, Favorites, a filtered view reopened from a copied URL, Back
  from a title, a collection, a person. Also open a movie and a show at each width
  with the sidebar open and collapsed, to confirm the ambient clip and hero are
  unchanged.
- `npm run lint`, `typecheck`, `test`, `build`.

## Open decisions

Each has a default; building can start on the defaults.

1. **Default density.** Comfortable (six per row) instead of today's Large (five).
   Default: Comfortable.
2. **Default view.** Grid, with List remembered once chosen. Default: Grid.
3. **Collapse state shared by Home and Media.** Default: shared, per device.
4. **Filters in the URL.** Default: yes. The cost is longer URLs on library pages.
5. **List view on phones.** Default: yes, as simplified rows.

## As built

- **List view markup.** ARIA table roles on a CSS grid instead of a `<table>`, so each
  row can carry one stretched link (`position: relative` on a `<tr>` is unreliable).
  Screen readers get the same table, row, column-header and cell semantics.
- **Columns follow the list's width, not the viewport** (container queries): Year,
  Length, Rating and Added from 672px, Critics and Genres from 1024px, Director from
  1152px. In practice Director shows at 1440px with the sidebar collapsed and hides
  with it open. Below 672px the columns fold into one line under the title.
- **Row actions.** Favorite, Watched and Picker list are real toggles that stay visible
  when set; the unset ones and Play appear on hover or focus (always on touch).
- **No `content-visibility`.** It clips the poster shadows and hover lift, and 200 rows
  render fine without it. Revisit if the library grows into the thousands.
- **Added dates** use the viewer's time zone and are rendered on the client only.
- **Phones.** The Sort, Genre and Show triggers drop their "Sort:" style prefix to fit,
  and the Large poster size is not offered (it equals Comfortable there).
- **Open decisions** were all built on their defaults.
