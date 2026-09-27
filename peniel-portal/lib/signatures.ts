// Signing the Certificate of Analysis (supabase/migrations/20261010000001_coa_signatures.sql).
// The database enforces every rule; these mirror them to show the right buttons.

export const SIGNATURE_LINES = { prepared: "Prepared by", approved: "Approved by" } as const;
export type SignatureLine = keyof typeof SIGNATURE_LINES;

export type Signature = { name: string; image: string; signed_at: string; signer_id?: string };
export type Signatures = Partial<Record<SignatureLine, Signature>>;

/** Longest signature image the database accepts (a PNG data URL). */
export const MAX_SIGNATURE_CHARS = 200_000;

/** A PNG data URL small enough to store. */
export function isSignatureImage(s: string): boolean {
  return s.length <= MAX_SIGNATURE_CHARS && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(s);
}

type Who = { userId: string; role: string };
const SIGNS = (role: string) => role === "admin" || role === "quality";

/**
 * What this person can do on each line: sign it, or why not (null = nothing to show).
 * "Prepared by" first; "Approved by" by someone else, for a released batch.
 */
export function signing(sigs: Signatures, released: boolean, who: Who): Record<SignatureLine, { canSign: boolean; blocked: string | null; canRemove: boolean }> {
  const may = SIGNS(who.role);
  const mine = (s?: Signature) => !!s && may && (s.signer_id === who.userId || who.role === "admin");
  const prepared = sigs.prepared;
  const approved = sigs.approved;
  let approveBlocked: string | null = null;
  if (!approved && may) {
    if (!prepared) approveBlocked = "Signed after “Prepared by”.";
    else if (!released) approveBlocked = "Only a released batch is approved.";
    else if (prepared.signer_id === who.userId) approveBlocked = "A different person signs “Approved by”.";
  }
  return {
    prepared: { canSign: may && !prepared, blocked: null, canRemove: mine(prepared) && !approved },
    approved: { canSign: may && !approved && !approveBlocked, blocked: approveBlocked, canRemove: mine(approved) },
  };
}
