import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of use" };

/** Terms of use of the customer portal (public). */
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      updated="2 October 2026"
      intro={
        <p className="m-0">
          These terms apply to the Peniel Customer Portal (portal.penielindustry.org), run by Peniel Industry PLC (&ldquo;Peniel&rdquo;, &ldquo;we&rdquo;). By signing in you
          agree to them on behalf of yourself and your company. How we handle personal information is explained in our{" "}
          <Link href="/privacy">privacy notice</Link>.
        </p>
      }
    >
      <section>
        <h2>1. The portal</h2>
        <p>
          The portal lets Peniel&apos;s business customers place and follow orders, approve artwork and proofs, see production and quality information for their own orders,
          download documents, book pickups and message our team. Access is by invitation only.
        </p>
      </section>

      <section>
        <h2>2. Your account</h2>
        <ul>
          <li>Your account is personal. Keep your password secret and do not share your account; ask us to invite colleagues instead.</li>
          <li>You are responsible for what is done through your account. Tell us at once if you think someone else has used it.</li>
          <li>Tell us when someone at your company no longer needs access, so we can close their account.</li>
        </ul>
      </section>

      <section>
        <h2>3. Orders</h2>
        <ul>
          <li>An order placed in the portal is a request. It becomes binding when Peniel confirms it.</li>
          <li>Prices, quantities, specifications, payment and delivery follow your purchase order and any agreement between your company and Peniel.</li>
          <li>Due dates are our best estimate. If one changes, we will tell you why in the portal.</li>
          <li>You can cancel an order yourself while it is still waiting for confirmation; after that, contact us.</li>
        </ul>
      </section>

      <section>
        <h2>4. Information in the portal</h2>
        <p>
          Production, quality and stock figures are shown for your information and are updated by our team. The signed Certificate of Analysis and the delivery documents are
          the official records. We work to keep the portal accurate, but if a figure looks wrong, please tell us.
        </p>
      </section>

      <section>
        <h2>5. Artwork and files</h2>
        <ul>
          <li>You confirm that you have the right to use the artwork and files you send us, and you allow Peniel to use them to make and print your crowns.</li>
          <li>Approving a proof confirms the design is ready to print as shown.</li>
          <li>Upload only the file types the portal accepts, and nothing harmful such as viruses.</li>
        </ul>
      </section>

      <section>
        <h2>6. Fair use</h2>
        <p>
          Use the portal only for your company&apos;s business with Peniel. Do not try to see other customers&apos; information, get around the portal&apos;s security, or use
          automated tools to copy or overload it.
        </p>
      </section>

      <section>
        <h2>7. Availability</h2>
        <p>
          We aim to keep the portal available at all times, but it may sometimes be unavailable for maintenance or reasons outside our control. For anything urgent, call us on
          +251 11 668 9255.
        </p>
      </section>

      <section>
        <h2>8. Responsibility</h2>
        <p>
          As far as the law allows, Peniel is not responsible for indirect losses arising from using, or not being able to use, the portal. Nothing in these terms limits any
          responsibility that cannot be limited by law, or changes the agreements between your company and Peniel.
        </p>
      </section>

      <section>
        <h2>9. Changes and ending access</h2>
        <p>
          We may update these terms; the date at the top shows the latest version, and we will tell you of important changes. We may suspend an account that is misused. Access
          ends when your company no longer works with Peniel or asks us to close it.
        </p>
      </section>

      <section>
        <h2>10. Law</h2>
        <p>These terms are governed by the laws of Ethiopia, and the courts of Addis Ababa decide any dispute.</p>
      </section>

      <section>
        <h2>11. Contact us</h2>
        <p>Send us a message in the portal (Messages), or call +251 11 668 9255. Peniel Industry PLC, Bole Lemi Industrial Park, Addis Ababa, Ethiopia.</p>
      </section>
    </LegalPage>
  );
}
