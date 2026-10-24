interface ImageIconProps {
  icon: string;
  size?: number;
}

/** Decorative image artwork; the adjacent image name supplies its label. */
export default function ImageIcon({ icon, size = 32 }: ImageIconProps) {
  const value = icon.trim();
  const isSvg = value.startsWith("<svg");
  const isUrl = /^https?:\/\//i.test(value);
  const className = "inline-flex shrink-0 items-center justify-center bg-transparent text-gray-700 dark:text-gray-200 leading-none";
  const style = { width: size, height: size };

  if (isSvg) {
    return (
      <span
        aria-hidden="true"
        className={`${className} [&>svg]:block [&>svg]:h-full [&>svg]:w-full [&>svg]:max-h-full [&>svg]:max-w-full`}
        style={style}
        dangerouslySetInnerHTML={{ __html: value }}
      />
    );
  }

  if (isUrl) {
    return (
      <span aria-hidden="true" className={className} style={style}>
        {/* Image metadata may reference any external icon host. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="" width={size} height={size} className="block h-full w-full object-contain" />
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={className} style={{ ...style, fontSize: size * 0.75 }}>
      {value}
    </span>
  );
}
