// Filled in at build time by `define` in vite.config.ts.
declare global {
  const __APP_BUILD__: {
    // Short commit code of this build, e.g. "0ecd898".
    sha: string;
    // When it was built, as an ISO date-time.
    builtAt: string;
  };
}

export {};
