import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

const buttonStyles =
  "neon-button inline-flex min-h-10 items-center justify-center gap-2 border border-black/70 bg-neon-yellow px-4 py-2 font-ui text-sm font-black uppercase tracking-wide text-pitch-950 transition hover:-translate-y-0.5 hover:scale-[1.03] hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:ring-offset-2 focus:ring-offset-pitch-950 disabled:cursor-not-allowed disabled:opacity-55";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
};

function variantClass(variant: ButtonProps["variant"]) {
  if (variant === "secondary") {
    return "border-neon-cyan/45 bg-black/55 text-neon-cyan shadow-none hover:bg-pitch-800";
  }

  if (variant === "ghost") {
    return "border-white/15 bg-black/45 text-stone-100 shadow-none hover:bg-white/10";
  }

  return "";
}

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonStyles, variantClass(variant), className)}
      {...props}
    />
  );
}

export function LinkButton({
  className,
  variant = "primary",
  href,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      className={cn(buttonStyles, variantClass(variant), className)}
      href={href}
      {...props}
    >
      {children}
    </Link>
  );
}
