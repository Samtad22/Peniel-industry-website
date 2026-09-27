// Signing the Certificate of Analysis (supabase/migrations/20261010000001_coa_signatures.sql,
// 20261011000001_coa_one_signature.sql). One signature, "Prepared by", by the quality
// manager. The database enforces every rule; these mirror them to show the right buttons.

export const SIGNATURE_LINES = { prepared: "Prepared by" } as const;
export type SignatureLine = keyof typeof SIGNATURE_LINES;

export type Signature = { name: string; image: string; signed_at: string; signer_id?: string };
export type Signatures = Partial<Record<SignatureLine, Signature>>;

/** Longest signature image the database accepts (a PNG data URL). */
export const MAX_SIGNATURE_CHARS = 200_000;

/** A PNG data URL small enough to store. */
export function isSignatureImage(s: string): boolean {
  return s.length <= MAX_SIGNATURE_CHARS && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(s);
}

/** Who signs: the quality manager (role quality). Admin can remove a signature, not sign. */
export function signing(sigs: Signatures, who: { userId: string; role: string }): { canSign: boolean; canRemove: boolean } {
  const sig = sigs.prepared;
  return {
    canSign: who.role === "quality" && !sig,
    canRemove: !!sig && ((who.role === "quality" && sig.signer_id === who.userId) || who.role === "admin"),
  };
}
