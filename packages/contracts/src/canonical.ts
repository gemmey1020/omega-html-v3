/** Public authoring, engine ABI, and text dialect versions are independent. */
export const RAW_SCHEMA_VERSION = "3.0" as const;
export const CANONICAL_CONTRACT_VERSION = "1.0" as const;
export const COMMONMARK_VERSION = "0.31.2" as const;

export type RawSchemaVersion = typeof RAW_SCHEMA_VERSION;
export type CanonicalContractVersion = typeof CANONICAL_CONTRACT_VERSION;

/** Plain DTOs: readonly at every level; runtime validation/freezing is separate. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Validated ASCII identity. Grammar validation belongs to the compiler. */
export type CanonicalId = string;
export type TextDirection = "rtl" | "ltr";
export type PresentationProfile = "prime" | "silver" | "gold" | "cyan";

export interface ArtifactPresentation {
  readonly profile: PresentationProfile;
}

export interface DocumentSemantics {
  readonly title: string;
  readonly language: string;
  readonly direction: TextDirection;
}

/**
 * P01 CommonMark subset: paragraphs, quotes, lists, code, thematic breaks;
 * inline text/emphasis/strong/links/code/breaks. Headings, HTML and images are
 * rejected by normalization, not converted to hierarchy or embedded media.
 * Text may be NFC-normalized; code values and link destinations/titles are
 * protected parser output: never apply NFC, bidi marks or whitespace cleanup.
 * Source delimiters/formatting and reference definitions stay outside this AST.
 */
export interface RichText {
  readonly dialect: "commonmark";
  readonly dialectVersion: typeof COMMONMARK_VERSION;
  readonly blocks: readonly RichTextBlock[];
}

export type RichTextInline =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "inline-code"; readonly value: string }
  | { readonly kind: "emphasis"; readonly children: readonly RichTextInline[] }
  | { readonly kind: "strong"; readonly children: readonly RichTextInline[] }
  | {
      readonly kind: "link";
      readonly destination: string;
      readonly title: string | null;
      readonly children: readonly RichTextInline[];
    }
  | { readonly kind: "soft-break" }
  | { readonly kind: "hard-break" };

export interface RichTextListItem {
  readonly blocks: readonly RichTextBlock[];
}

export type RichTextBlock =
  | { readonly kind: "paragraph"; readonly children: readonly RichTextInline[] }
  | { readonly kind: "blockquote"; readonly blocks: readonly RichTextBlock[] }
  | {
      readonly kind: "bullet-list";
      readonly tight: boolean;
      readonly items: readonly RichTextListItem[];
    }
  | {
      readonly kind: "ordered-list";
      readonly start: number;
      readonly tight: boolean;
      readonly items: readonly RichTextListItem[];
    }
  | {
      readonly kind: "code-block";
      readonly value: string;
      /** CommonMark info string, not an inferred language or renderer choice. */
      readonly info: string | null;
    }
  | { readonly kind: "thematic-break" };

export interface ProseBlock {
  readonly id: CanonicalId;
  readonly kind: "prose";
  readonly text: RichText;
}

/** Only the artifact/prose slice is defined here, not speculative content kinds. */
export type ContentBlock = ProseBlock;

export interface CanonicalSection {
  readonly id: CanonicalId;
  readonly title: string | null;
  readonly intent?: string;
  readonly content: readonly ContentBlock[];
  readonly sections: readonly CanonicalSection[];
}

export interface CanonicalContract {
  readonly contractVersion: CanonicalContractVersion;
  readonly kind: "artifact";
  readonly metadata: { readonly id: CanonicalId };
  readonly spec: {
    readonly target: "standalone-html";
    readonly presentation: ArtifactPresentation;
    readonly document: DocumentSemantics;
    readonly sections: readonly CanonicalSection[];
  };
}

/** Internal stage DTOs after text normalization and before the ID pass. */
export interface DraftProseBlock extends Omit<ProseBlock, "id"> {
  readonly id?: CanonicalId;
}

export interface DraftCanonicalSection
  extends Omit<CanonicalSection, "id" | "content" | "sections"> {
  readonly id?: CanonicalId;
  readonly content: readonly DraftProseBlock[];
  readonly sections: readonly DraftCanonicalSection[];
}

export interface DraftCanonicalContract
  extends Omit<CanonicalContract, "metadata" | "spec"> {
  readonly metadata: { readonly id?: CanonicalId };
  readonly spec: {
    readonly target: "standalone-html";
    readonly presentation: ArtifactPresentation;
    readonly document: DocumentSemantics;
    readonly sections: readonly DraftCanonicalSection[];
  };
}
