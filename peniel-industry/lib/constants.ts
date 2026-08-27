// ============================================================================
// Verified company data — the single source of truth for factual content
// used across the site. Every field here traces back to either the client's
// original website, or facts/assets supplied directly by the client during
// this project. Nothing here is invented. Where a fact was not available,
// it is intentionally omitted rather than guessed at.
// ============================================================================

export const COMPANY = {
  legalName: "Peniel Industry PLC",
  shortName: "Peniel Industry",
  founder: "Birtukan Abebe",
  founderTitle: "CEO",
  addressLine: "Bole Lemi Industrial Park, Addis Ababa, Ethiopia",
  city: "Addis Ababa",
  country: "Ethiopia",
  phone: "+251 11 123 4567",
  email: "info@penielindustry.org",
  coordinates: { lat: 8.9714, lng: 38.8568 },
  tagline: "Precision-manufactured crown corks for Ethiopia's beverage industry.",
} as const;

export const SITE_URL = "https://www.penielindustry.org";

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Products" },
  { href: "/manufacturing", label: "Manufacturing" },
  { href: "/quality", label: "Quality" },
  { href: "/sustainability", label: "Sustainability" },
  { href: "/industries", label: "Industries" },
  { href: "/about", label: "About" },
  { href: "/insights", label: "Insights" },
] as const;

export const CONTACT_CTA = { href: "/contact", label: "Get a Quote" };

export const SOCIAL_LINKS = {
  linkedin: "https://www.linkedin.com/in/peniel-industry-plc-07776b428/",
  instagram: "https://www.instagram.com/penielindustry/",
  // Add the Facebook page URL here once it's live — the footer will pick
  // it up automatically, no other code changes needed.
  facebook: null as string | null,
} as const;

export const PRODUCTS = [
  {
    slug: "standard-crown-corks",
    name: "Standard Crown Corks",
    tagline: "Our core product line",
    desc: "Precision-stamped crown corks with food-grade coating, engineered for a secure, consistent seal across beer, soft drink, and water bottles.",
    outcomes: [
      "Consistent crimp and seal integrity",
      "Food-grade coating safe for direct beverage contact",
      "Batch-tested for reliable, repeatable quality",
    ],
  },
  {
    slug: "custom-colors-printing",
    name: "Custom Colors & Printing",
    tagline: "Brand-ready shelf appeal",
    desc: "Brand-ready caps with custom color matching and printed detail, giving your product shelf-ready distinction.",
    outcomes: [
      "Custom color matching to your brand",
      "Printed detail for logos and product marks",
      "Same sealing performance as our standard line",
    ],
  },
  {
    slug: "high-speed-line-compatible",
    name: "High-Speed Line Compatible",
    tagline: "Built for modern bottling lines",
    desc: "Manufactured to tight tolerances so caps run reliably on modern high-speed bottling and capping equipment.",
    outcomes: [
      "Tight dimensional tolerances",
      "Reliable feed and crimp on automated lines",
      "Reduces line stoppages from cap misfeeds",
    ],
  },
] as const;

export const PRODUCT_ATTRIBUTES = [
  { title: "Food-Grade Coating", desc: "Compliant liners and coatings safe for direct contact with beverages." },
  { title: "High Sealing Performance", desc: "Consistent crimp and seal integrity that protects carbonation and freshness." },
  { title: "Corrosion Resistance", desc: "Durable finishes engineered to withstand transport, storage, and handling." },
  { title: "High-Speed Compatible", desc: "Manufactured to tight tolerances for reliable performance on modern bottling lines." },
  { title: "Custom Colors & Printing", desc: "Custom color matching and printed detail for shelf-ready brand distinction." },
  { title: "Reliable, Batch-Tested Quality", desc: "Consistent output backed by strict quality assurance at every stage." },
] as const;

export const PROCESS_STEPS = [
  { n: "01", title: "Raw Material Handling", desc: "Tinplate steel is received and staged for production." },
  { n: "02", title: "Forming & Stamping", desc: "Precision stamping and forming at tight, controlled tolerances." },
  { n: "03", title: "Coating & Printing", desc: "Food-grade coating with custom color matching and printed detail." },
  { n: "04", title: "Multi-Point Inspection", desc: "Quality checks run throughout the production process, not just at the end." },
  { n: "05", title: "Packing & Dispatch", desc: "Batch-tested output packed for delivery nationwide." },
] as const;

export const QUALITY_PRACTICES = [
  { title: "Food-Grade Coating", desc: "Compliant liners and coatings safe for direct contact with beverages." },
  { title: "High Sealing Performance", desc: "Consistent crimp and seal integrity that protects carbonation and freshness." },
  { title: "Corrosion Resistance", desc: "Durable finishes engineered to withstand transport, storage, and handling." },
  { title: "Reliable, Batch-Tested Quality", desc: "Consistent output backed by strict quality assurance at every stage." },
] as const;

export const SUSTAINABILITY_PILLARS = [
  { key: "efficient", title: "Efficient Manufacturing", desc: "Continuous investment in equipment and processes that reduce energy and material waste per unit produced." },
  { key: "responsible", title: "Responsible Production", desc: "Quality-first processes that minimize rework, scrap, and resource loss." },
  { key: "waste", title: "Waste Reduction", desc: "Material handling practices designed to reduce metal and packaging waste across the production cycle." },
  { key: "local", title: "Supporting Local Industry", desc: "Creating skilled manufacturing jobs and strengthening Ethiopia's domestic supply chain for the beverage sector." },
] as const;

export const GROWTH_TIMELINE = [
  { title: "Founding", desc: "Peniel Industry PLC is established to serve Ethiopia's beverage industry with domestically manufactured crown corks." },
  { title: "Facility Build-Out", desc: "Dedicated production facilities are built out at Bole Lemi Industrial Park, Addis Ababa." },
  { title: "Technology Upgrade", desc: "Investment in advanced manufacturing equipment to improve precision and consistency." },
  { title: "National Reach", desc: "Expansion of relationships with breweries, soft drink producers, and bottled water companies across Ethiopia." },
  { title: "Today", desc: "A dedicated crown cork manufacturer serving customers nationwide, built on a single standard: precision, consistency, reliability." },
] as const;

export const INDUSTRIES = [
  {
    key: "breweries",
    title: "Breweries",
    desc: "Crown corks engineered for consistent seal integrity, protecting carbonation and freshness through transport and storage.",
  },
  {
    key: "soft-drinks",
    title: "Soft Drink Producers",
    desc: "Reliable, high-speed line compatible caps with custom color and print options for shelf-ready brand distinction.",
  },
  {
    key: "bottled-water",
    title: "Bottled Water Companies",
    desc: "Food-grade coated closures batch-tested for consistent quality across large production runs.",
  },
] as const;

export const PARTNERS = [
  { name: "Commercial Bank of Ethiopia", logo: "commercial_bank_ethiopia" },
  { name: "Zemen Bank", logo: "zemen_bank" },
  { name: "Heineken", logo: "heineken" },
  { name: "Berhan Bank", logo: "berhan_bank" },
  { name: "Dashen Bank", logo: "dashen_bank" },
  { name: "BGI Ethiopia", logo: "bgi_ethiopia" },
  { name: "Coca-Cola Beverages Africa", logo: "coca_cola_beverages_africa" },
  { name: "Dashen Breweries S.C.", logo: "dashen_breweries" },
  { name: "Ethiopian Investment Commission", logo: "eic" },
  { name: "Habesha Brewery", logo: "habesha_brewery" },
  { name: "United Beverages", logo: "united_beverages" },
  { name: "IPDC", logo: "ipdc" },
] as const;

export const FAQS = [
  {
    q: "What does Peniel Industry PLC manufacture?",
    a: "We manufacture crown corks for the beverage industry, including standard crown corks, custom color and printed caps, and caps compatible with high-speed bottling lines.",
  },
  {
    q: "Who does Peniel Industry PLC supply?",
    a: "We supply breweries, soft drink producers, and bottled water companies across Ethiopia.",
  },
  {
    q: "Where is Peniel Industry PLC located?",
    a: "Our facility is located at Bole Lemi Industrial Park, Addis Ababa, Ethiopia.",
  },
  {
    q: "Are your crown corks food-grade?",
    a: "Yes. Our crown corks use food-grade coating and liners safe for direct contact with beverages.",
  },
  {
    q: "Can you match our brand colors and printing?",
    a: "Yes. Our Custom Colors & Printing line offers custom color matching and printed detail for shelf-ready brand distinction.",
  },
  {
    q: "How do I request a quote or samples?",
    a: "Use the quote request form on our Contact page, or reach us directly by phone or email — details are on that page.",
  },
] as const;
