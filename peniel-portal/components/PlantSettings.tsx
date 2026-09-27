"use client";

import { createContext, useContext } from "react";
import { DEFAULT_SETTINGS, type PlantSettings } from "@/lib/settings";

// The plant settings (reject limit, oven minutes, stillage sheets) for the
// browser's forms and timers, provided once by the ops and customer layouts.

const Ctx = createContext<PlantSettings>(DEFAULT_SETTINGS.plant);

export function PlantSettingsProvider({ value, children }: { value: PlantSettings; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePlant = () => useContext(Ctx);
