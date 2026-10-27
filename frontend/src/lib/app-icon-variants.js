// The home-screen icons a phone can switch to (Settings → Look & Home → App icon). Plain data, no
// imports: scripts/app-icons.mjs draws every icon file from this list and the settings row lists
// the same ids, so the picker can never offer an icon the native projects do not have.
//
// `name` is the English key the row passes to t(). `ios` is the AppIcon set in the asset catalog
// (null: the primary icon) and `android` the activity-alias 1.4.4 adds to AndroidManifest.xml (1.4.3
// has the picker on the iPhone only, so nothing reads it here yet). `art` is a hand-made SVG the
// script renders instead of the glyph; `bg`/`fg` are then just its main colours.
export const APP_ICON_VARIANTS = [
  // TallaYa: the T-bar over a setting sun (brand/). Every icon is hand-made art, written by
  // brand/scripts/build_app_icon_art.py in the subset scripts/app-icons.mjs can draw.
  { id: 'default', name: 'Original', bg: '#0d1b2e', fg: '#ff6b3d', art: 'resources/icons/tallaya.svg', ios: null, android: 'IconDefault' },
  { id: 'malecon', name: 'Malecón', bg: '#11707f', fg: '#fff6ea', art: 'resources/icons/malecon.svg', ios: 'AppIcon-Malecon', android: 'IconMalecon' },
  { id: 'palma', name: 'Palm', bg: '#167a4e', fg: '#fff6ea', art: 'resources/icons/palma.svg', ios: 'AppIcon-Palma', android: 'IconPalma' },
  { id: 'sol', name: 'Sun', bg: '#ffc531', fg: '#08111f', art: 'resources/icons/sol.svg', ios: 'AppIcon-Sol', android: 'IconSol' },
  { id: 'cal', name: 'Light', bg: '#fff6ea', fg: '#08111f', art: 'resources/icons/cal.svg', ios: 'AppIcon-Cal', android: 'IconCal' },
  { id: 'mono', name: 'Mono', bg: '#0d1b2e', fg: '#fff6ea', art: 'resources/icons/mono.svg', ios: 'AppIcon-Mono', android: 'IconMono' },
]

export const APP_ICON_IDS = APP_ICON_VARIANTS.map(v => v.id)
