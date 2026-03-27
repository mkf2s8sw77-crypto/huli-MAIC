'use client';

import { cn } from '@/lib/utils';
import { withBasePath } from '@/lib/utils/base-path';
import { normalizeAgentAvatar } from '@/lib/utils/agent-avatar';

interface AvatarDisplayProps {
  readonly src: string;
  readonly alt?: string;
  readonly className?: string;
}

export function AvatarDisplay({ src, alt, className }: AvatarDisplayProps) {
  const isUrl = src.startsWith('http') || src.startsWith('data:') || src.startsWith('/');

  if (isUrl) {
    return (
      <img
        src={withBasePath(normalizeAgentAvatar(src))}
        alt={alt || ''}
        className={cn('w-full h-full object-cover', className)}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={alt || ''}
      className={cn('flex items-center justify-center w-full h-full select-none', className)}
    >
      {src}
    </span>
  );
}
