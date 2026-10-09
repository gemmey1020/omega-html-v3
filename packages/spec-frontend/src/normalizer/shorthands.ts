import type { RawProseBlock, RawSection } from "../validation/validate-raw.js";

export interface ExpandedProse {
  readonly raw: RawProseBlock;
  /** Raw authoring pointer, retained as context only, never canonical content. */
  readonly path: string;
}

/** Body always precedes authored content; array order is preserved. */
export function expandSectionBody(
  section: RawSection,
  path: string,
): readonly ExpandedProse[] {
  return [
    ...(section.body !== undefined
      ? [
          {
            raw: { kind: "prose" as const, text: section.body },
            path: `${path}/body`,
          },
        ]
      : []),
    ...(section.content ?? []).map((raw, index) => ({
      raw,
      path: `${path}/content/${index}/text`,
    })),
  ];
}
