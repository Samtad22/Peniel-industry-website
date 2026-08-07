"use client";

import { useState, type FormEvent } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { PRODUCTS, COMPANY } from "@/lib/constants";

type Status = "idle" | "submitting" | "success" | "error";

export default function QuoteForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong sending your request. Please email us directly instead.");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-[#E7E9EC] bg-white p-8 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF1E5]">
          <CheckCircle2 size={28} className="text-orange" />
        </span>
        <h3 className="mb-2 text-xl font-bold text-graphite">Request received</h3>
        <p className="mx-auto max-w-sm text-[15px] leading-relaxed text-muted">
          Thank you — our team will get back to you shortly. If your request is urgent, you can
          also reach us directly by phone or email.
        </p>
        <button
          onClick={() => setStatus("idle")}
          className="mt-6 text-sm font-semibold text-orange underline underline-offset-4"
        >
          Send another request
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-[#E7E9EC] bg-white p-6 md:p-8">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Full name" name="name" required autoComplete="name" />
        <Field label="Company" name="company" autoComplete="organization" />
        <Field label="Email" name="email" type="email" required autoComplete="email" />
        <Field label="Phone" name="phone" type="tel" autoComplete="tel" />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="productType" className="text-[13.5px] font-semibold text-graphite">
            Product type
          </label>
          <select
            id="productType"
            name="productType"
            className="rounded-[10px] border border-[#E7E9EC] px-3.5 py-2.5 text-[14.5px] text-graphite outline-none focus:border-orange"
            defaultValue=""
          >
            <option value="" disabled>
              Select a product
            </option>
            {/* High-Speed Line Compatible is a real product (shown on /products)
                but intentionally excluded from this dropdown per client request. */}
            {PRODUCTS.filter((p) => p.slug !== "high-speed-line-compatible").map((p) => (
              <option key={p.slug} value={p.name}>
                {p.name}
              </option>
            ))}
            <option value="Not sure yet">Not sure yet</option>
          </select>
        </div>

        <Field label="Estimated volume" name="volume" placeholder="e.g. 500,000 units / month" />
        <Field label="Location" name="location" placeholder="City, country" className="sm:col-span-2" />

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="message" className="text-[13.5px] font-semibold text-graphite">
            Message <span className="text-orange">*</span>
          </label>
          <textarea
            id="message"
            name="message"
            required
            rows={5}
            placeholder="Tell us about your requirements — product specs, timeline, or anything else that helps us prepare a quote."
            className="resize-none rounded-[10px] border border-[#E7E9EC] px-3.5 py-2.5 text-[14.5px] text-graphite outline-none focus:border-orange"
          />
        </div>
      </div>

      {status === "error" && <p className="mt-4 text-sm text-orange-deep">{errorMsg}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="mt-6 inline-flex items-center gap-2 rounded-[10px] bg-orange px-7 py-3.5 font-semibold text-white shadow-[0_12px_24px_rgba(241,83,28,0.28)] transition-transform hover:-translate-y-0.5 disabled:opacity-70"
      >
        {status === "submitting" && <Loader2 size={16} className="animate-spin" />}
        {status === "submitting" ? "Sending..." : "Send Request"}
      </button>

      <p className="mt-4 text-xs leading-relaxed text-muted">
        Prefer email? Reach us directly at{" "}
        <a href={`mailto:${COMPANY.email}`} className="font-semibold text-orange">
          {COMPANY.email}
        </a>
        .
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  autoComplete,
  placeholder,
  className = "",
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={name} className="text-[13.5px] font-semibold text-graphite">
        {label} {required && <span className="text-orange">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="rounded-[10px] border border-[#E7E9EC] px-3.5 py-2.5 text-[14.5px] text-graphite outline-none focus:border-orange"
      />
    </div>
  );
}
