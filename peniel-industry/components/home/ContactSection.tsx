import Reveal from "@/components/ui/Reveal";
import Eyebrow from "@/components/ui/Eyebrow";
import { WhiteButton, GhostButton } from "@/components/ui/Buttons";
import MapEmbed from "@/components/ui/MapEmbed";
import { MapPin, Phone, Mail } from "lucide-react";
import { COMPANY } from "@/lib/constants";

export default function ContactSection() {
  return (
    <section
      id="contact"
      className="px-6 py-24 pb-28"
      style={{
        background:
          "radial-gradient(1000px 560px at 50% -10%, var(--color-orange-light) 0%, var(--color-orange) 55%, var(--color-orange-deep) 100%)",
      }}
    >
      <div className="mx-auto max-w-3xl text-center">
        <Eyebrow tone="onOrange">Get In Touch</Eyebrow>
        <Reveal delay={80}>
          <h2 className="mb-[18px] text-[clamp(2rem,4vw,2.9rem)] font-extrabold text-white">
            Let&apos;s talk about your crown cork requirements
          </h2>
        </Reveal>
        <Reveal delay={140}>
          <p className="mx-auto mb-10 max-w-lg text-[16.5px] leading-relaxed text-white/92">
            Whether you&apos;re a beverage producer, distributor, or partner, our team is ready to
            discuss your requirements and provide a quote.
          </p>
        </Reveal>
        <Reveal delay={200} className="mb-12">
          <div className="mb-10 flex flex-wrap justify-center gap-3.5">
            <WhiteButton href="/contact">Request a Quote</WhiteButton>
            <GhostButton light href="/contact" showArrow={false}>
              Request Samples
            </GhostButton>
          </div>
        </Reveal>

        <div className="mb-8 grid grid-cols-1 gap-5 text-left sm:grid-cols-3">
          {[
            { Icon: MapPin, label: "Address", val: COMPANY.addressLine },
            { Icon: Phone, label: "Phone", val: COMPANY.phone },
            { Icon: Mail, label: "Email", val: COMPANY.email },
          ].map(({ Icon, label, val }) => (
            <div key={label} className="rounded-[14px] border border-[#E7E9EC] bg-white p-5">
              <Icon size={18} className="mb-2.5 text-orange" />
              <p className="mb-1 font-brandmono text-xs uppercase tracking-[0.06em] text-muted">{label}</p>
              <p className="text-[14.5px] font-semibold text-graphite">{val}</p>
            </div>
          ))}
        </div>

        <Reveal delay={100}>
          <MapEmbed />
        </Reveal>
      </div>
    </section>
  );
}
