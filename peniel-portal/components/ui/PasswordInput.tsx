"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

/** A password field with a Show / Hide button, so people can check what they typed (especially on a phone). */
export default function PasswordInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} className={`${props.className ?? "input min-h-11"} !pr-[84px]`} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 flex cursor-pointer items-center gap-1.5 border-0 bg-transparent px-3 text-[12px] font-semibold text-text opacity-70 hover:opacity-100"
      >
        {shown ? <EyeOff size={16} strokeWidth={2} aria-hidden="true" /> : <Eye size={16} strokeWidth={2} aria-hidden="true" />}
        {shown ? "Hide" : "Show"}
      </button>
    </div>
  );
}
