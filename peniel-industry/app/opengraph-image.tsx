import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";
import { COMPANY } from "@/lib/constants";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${COMPANY.legalName} | Crown Cork Manufacturer, Ethiopia`;

function toDataUri(relativePath: string, mime: string) {
  const filePath = join(process.cwd(), "public", relativePath);
  const buffer = readFileSync(filePath);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export default async function OgImage() {
  const heroPhoto = toDataUri("img/hero-facility.jpg", "image/jpeg");
  const logo = toDataUri("img/logo-icon.png", "image/png");

  const poppins = readFileSync(join(process.cwd(), "app/og-assets/poppins-800.woff"));
  const inter = readFileSync(join(process.cwd(), "app/og-assets/inter-500.woff"));
  const baloo = readFileSync(join(process.cwd(), "app/og-assets/baloo-800.woff"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: "#132B52",
        }}
      >
        <img
          src={heroPhoto}
          alt=""
          width={1200}
          height={630}
          style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: "flex",
            background:
              "linear-gradient(100deg, rgba(196,61,16,0.92) 0%, rgba(241,83,28,0.68) 38%, rgba(20,15,10,0.35) 75%)",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "72px",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 36 }}>
            <img src={logo} alt="" width={56} height={56} />
            <div style={{ display: "flex", fontFamily: "Baloo", fontSize: 30, color: "#ffffff" }}>
              <span style={{ marginRight: 10 }}>PENIEL</span>
              <span style={{ color: "rgba(255,255,255,0.8)" }}>INDUSTRY</span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Inter",
              fontSize: 20,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: "#ffffff",
              marginBottom: 20,
            }}
          >
            Crown Cork Manufacturer · Ethiopia
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Poppins",
              fontSize: 56,
              lineHeight: 1.15,
              color: "#ffffff",
              maxWidth: 820,
            }}
          >
            Precision manufacturing for Ethiopia&apos;s beverage industry
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Poppins", data: poppins, weight: 800, style: "normal" },
        { name: "Inter", data: inter, weight: 500, style: "normal" },
        { name: "Baloo", data: baloo, weight: 800, style: "normal" },
      ],
    }
  );
}
