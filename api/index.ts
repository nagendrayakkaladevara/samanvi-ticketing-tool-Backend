import { createApp } from "../src/app";

/**
 * Vercel's Express runtime expects the default export to be the Express `Application`.
 * An async wrapper breaks that contract and can yield FUNCTION_INVOCATION_FAILED.
 * DB connect runs in app middleware when VERCEL=1 (see src/app.ts).
 */
export default createApp();
