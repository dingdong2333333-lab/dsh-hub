/** Return a detached copy safe to send to the renderer. */
export function toPublicSettings(settings) {
  return structuredClone(settings);
}
