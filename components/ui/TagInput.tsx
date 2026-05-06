'use client';
import { useState, useRef, KeyboardEvent, useEffect } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface Suggestion {
  value: string;
  count: number;
}

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  // Optional: Predictive suggestions
  suggestions?: Suggestion[];
  onFetchSuggestions?: (query: string) => void;
  showSuggestions?: boolean;
}

export function TagInput({
  value,
  onChange,
  placeholder = 'Add tag…',
  className,
  disabled = false,
  suggestions = [],
  onFetchSuggestions,
  showSuggestions = true,
}: TagInputProps) {
  const [input, setInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced fetch suggestions
  useEffect(() => {
    if (!onFetchSuggestions || !showSuggestions) return;

    const timer = setTimeout(() => {
      if (input.trim().length >= 2) {
        onFetchSuggestions(input.trim());
        setShowDropdown(true);
        setSelectedIndex(-1);
      } else {
        setShowDropdown(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [input, onFetchSuggestions, showSuggestions]);

  // Filter suggestions that aren't already tags
  const filteredSuggestions = suggestions.filter(
    (s) => !value.includes(s.value),
  );

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInput('');
    setShowDropdown(false);
    setSelectedIndex(-1);
  };

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const selectSuggestion = (suggestion: string) => {
    addTag(suggestion);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Navigate suggestions with arrow keys
    if (showDropdown && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev,
        );
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        return;
      } else if (e.key === 'Tab' && selectedIndex >= 0) {
        e.preventDefault();
        selectSuggestion(filteredSuggestions[selectedIndex].value);
        return;
      } else if (e.key === 'Escape') {
        setShowDropdown(false);
        setSelectedIndex(-1);
        return;
      }
    }

    // Original behavior
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (showDropdown && selectedIndex >= 0) {
        selectSuggestion(filteredSuggestions[selectedIndex].value);
      } else {
        addTag(input);
      }
    } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
      removeTag(value.length - 1);
    } else if (e.key === 'Tab' && showDropdown && selectedIndex >= 0) {
      e.preventDefault();
      selectSuggestion(filteredSuggestions[selectedIndex].value);
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Don't blur if clicking on dropdown
    if (
      dropdownRef.current &&
      e.relatedTarget &&
      dropdownRef.current.contains(e.relatedTarget as Node)
    ) {
      return;
    }
    if (input.trim()) addTag(input);
    setTimeout(() => setShowDropdown(false), 200);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (e.target.value.length < 2) {
      setShowDropdown(false);
    }
  };

  return (
    <div className="relative">
      <div
        className={clsx(
          'flex flex-wrap gap-1.5 min-h-[38px] w-full border border-border rounded-sm px-2 py-1.5 bg-white cursor-text',
          'focus-within:ring-2 focus-within:ring-blue-aria focus-within:border-transparent',
          disabled && 'opacity-50 cursor-not-allowed bg-slate-50',
          className,
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
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={() => {
            if (input.length >= 2 && filteredSuggestions.length > 0) {
              setShowDropdown(true);
            }
          }}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={disabled}
          className="flex-1 min-w-[120px] bg-transparent text-sm text-text placeholder:text-muted outline-none border-none"
        />
      </div>

      {/* Suggestions Dropdown */}
      {showDropdown && filteredSuggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-white border border-border rounded-sm shadow-lg max-h-60 overflow-y-auto"
        >
          {filteredSuggestions.map((suggestion, idx) => (
            <button
              key={idx}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(suggestion.value);
              }}
              className={clsx(
                'w-full text-left px-3 py-2 text-sm hover:bg-blue-pale transition-colors flex items-center justify-between',
                idx === selectedIndex && 'bg-blue-pale',
              )}
            >
              <span className="text-text">{suggestion.value}</span>
              <span className="text-xs text-muted">
                {suggestion.count > 1 && `${suggestion.count}×`}
              </span>
            </button>
          ))}
          <div className="px-3 py-1.5 text-[10px] text-muted border-t border-border bg-slate-50">
            ↑↓ navigate • Tab/Enter select • Esc close
          </div>
        </div>
      )}
    </div>
  );
}
