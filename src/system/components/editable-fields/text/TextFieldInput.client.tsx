'use client';
import { Textarea } from '@/src/system/components/forms/Textarea';

type TextFieldInputProps = {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
};

export default function TextFieldInput({ value, onChange, autoFocus }: TextFieldInputProps) {
  return (
    <Textarea
      className="min-h-30 resize-y"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoFocus={autoFocus}
    />
  );
}
