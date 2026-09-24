// Document types staff file against a customer, and their labels.
export const DOC_TYPES: Record<string, string> = {
  pro_forma: "Pro forma invoice",
  invoice: "Invoice",
  delivery_note: "Delivery note",
  qc_certificate: "QC certificate",
  certificate_of_analysis: "Certificate of analysis",
  compliance: "Compliance declaration",
  artwork: "Artwork",
  contract: "Contract",
  internal_record: "Internal record",
  other: "Other",
};

export const docTypeLabel = (t: string) => DOC_TYPES[t] ?? t.replace(/_/g, " ");
