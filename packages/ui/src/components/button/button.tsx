/**
 * Buttons. The primary one is ink on paper — the one warm colour on a screen belongs to the
 * decision card, not to a button — and the danger one is quiet until hovered, because Deny
 * should be easy to find and hard to hit by accident.
 */

import type { ComponentProps } from "react";
import { Icon, type IconName } from "../icon/icon.js";
import "./button.css";

export type ButtonVariant = "default" | "primary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ComponentProps<"button">, "className"> {
  readonly variant?: ButtonVariant;
  /** 30, 34 or 40 pixels tall. */
  readonly size?: ButtonSize;
  readonly icon?: IconName;
  /** An icon and no words. Give it an `aria-label`. */
  readonly iconOnly?: boolean;
  readonly className?: string;
}

export function Button({
  variant = "default",
  size = "sm",
  icon,
  iconOnly = false,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={className === undefined ? "ui-button" : `ui-button ${className}`}
      data-variant={variant}
      data-size={size}
      data-icon-only={iconOnly ? "true" : undefined}
    >
      {icon !== undefined && <Icon name={icon} size={size === "lg" ? 16 : 14} />}
      {children}
    </button>
  );
}
