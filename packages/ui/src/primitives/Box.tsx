import * as React from "react";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BoxElement = React.ElementType;

type BoxOwnProps<E extends BoxElement = "div"> = {
  /** The HTML element or React component to render. Defaults to `"div"`. */
  as?: E;
  className?: string;
  children?: React.ReactNode;
};

type BoxProps<E extends BoxElement = "div"> = BoxOwnProps<E> &
  Omit<React.ComponentPropsWithRef<E>, keyof BoxOwnProps<E>>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Polymorphic layout container.
 *
 * Renders as the element specified by the `as` prop (defaults to `<div>`).
 * Accepts all native props of the rendered element.  Use Tailwind utility
 * classes via `className` for padding, margin, and gap.
 *
 * @example
 * ```tsx
 * <Box as="section" className="p-6 bg-surface-card rounded-lg shadow-sm">
 *   content
 * </Box>
 * ```
 */
function BoxInner<E extends BoxElement = "div">(
  { as, className, children, ...rest }: BoxProps<E>,
  ref: React.ForwardedRef<Element>,
) {
  const Component = as || "div";
  return (
    <Component ref={ref} className={cn(className)} {...rest}>
      {children}
    </Component>
  );
}

export const Box = React.forwardRef(BoxInner) as <E extends BoxElement = "div">(
  props: BoxProps<E> & { ref?: React.ForwardedRef<Element> },
) => React.ReactElement | null;

export type { BoxProps, BoxElement };
