"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { forgetSavedSignature, removeSignature, signCertificate, type SignState } from "@/app/certificates/[id]/actions";
import Modal from "@/components/ui/Modal";
import { Button, FormMessage } from "@/components/ui/form";
import { SIGNATURE_LINES, type SignatureLine } from "@/lib/signatures";

/** Canvas size of a signature (drawn at this size whatever the screen, so every signature prints alike). */
const W = 600;
const H = 200;
const INK = "#16213e";
const CHOICE = "min-h-10 cursor-pointer border border-divider bg-transparent px-3.5 text-[13px] text-text";
const CHOICE_ON = "!border-text !bg-text font-bold !text-bg";

/** "Sign here": draw a signature on screen (finger, pen or mouse), or use the saved one. */
export function SignDialog({ inspectionId, line, saved }: { inspectionId: string; line: SignatureLine; saved: string | null }) {
  return (
    <Modal
      wide
      title={`Sign “${SIGNATURE_LINES[line]}”`}
      trigger={(open) => (
        <Button type="button" onClick={open} icon="✎" className="w-[190px] whitespace-nowrap">
          Sign here
        </Button>
      )}
    >
      {(close) => <SignForm inspectionId={inspectionId} line={line} saved={saved} close={close} />}
    </Modal>
  );
}

function SignForm({ inspectionId, line, saved, close }: { inspectionId: string; line: SignatureLine; saved: string | null; close: () => void }) {
  const [state, action, pending] = useActionState<SignState, FormData>(signCertificate, null);
  const [useSaved, setUseSaved] = useState(!!saved);
  const [image, setImage] = useState("");

  return (
    <form action={action} className="flex flex-col gap-3.5">
      <input type="hidden" name="inspection_id" value={inspectionId} />
      <input type="hidden" name="line" value={line} />
      <input type="hidden" name="image" value={useSaved ? "" : image} />
      {useSaved && <input type="hidden" name="use_saved" value="on" />}

      {saved && (
        <div className="flex flex-wrap gap-2 text-[13px]" role="radiogroup" aria-label="Signature">
          <button type="button" role="radio" aria-checked={useSaved} onClick={() => setUseSaved(true)} className={`${CHOICE} ${useSaved ? CHOICE_ON : ""}`}>
            My saved signature
          </button>
          <button type="button" role="radio" aria-checked={!useSaved} onClick={() => setUseSaved(false)} className={`${CHOICE} ${!useSaved ? CHOICE_ON : ""}`}>
            Draw a new one
          </button>
        </div>
      )}

      {useSaved && saved ? (
        <div className="border border-divider bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL */}
          <img src={saved} alt="Your saved signature" className="mx-auto block h-[120px] w-auto max-w-full object-contain" />
        </div>
      ) : (
        <>
          <SignaturePad onChange={setImage} />
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" name="save" defaultChecked={!saved} className="size-4 accent-[var(--color-accent)]" />
            {saved ? "Replace my saved signature with this one" : "Save my signature to use next time"}
          </label>
        </>
      )}

      <p className="m-0 text-[12px] opacity-70">
        You sign as yourself, with today&apos;s date. The signature appears on the certificate the customer sees, and the
        customer is emailed that it&apos;s ready once the batch is released and published.
      </p>
      <FormMessage state={state} />
      <div className="dialog-actions">
        <Button type="button" variant="secondary" onClick={close}>
          {state?.ok ? "Done" : "Cancel"}
        </Button>
        {!state?.ok && (
          <Button type="submit" disabled={pending || (!useSaved && !image)} icon="✎" className="w-[170px]">
            {pending ? "Signing…" : "Sign"}
          </Button>
        )}
      </div>
    </form>
  );
}

/** A box to draw in. Reports the drawing as a PNG data URL ("" when empty). */
function SignaturePad({ onChange }: { onChange: (png: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 3;
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    last.current = p;
    const ctx = e.currentTarget.getContext("2d");
    ctx?.beginPath();
    ctx?.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
    ctx?.fill();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    // Pressure from a pen, a steady line from a finger or mouse.
    ctx.lineWidth = e.pointerType === "pen" && e.pressure > 0 ? 1.5 + e.pressure * 3 : 3;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setEmpty(false);
    onChange(ref.current?.toDataURL("image/png") ?? "");
  };
  const clear = () => {
    const c = ref.current;
    c?.getContext("2d")?.clearRect(0, 0, W, H);
    setEmpty(true);
    onChange("");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative border border-text bg-white">
        <canvas
          ref={ref}
          width={W}
          height={H}
          aria-label="Draw your signature here"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="block aspect-[3/1] w-full cursor-crosshair touch-none"
        />
        <span aria-hidden="true" className="pointer-events-none absolute right-4 bottom-[22%] left-4 border-b border-dashed border-neutral-400" />
        {empty && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center text-[14px] opacity-40">
            Sign here with your finger, a pen or the mouse
          </span>
        )}
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={clear} className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-accent-800 underline underline-offset-2">
          Clear
        </button>
      </div>
    </div>
  );
}

/** Take a signature off the certificate. */
export function RemoveSignatureButton({ inspectionId, line }: { inspectionId: string; line: SignatureLine }) {
  return (
    <form
      action={removeSignature}
      onSubmit={(e) => {
        if (!confirm(`Remove the “${SIGNATURE_LINES[line]}” signature?`)) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="inspection_id" value={inspectionId} />
      <input type="hidden" name="line" value={line} />
      <button type="submit" className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-accent-800 underline underline-offset-2">
        Remove signature
      </button>
    </form>
  );
}

/** Forget the saved signature (it stays on certificates already signed). */
export function ForgetSavedSignature({ inspectionId }: { inspectionId: string }) {
  return (
    <form
      action={forgetSavedSignature}
      onSubmit={(e) => {
        if (!confirm("Forget your saved signature? Certificates you've signed keep it.")) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="inspection_id" value={inspectionId} />
      <button type="submit" className="cursor-pointer border-0 bg-transparent p-0 text-[12px] underline underline-offset-2 opacity-70">
        Forget my saved signature
      </button>
    </form>
  );
}
