import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy notice" };

/** The customer portal's privacy notice (public). Keep it in step with what the portal actually does. */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy notice"
      updated="2 October 2026"
      intro={
        <p className="m-0">
          This notice explains what personal information the Peniel Customer Portal (portal.penielindustry.org) holds, why, who can see it and the choices you have. The
          portal is run by Peniel Industry PLC for its business customers.
        </p>
      }
    >
      <section>
        <h2>1. Who we are</h2>
        <p>
          Peniel Industry PLC, Bole Lemi Industrial Park, Addis Ababa, Ethiopia (&ldquo;Peniel&rdquo;, &ldquo;we&rdquo;). We decide how the information in the portal is used
          and are responsible for it.
        </p>
      </section>

      <section>
        <h2>2. What we hold</h2>
        <ul>
          <li>
            <b>Your account:</b> your name, work email address, the company you work for, your role in the portal, and when you last signed in.
          </li>
          <li>
            <b>What you send us:</b> orders and purchase orders, specifications, artwork files, proof approvals and comments, messages to our team, and pickup bookings.
          </li>
          <li>
            <b>What we add about your orders:</b> order status and due dates, production and quality results we publish to you, Certificates of Analysis, finished stock,
            and documents we share with you.
          </li>
          <li>
            <b>Records of use:</b> a log of changes made in the portal (who did what and when) and a record of the emails the portal sends you.
          </li>
          <li>
            <b>Cookies:</b> only the cookies needed to keep you signed in. The portal uses no advertising or tracking cookies and no analytics.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Why we use it</h2>
        <ul>
          <li>To give you the portal and handle your orders, artwork, quality documents and pickups (our agreement with your company).</li>
          <li>To email you about your orders and account, such as an order confirmed, a proof to approve or a certificate ready.</li>
          <li>To keep the portal secure, prevent misuse and keep a record of changes.</li>
          <li>To meet our legal, tax, accounting and quality-record obligations.</li>
        </ul>
        <p>We do not sell your information, and we do not use it for marketing without asking you first.</p>
      </section>

      <section>
        <h2>4. Who can see it</h2>
        <ul>
          <li>People at your own company who have a portal account.</li>
          <li>Peniel staff whose work needs it, each limited to their role (for example sales, production, quality or warehouse).</li>
          <li>
            Our service providers, who run the portal for us and may only use the information to do so: Vercel (hosting), Supabase (database, file storage and sign-in) and
            Resend (email delivery).
          </li>
          <li>Authorities, when the law requires us to share it.</li>
        </ul>
        <p>Other customers never see your company&apos;s information. This separation is enforced in the database itself, not only on screen.</p>
      </section>

      <section>
        <h2>5. Where it is stored</h2>
        <p>
          The information is stored and processed by the providers above, on servers that may be outside Ethiopia. We choose providers that protect the information with
          strong security and use it only on our instructions.
        </p>
      </section>

      <section>
        <h2>6. How we protect it</h2>
        <ul>
          <li>Accounts are by invitation only; there is no public sign-up.</li>
          <li>Passwords are at least 10 characters and are never stored in readable form.</li>
          <li>All connections to the portal are encrypted (HTTPS).</li>
          <li>Each company&apos;s information is kept separate in the database, and files are kept private and opened only through short-lived links.</li>
          <li>Staff access follows their role, and changes are logged.</li>
        </ul>
        <p>If we become aware of a breach that affects your information, we will tell you and act as the law requires.</p>
      </section>

      <section>
        <h2>7. How long we keep it</h2>
        <p>
          We keep the information while your company works with us and afterwards for as long as we need it for legal, tax, accounting and product-quality records. After
          that it is deleted or made anonymous. When someone leaves your company, tell us and we will close their account.
        </p>
      </section>

      <section>
        <h2>8. Your choices and rights</h2>
        <p>
          You can ask us for a copy of your personal information, to correct it, or to delete it (unless we must keep it, for example for tax or quality records). You can also
          object to how we use it. To do so, contact us as below; we will reply within 30 days.
        </p>
        <p>
          If you are not satisfied with our answer, you can complain to the authority responsible for personal data protection in Ethiopia under the Personal Data Protection
          Proclamation No. 1321/2024.
        </p>
      </section>

      <section>
        <h2>9. Changes to this notice</h2>
        <p>We may update this notice as the portal changes. The date at the top shows the latest version, and we will tell you of important changes.</p>
      </section>

      <section>
        <h2>10. Contact us</h2>
        <p>
          Send us a message in the portal (Messages), or call +251 11 668 9255. Peniel Industry PLC, Bole Lemi Industrial Park, Addis Ababa, Ethiopia.
        </p>
      </section>
    </LegalPage>
  );
}
