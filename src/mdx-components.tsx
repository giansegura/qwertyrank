import type { MDXComponents } from "mdx/types";

/** No custom components: guides get their styling from `Prose`. */
const components: MDXComponents = {};

/** Global MDX components, required by `@next/mdx` in the App Router (it takes no arguments). */
export function useMDXComponents(): MDXComponents {
  return components;
}
