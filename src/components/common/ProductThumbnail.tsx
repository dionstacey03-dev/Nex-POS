import React, { useState } from 'react';
import { Package } from 'lucide-react';

interface ProductThumbnailProps {
  src?: string;
  alt: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const ProductThumbnail: React.FC<ProductThumbnailProps> = ({
  src,
  alt,
  className = '',
  size = 'md',
}) => {
  const [failed, setFailed] = useState(false);

  const iconSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 text-slate-400 dark:text-slate-500 select-none ${className}`}
        aria-label={alt}
      >
        <Package className={iconSize} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover bg-slate-100 dark:bg-slate-800 ${className}`}
    />
  );
};
