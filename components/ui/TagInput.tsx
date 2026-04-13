'use client';
import { useState, useRef, KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function TagInput({
  value,
  onChange,
  placeholder = 'Add tag…',
  className,
  disabled = false,
}: TagInputProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInput('');
  };

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
      removeTag(value.length - 1);
    }
  };

  const handleBlur = () => {
    if (input.trim()) addTag(input);
  };

  return (
    <div
      className={clsx(
        'flex flex-wrap gap-1.5 min-h-[38px] w-full border border-border rounded-sm px-2 py-1.5 bg-white cursor-text',
        'focus-within:ring-2 focus-within:ring-blue-aria focus-within:border-transparent',
        disabled && 'opacity-50 cursor-not-allowed bg-slate-50',
        className
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((tag, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-pale text-blue-aria text-xs font-medium rounded border border-blue-aria/20"
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(i);
              }}
              className="hover:text-blue-aria/70 transition-colors"
              aria-label={`Remove tag ${tag}`}
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? placeholder : ''}
        disabled={disabled}
        className="flex-1 min-w-[120px] bg-transparent text-sm text-text placeholder:text-muted outline-none border-none"
      />
    </div>
  );
}
