/**
 * Atherum — Dynamic Cron Registration
 *
 * Uses @convex-dev/crons to register a daily agent roster refresh.
 * Call registerCrons from an init script or deployment hook.
 */

import { Crons } from "@convex-dev/crons";
import { components, internal } from "./_generated/api";
import { internalMutation, internalAction } from "./_generated/server";
import { v } from "convex/values";

export const crons = new Crons(components.crons);

// ---------------------------------------------------------------------------
// Placeholder action for daily agent roster refresh
// ---------------------------------------------------------------------------

export const refreshAgentRoster = internalAction({
  args: {},
  handler: async (_ctx) => {
    console.log(
      "[crons] Agent roster refresh triggered at",
      new Date().toISOString(),
    );
    // Future: regenerate agent personas, update the personas table,
    // rotate reasoning styles, etc.
  },
});

// ---------------------------------------------------------------------------
// Idempotent cron registration — call on deploy or via init script
// ---------------------------------------------------------------------------

export const registerCrons = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await crons.get(ctx, { name: "daily-roster-refresh" });
    if (existing === null) {
      await crons.register(
        ctx,
        { kind: "cron", cronspec: "0 0 * * *" }, // midnight UTC daily
        internal.cronSetup.refreshAgentRoster,
        {},
        "daily-roster-refresh",
      );
      console.log("[crons] Registered daily-roster-refresh cron");
    } else {
      console.log("[crons] daily-roster-refresh cron already exists");
    }
  },
});
