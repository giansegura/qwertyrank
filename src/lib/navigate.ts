/** Navegación completa, no de cliente: tras entrar o salir, la página y la cabecera se cargan con la sesión nueva. */
export function navigateTo(url: string): void {
  window.location.assign(url);
}
