/**
 * @atherum/store
 *
 * Storage layer for Atherum — backed by Convex.
 * The Convex schema and functions live in convex/ at the monorepo root.
 * This package exports the ConvexHttpClient helper for use by other packages.
 */

import { ConvexHttpClient } from "convex/browser";

let client: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (!client) {
    const url = process.env.CONVEX_URL;
    if (!url) {
      throw new Error(
        "CONVEX_URL environment variable is required. Run `npx convex dev` in apps/api/ to get your URL."
      );
    }
    client = new ConvexHttpClient(url);
  }
  return client;
}

export { ConvexHttpClient } from "convex/browser";
