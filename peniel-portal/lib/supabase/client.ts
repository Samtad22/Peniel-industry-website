import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Supabase client in the browser, acting as the signed-in user. Used only
 * for uploading files straight to Storage (Storage policies limit where a
 * customer may write); everything else goes through the server.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
