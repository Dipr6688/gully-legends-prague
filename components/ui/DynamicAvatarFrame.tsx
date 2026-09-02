import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DynamicAvatarFrameMode =
  | "normal"
  | "hallGold"
  | "hallSilver"
  | "hallBronze"
  | "battingBeast"
  | "bowlingBeast"
  | "fieldingBeast"
  | "pom"
  | "pomStatic";

const modeClasses = {
  normal: "",
  hallGold: "dynamic-avatar-frame-hall-gold",
  hallSilver: "dynamic-avatar-frame-hall-silver",
  hallBronze: "dynamic-avatar-frame-hall-bronze",
  battingBeast: "dynamic-avatar-frame-batting-beast",
  bowlingBeast: "dynamic-avatar-frame-bowling-beast",
  fieldingBeast: "dynamic-avatar-frame-fielding-beast",
  pom: "dynamic-avatar-frame-pom",
  pomStatic: "dynamic-avatar-frame-pom-static"
} satisfies Record<DynamicAvatarFrameMode, string>;

export function getDynamicAvatarFrameClassName(
  mode: DynamicAvatarFrameMode,
  className?: string
) {
  return cn("dynamic-avatar-frame", modeClasses[mode], className);
}

export function DynamicAvatarFrame({
  mode,
  className,
  children
}: {
  mode: DynamicAvatarFrameMode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={getDynamicAvatarFrameClassName(mode, className)}>
      {children}
    </div>
  );
}
