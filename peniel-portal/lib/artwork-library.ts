// The artwork library (supabase/migrations/20261012000001_artwork_library.sql):
// each brand's design files, and its 702-up print layouts for the CTP machine
// (admin only).

export type LibraryKind = "design" | "print_layout";

/** Storage folder after the company id: `artwork-library/{company_id}/{folder}/…`. */
export const LIBRARY_FOLDER: Record<LibraryKind, string> = { design: "design", print_layout: "print-layout" };

export const LIBRARY_LABELS: Record<LibraryKind, { title: string; sub: string }> = {
  design: { title: "Customer artwork", sub: "The customer's design: usually one crown with its dimensions and Pantone colours." },
  print_layout: { title: "Print layouts", sub: "The full sheet layout for the CTP machine (702 crowns a sheet). Only you (admin) can see these." },
};

/** Crowns on one printed sheet. */
export const SHEET_UPS = 702;

export type LibraryFile = {
  id: string;
  brand_id: string;
  kind: LibraryKind;
  title: string | null;
  file_name: string;
  size_bytes: number | null;
  ups: number | null;
  notes: string | null;
  created_at: string;
};
