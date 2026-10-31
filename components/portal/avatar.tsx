import type { PublicMember } from "@/convex/lib/viewer";

// Warm backgrounds for initials, picked by name so each person keeps their color.
const COLORS = ["#f66e5e", "#ab90b3", "#bf5548", "#644f6b", "#e7a46a", "#7d9a87", "#9c443a"];

function colorFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function Avatar({
  member,
  size = 32,
  online,
  className = "",
}: {
  member: Pick<PublicMember, "name" | "image"> | null;
  size?: number;
  online?: boolean;
  className?: string;
}) {
  const name = member?.name ?? "Someone";
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {member?.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote avatars from Google, any host
        <img
          src={member.image}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          className="size-full rounded-full object-cover outline -outline-offset-1 outline-black/10"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-full items-center justify-center rounded-full font-display font-medium text-cream select-none"
          style={{ background: colorFor(name), fontSize: Math.round(size * 0.4) }}
        >
          {initials(name)}
        </span>
      )}
      {online && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-current bg-[#5bbf7a]"
          style={{ width: Math.max(9, size * 0.32), height: Math.max(9, size * 0.32) }}
        />
      )}
    </span>
  );
}
