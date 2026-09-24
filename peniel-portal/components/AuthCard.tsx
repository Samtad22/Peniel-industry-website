import Image from "next/image";

/**
 * Sign-in layout — design screen 1a (Peniel Customer Portal): the form on
 * the left, a red panel with the black-and-white factory photo on the right.
 * Used by sign-in, forgot password and choose password.
 */
export default function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-bg lg:grid-cols-2">
      <div className="flex flex-col justify-between gap-12 px-6 py-10 sm:p-12 lg:border-r-2 lg:border-divider">
        <div className="flex items-center gap-3">
          <Image src="/img/logo-icon.png" alt="" width={36} height={36} priority />
          <b className="text-[18px]">Peniel Industry PLC</b>
        </div>
        <div className="flex w-full max-w-[420px] flex-col gap-5">
          <h1 className="m-0 text-[40px] sm:text-[48px]">{title}</h1>
          {description && <p className="m-0 text-[14px] opacity-75">{description}</p>}
          {children}
        </div>
        <div className="text-[12px] opacity-55">Bole Lemi Industrial Park · +251 11 668 9255</div>
      </div>
      <div className="relative hidden bg-accent lg:block" aria-hidden="true">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-55 mix-blend-multiply"
          style={{ backgroundImage: "url(/img/hero-facility.jpg)", filter: "grayscale(1) contrast(1.08)" }}
        />
        <div className="absolute inset-x-12 bottom-12 flex flex-col gap-4 text-bg">
          <h2 className="m-0 text-[56px] leading-[.98]">Order, track, approve artwork.</h2>
          <div className="grid grid-cols-3 border-t-2 border-bg text-[14px]">
            <span className="pt-3">Orders with your PO attached</span>
            <span className="pt-3">Batch QC certificates</span>
            <span className="pt-3">Print proofs</span>
          </div>
        </div>
      </div>
    </main>
  );
}
