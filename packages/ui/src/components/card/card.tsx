/**
 * A card: a surface with a line around it and twelve-pixel corners. Cards with a warm border
 * are decisions (blueprint, Shapes), which is the `ask` tone; a resolved decision keeps its
 * shape and cools to green or red.
 */

import { type ComponentProps, createElement, type ReactNode } from "react";
import "./card.css";

export type CardTone = "default" | "ask" | "approved" | "denied";
export type CardPadding = "none" | "sm" | "md" | "lg";

export interface CardProps extends Omit<ComponentProps<"section">, "className" | "children"> {
  readonly as?: "div" | "section" | "article";
  readonly tone?: CardTone;
  readonly padding?: CardPadding;
  /** Lifts the card off the page with the first shadow. */
  readonly elevated?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}

export function Card({
  as = "div",
  tone = "default",
  padding = "md",
  elevated = false,
  className,
  children,
  ...rest
}: CardProps) {
  return createElement(
    as,
    {
      ...rest,
      className: className === undefined ? "ui-card" : `ui-card ${className}`,
      "data-tone": tone,
      "data-padding": padding,
      "data-elevated": elevated ? "true" : undefined,
    },
    children,
  );
}
