"use client";

import {
  useEffect,
  useState,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";

type SafeProductImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "alt"
> & {
  src: string | null;
  alt: string;
  fallback: ReactNode;
};

export default function SafeProductImage({
  src,
  alt,
  fallback,
  onError,
  ...imageProps
}: SafeProductImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  if (!src || failed) return fallback;

  return (
    <img
      {...imageProps}
      src={src}
      alt={alt}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
