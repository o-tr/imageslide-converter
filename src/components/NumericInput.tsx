import { useState } from "react";
import { Input } from "./ui/input";

export const NumericInput: React.FC<{
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  type: "integer" | "float";
}> = ({ value, onChange, min = 1, max = 100, step = 1, type }) => {
  const [inputValue, setInputValue] = useState(value.toString());

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    const parsedValue =
      type === "integer"
        ? Number.parseInt(newValue, 10)
        : Number.parseFloat(newValue);
    if (
      !Number.isNaN(parsedValue) &&
      parsedValue >= (min || 0) &&
      parsedValue <= (max || Number.POSITIVE_INFINITY)
    ) {
      onChange(parsedValue);
    }
  };

  return (
    <Input
      type="number"
      value={inputValue}
      onChange={handleChange}
      min={min}
      max={max}
      step={step}
      pattern={type === "integer" ? "\\d*" : "\\d*\\.?\\d*"}
      className="invalid:border-red-500"
    />
  );
};
