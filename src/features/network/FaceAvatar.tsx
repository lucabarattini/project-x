const palettes = [
  { background: "#DDF8B9", shirt: "#153D34", skin: "#8C4E2F", hair: "#1B1816" },
  { background: "#DDF4E7", shirt: "#176B4A", skin: "#E6AA79", hair: "#6A3D24" },
  { background: "#EEF8DF", shirt: "#0B2A1E", skin: "#6B3828", hair: "#231F20" },
  { background: "#CFEBDD", shirt: "#225B43", skin: "#F1C29D", hair: "#C87935" },
  { background: "#E7FBCF", shirt: "#39745A", skin: "#B96B46", hair: "#2E1E19" },
];

function hashName(name: string) {
  return [...name].reduce((total, character) => total + character.charCodeAt(0), 0);
}

type FaceAvatarProps = {
  name: string;
  className?: string;
  decorative?: boolean;
};

export function FaceAvatar({ name, className = "h-10 w-10", decorative = false }: FaceAvatarProps) {
  const hash = hashName(name);
  const palette = palettes[hash % palettes.length];
  const glasses = hash % 3 === 0;
  const smile = hash % 2 === 0;

  return (
    <span
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : `${name} illustrated avatar`}
      className={`inline-flex shrink-0 overflow-hidden rounded-full ring-2 ring-white ${className}`}
      role={decorative ? undefined : "img"}
    >
      <svg viewBox="0 0 48 48" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <rect width="48" height="48" rx="24" fill={palette.background} />
        <path d="M8 48c1-10 7-15 16-15s15 5 16 15H8Z" fill={palette.shirt} />
        <ellipse cx="24" cy="23" rx="10.5" ry="12" fill={palette.skin} />
        <path
          d={hash % 2 === 0 ? "M13 21c0-10 5-14 12-14 7 0 11 5 10 14-4-1-7-4-9-8-2 4-7 7-13 8Z" : "M13 21c0-9 4-14 11-14 8 0 12 6 11 15-4-5-9-8-17-7-1 3-3 5-5 6Z"}
          fill={palette.hair}
        />
        <circle cx="20" cy="23" r="1.1" fill="#171717" />
        <circle cx="28" cy="23" r="1.1" fill="#171717" />
        {glasses ? (
          <g fill="none" stroke="#172033" strokeWidth="1.2">
            <circle cx="19.5" cy="23" r="3.2" />
            <circle cx="28.5" cy="23" r="3.2" />
            <path d="M22.7 23h2.6" />
          </g>
        ) : null}
        <path
          d={smile ? "M20.5 28c1.8 2 5.2 2 7 0" : "M21 29c2-1 4-1 6 0"}
          fill="none"
          stroke="#7A3D32"
          strokeLinecap="round"
          strokeWidth="1.2"
        />
      </svg>
    </span>
  );
}
