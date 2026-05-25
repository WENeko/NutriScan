import React, { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { normalizeNumeric, parseNumericInput } from "@/lib/numeric-input";

interface NumericInputProps {
  value: number | string;
  onChange: (numValue: number, rawValue: string) => void;
  className?: string;
  placeholder?: string;
  min?: number;
  step?: string;
  /** Round value to N decimals for display only (raw value is preserved in state). */
  displayDecimals?: number;
}

/**
 * A numeric input that:
 * - Accepts both . and , as decimal separators
 * - Auto-selects "0" on focus so user can type directly
 * - Uses type="text" with inputMode="decimal" for mobile numeric keyboard
 */
const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  className = "",
  placeholder,
  min,
  step,
}) => {
  const [rawValue, setRawValue] = useState<string>(String(value));
  const [focused, setFocused] = useState(false);

  const displayValue = focused ? rawValue : String(value);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      // Allow digits, dots, commas, minus
      if (raw !== "" && !/^-?[\d.,]*$/.test(raw)) return;
      setRawValue(raw);
      const num = parseNumericInput(raw);
      onChange(num, raw);
    },
    [onChange]
  );

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(true);
      setRawValue(String(value));
      // Auto-select zero values
      if (Number(value) === 0) {
        setTimeout(() => e.target.select(), 0);
      }
    },
    [value]
  );

  const handleBlur = useCallback(() => {
    setFocused(false);
  }, []);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
      placeholder={placeholder}
      min={min}
      step={step}
    />
  );
};

export default NumericInput;
