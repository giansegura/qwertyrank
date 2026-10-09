/** Full navigation, not client-side: after signing in or out, the page and header load with the new session. */
export function navigateTo(url: string): void {
  window.location.assign(url);
}
