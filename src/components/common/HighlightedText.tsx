import React from 'react';
import { TextRange } from '../../utils/fuzzySearch';

interface HighlightedTextProps {
  text: string;
  ranges?: TextRange[];
  className?: string;
  highlightClassName?: string;
}

export const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  ranges,
  className,
  highlightClassName = 'bg-blue-100 dark:bg-blue-500/30 text-blue-900 dark:text-blue-200 rounded-[3px] px-0.5 font-semibold',
}) => {
  if (!ranges || ranges.length === 0 || !text) {
    return className ? <span className={className}>{text}</span> : <>{text}</>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    const start = Math.max(cursor, Math.min(text.length, r.start));
    const end = Math.max(start, Math.min(text.length, r.end));

    if (start > cursor) {
      parts.push(<React.Fragment key={`t-${i}-${cursor}`}>{text.slice(cursor, start)}</React.Fragment>);
    }
    if (end > start) {
      parts.push(
        <mark key={`m-${i}-${start}`} className={highlightClassName}>
          {text.slice(start, end)}
        </mark>
      );
    }
    cursor = end;
  }

  if (cursor < text.length) {
    parts.push(<React.Fragment key={`t-end-${cursor}`}>{text.slice(cursor)}</React.Fragment>);
  }

  return className ? <span className={className}>{parts}</span> : <>{parts}</>;
};
