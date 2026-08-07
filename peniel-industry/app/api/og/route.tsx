import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

function toDataUri(relativePath: string, mime: string) {
  const filePath = join(process.cwd(), "public", relativePath);
  const buffer = readFileSync(filePath);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") || "Peniel Industry PLC";
  const eyebrow = searchParams.get("eyebrow") || "Crown Cork Manufacturer · Ethiopia";

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
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px",
          backgroundColor: "#27438E",
          backgroundImage: "radial-gradient(1000px 600px at 85% -10%, rgba(255,255,255,0.10), transparent)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 44 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/image is incompatible with next/og's satori renderer; a plain <img> is required here */}
          <img src={logo} alt="" width={52} height={52} />
          <div style={{ display: "flex", fontFamily: "Baloo", fontSize: 28, color: "#ffffff" }}>
            <span style={{ marginRight: 10 }}>PENIEL</span>
            <span style={{ color: "rgba(255,255,255,0.75)" }}>INDUSTRY</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Inter",
            fontSize: 20,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "#FF8C5A",
            marginBottom: 22,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Poppins",
            fontSize: 58,
            lineHeight: 1.15,
            color: "#ffffff",
            maxWidth: 980,
          }}
        >
          {title}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Poppins", data: poppins, weight: 800, style: "normal" },
        { name: "Inter", data: inter, weight: 500, style: "normal" },
        { name: "Baloo", data: baloo, weight: 800, style: "normal" },
      ],
    }
  );
}
