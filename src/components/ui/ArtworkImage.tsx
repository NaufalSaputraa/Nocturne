import React, { useEffect, useState } from 'react';
import { Disc3, ListMusic, Music, User } from 'lucide-react';

export interface ArtworkImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  kind?: 'track' | 'album' | 'artist' | 'playlist';
}

export const ArtworkImage: React.FC<ArtworkImageProps> = ({
  src,
  alt,
  className = '',
  kind = 'track',
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const trimmed = src?.trim() ?? '';
  if (!trimmed || failed) {
    const Icon =
      kind === 'artist'
        ? User
        : kind === 'playlist'
          ? ListMusic
          : kind === 'album'
            ? Disc3
            : Music;

    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center bg-[#27272A] text-[#A1A1AA] ${className}`}
      >
        <Icon className="w-1/2 h-1/2 max-w-6 max-h-6 opacity-80" />
      </div>
    );
  }

  return (
    <img
      src={trimmed}
      alt={alt}
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
