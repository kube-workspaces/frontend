"use client";

import { useState } from "react";

interface UserAvatarProps {
  avatarURL?: string;
  displayName?: string;
  email?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "w-7 h-7 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-xl",
};

export function UserAvatar({ avatarURL, displayName, email, size = "sm", className = "" }: UserAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const initials = displayName
    ? displayName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : email?.[0]?.toUpperCase() || "?";

  const sizeClass = sizeClasses[size];

  if (avatarURL && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarURL}
        alt={displayName || email || "User avatar"}
        className={`${sizeClass} rounded-full object-cover ${className}`}
        onError={() => setImgFailed(true)}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full bg-[var(--color-primary)] flex items-center justify-center text-[var(--color-primary-foreground)] font-medium ${className}`}>
      {initials}
    </div>
  );
}
