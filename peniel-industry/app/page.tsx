import type { Metadata } from "next";
import HeroArrival from "@/components/home/HeroArrival";
import FactorySection from "@/components/home/FactorySection";
import ProductsSection from "@/components/home/ProductsSection";
import PrecisionSection from "@/components/home/PrecisionSection";
import QualitySection from "@/components/home/QualitySection";
import SustainabilitySection from "@/components/home/SustainabilitySection";
import DeliverySection from "@/components/home/DeliverySection";
import ContactSection from "@/components/home/ContactSection";
import ScallopDivider from "@/components/ui/ScallopDivider";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: `${COMPANY.legalName} — Crown Cork Manufacturer, Ethiopia`,
  description:
    "Peniel Industry PLC manufactures premium-quality crown corks for breweries, soft drink producers, and bottled water companies across Ethiopia.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <HeroArrival />
      <ScallopDivider bg="var(--color-porcelain)" accent="var(--color-orange)" />
      <FactorySection />
      <ScallopDivider bg="var(--color-porcelain)" accent="var(--color-steel)" />
      <ProductsSection />
      <ScallopDivider bg="var(--color-porcelain)" accent="var(--color-orange)" />
      <PrecisionSection />
      <ScallopDivider bg="var(--color-navy-tint)" accent="var(--color-navy)" />
      <QualitySection />
      <ScallopDivider bg="var(--color-porcelain)" accent="var(--color-navy)" />
      <SustainabilitySection />
      <ScallopDivider bg="var(--color-porcelain)" accent="var(--color-orange)" />
      <DeliverySection />
      <ScallopDivider bg="var(--color-orange)" accent="#ffffff" />
      <ContactSection />
    </>
  );
}
