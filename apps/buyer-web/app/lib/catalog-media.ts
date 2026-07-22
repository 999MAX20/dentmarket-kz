export type CatalogMediaCandidate = {
  sourceUrl?: string | null;
  securePath?: string | null;
  metadata?: {
    exactProductPhoto?: boolean;
    sourceImageUrl?: string | null;
  } | null;
};

const rejectedProductAsset = (value: string | null | undefined) =>
  /(logo|favicon|icon|sprite|avatar|cart|basket|loading|pixel|captcha|phone[-_]?ico|placeholder|no[-_]?image|default[-_]?image|\/(?:themes?|templates?|assets\/icons?|images?\/icons?)\/)/i.test(
    value ?? "",
  );

export function safeCatalogMediaSource(
  media: CatalogMediaCandidate | undefined,
  apiUrl = process.env.NEXT_PUBLIC_API_URL ??
    "https://dentmarket-api.vercel.app/api",
) {
  if (!media || media.metadata?.exactProductPhoto !== true) return null;
  const provenance =
    media.metadata.sourceImageUrl ?? media.sourceUrl ?? media.securePath;
  if (!provenance || rejectedProductAsset(provenance)) return null;
  if (media.securePath?.startsWith("/catalog/")) return media.securePath;
  if (media.securePath) return `${apiUrl}${media.securePath}`;
  if (/^https?:\/\//i.test(media.sourceUrl ?? "")) return media.sourceUrl!;
  return null;
}

export { rejectedProductAsset };
