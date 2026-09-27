import "server-only";
import { cache } from "react";
import { mergeSettings, type Settings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The portal's settings, once per request. Read with the service role so the
 * few values customers' pages use (the camera reject limit) are available
 * there too; nothing else from the table reaches a customer.
 */
export const getSettings = cache(async (): Promise<Settings> => {
  try {
    const { data } = await createAdminClient().from("portal_settings").select("key, value");
    return mergeSettings(data ?? []);
  } catch {
    return mergeSettings([]);
  }
});
