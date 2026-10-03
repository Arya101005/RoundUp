import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  description?: string;
}

export interface SelectProps {
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
  id?: string;
  className?: string;
}

export function Select({
  label,
  value,
  onValueChange,
  options,
  placeholder = 'Select...',
  disabled,
  hint,
  id,
  className,
}: SelectProps) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && (
        <label id={`${id ?? 'select'}-label`} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectPrimitive.Trigger
          id={id}
          aria-labelledby={label ? `${id ?? 'select'}-label` : undefined}
          className={clsx(
            'flex h-11 w-full items-center justify-between rounded-md border border-line bg-surface px-3',
            'text-base text-ink transition hover:border-accent/60 focus:border-accent focus:outline-none',
            'disabled:opacity-60 data-[placeholder]:text-muted/70',
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon>
            <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={6}
            className="z-50 max-h-72 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-elevated shadow-[var(--shadow-float)]"
          >
            <SelectPrimitive.Viewport className="p-1">
              {options.map((opt) => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-ink outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-surface"
                >
                  <span className="flex flex-col">
                    <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                    {opt.description && (
                      <span className="text-xs text-muted">{opt.description}</span>
                    )}
                  </span>
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4 text-accent" aria-hidden />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
