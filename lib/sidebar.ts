/** Sidebar collapse state: per device, shared by both apps (it is about the screen, not the profile). */
export const SIDEBAR_KEY = 'home.sidebar.v1'

/**
 * Runs in <head> before first paint (root layout), so a collapsed sidebar never flashes
 * open. Everything else is CSS keyed off `html[data-sidebar="collapsed"]` (the `wide:`
 * variant and the `--rail` rule in globals.css), so no component reads this during render.
 */
export const SIDEBAR_INIT_SCRIPT =
  `try{if(localStorage.getItem(${JSON.stringify(SIDEBAR_KEY)})==='collapsed')document.documentElement.dataset.sidebar='collapsed'}catch(e){}`
