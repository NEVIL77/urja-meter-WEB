import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Radix reserves the empty string for "no selection", so "all" stands in for it.
const ALL = '__all__';

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  /** Label of the choice that clears the filter. Leave out for a select that always has a value. */
  allLabel?: string;
  label: string;
  size?: 'sm' | 'default';
}

export function OptionSelect({ value, onChange, options, allLabel, label, size }: Props) {
  return (
    <Select value={value === '' && allLabel ? ALL : value} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
      <SelectTrigger size={size} aria-label={label} className="bg-background">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
