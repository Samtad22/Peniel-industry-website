import type { Metadata } from "next";
import PageHero from "@/components/ui/PageHero";
import Reveal from "@/components/ui/Reveal";
import QuoteForm from "@/components/forms/QuoteForm";
import MapEmbed from "@/components/ui/MapEmbed";
import { MapPin, Phone, Mail } from "lucide-react";
import { COMPANY } from "@/lib/constants";
import { ogImage } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Contact & Request a Quote",
  description: `Get in touch with ${COMPANY.legalName} for quotes, samples, or technical questions about our crown corks.`,
  alternates: { canonical: "/contact" },
  openGraph: ogImage("Let's talk about your crown cork requirements", "Get In Touch"),
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Get In Touch"
        title="Let's talk about your crown cork requirements"
        intro="Whether you're a beverage producer, distributor, or partner, our team is ready to discuss your requirements and provide a quote."
      />

      <section className="bg-porcelain px-6 py-20">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <Reveal>
              <div className="flex flex-col gap-4">
                {[
                  { Icon: MapPin, label: "Address", val: COMPANY.addressLine },
                  { Icon: Phone, label: "Phone", val: COMPANY.phone, href: `tel:${COMPANY.phone.replace(/\s+/g, "")}` },
                  { Icon: Mail, label: "Email", val: COMPANY.email, href: `mailto:${COMPANY.email}` },
                ].map(({ Icon, label, val, href }) => (
                  <div key={label} className="rounded-[14px] border border-[#E7E9EC] bg-white p-5">
                    <Icon size={18} className="mb-2.5 text-orange" />
                    <p className="mb-1 font-brandmono text-xs uppercase tracking-[0.06em] text-muted">{label}</p>
                    {href ? (
                      <a href={href} className="text-[14.5px] font-semibold text-graphite hover:text-orange">
                        {val}
                      </a>
                    ) : (
                      <p className="text-[14.5px] font-semibold text-graphite">{val}</p>
                    )}
                  </div>
                ))}
              </div>
            </Reveal>
            <Reveal delay={100} className="mt-6">
              <MapEmbed />
            </Reveal>
          </div>

          <Reveal delay={80}>
            <QuoteForm />
          </Reveal>
        </div>
      </section>
    </>
  );
}
