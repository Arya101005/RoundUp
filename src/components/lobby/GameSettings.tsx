import { useRef } from 'react';
import type { GameId } from '@shared/games/types';
import { Switch } from '@/components/common/Switch';
import { gameSettings, type SettingField } from '@/config/gameSettings';

export interface GameSettingsProps {
  gameId: GameId;
  values: Record<string, unknown>;
  readOnly: boolean;
  onChange: (next: Record<string, unknown>) => void;
}

function NumberField({
  field,
  value,
  readOnly,
  onChange,
}: {
  field: Extract<SettingField, { type: 'number' }>;
  value: unknown;
  readOnly: boolean;
  onChange: (v: number) => void;
}) {
  const current = typeof value === 'number' ? value : field.min;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{field.label}</span>
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        value={current}
        disabled={readOnly}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (Number.isFinite(parsed)) {
            onChange(Math.min(field.max, Math.max(field.min, Math.round(parsed))));
          }
        }}
        className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink tabular focus:border-accent focus:outline-none disabled:opacity-60"
      />
      <span className="text-2xs text-muted">
        {field.min} to {field.max}
      </span>
    </label>
  );
}

function SelectField({
  field,
  value,
  readOnly,
  onChange,
}: {
  field: Extract<SettingField, { type: 'select' }>;
  value: unknown;
  readOnly: boolean;
  onChange: (v: string) => void;
}) {
  const current = typeof value === 'string' ? value : (field.options[0]?.value ?? '');
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{field.label}</span>
      <select
        value={current}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-md border border-line bg-surface px-2 text-sm text-ink focus:border-accent focus:outline-none disabled:opacity-60"
      >
        {field.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function GameSettings({ gameId, values, readOnly, onChange }: GameSettingsProps) {
  const fields = gameSettings[gameId];
  const valuesRef = useRef(values);
  valuesRef.current = values;

  function set(key: string, v: unknown) {
    onChange({ ...valuesRef.current, [key]: v });
  }

  if (fields.length === 0) {
    return <p className="text-sm text-muted">This game has no extra settings.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        if (field.type === 'number') {
          return (
            <NumberField
              key={field.key}
              field={field}
              value={values[field.key]}
              readOnly={readOnly}
              onChange={(v) => set(field.key, v)}
            />
          );
        }
        if (field.type === 'select') {
          return (
            <SelectField
              key={field.key}
              field={field}
              value={values[field.key]}
              readOnly={readOnly}
              onChange={(v) => set(field.key, v)}
            />
          );
        }
        return (
          <div key={field.key} className="self-center sm:col-span-2">
            <Switch
              label={field.label}
              description={field.description}
              checked={values[field.key] !== false}
              disabled={readOnly}
              onCheckedChange={(checked) => set(field.key, checked)}
            />
          </div>
        );
      })}
    </div>
  );
}
