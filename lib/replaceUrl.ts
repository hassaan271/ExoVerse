/**
 * Updates the address bar without a navigation. Passing the current history
 * state keeps the router out of it: with any other state, Next treats the call
 * as a route change and silently cancels a link the user has just clicked.
 */
export function replaceUrl(url: string) {
  window.history.replaceState(window.history.state, "", url);
}
