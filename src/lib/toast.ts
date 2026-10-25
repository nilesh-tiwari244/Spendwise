// App-wide error surfacing without threading a callback through every
// component. notifyError() logs for developers AND dispatches an event that
// App listens for to show a toast - so a failed fetch tells the user that
// something went wrong, instead of silently leaving an empty screen that
// looks like "no data". Works from non-React modules (fetch helpers) too.
export const ERROR_TOAST_EVENT = 'sw:error-toast';

export function notifyError(message: string, err?: unknown) {
  if (err !== undefined) console.error(message, err);
  else console.error(message);
  try {
    window.dispatchEvent(new CustomEvent(ERROR_TOAST_EVENT, { detail: message }));
  } catch {
    // Non-browser context (SSR / tests) - nothing to surface to.
  }
}
