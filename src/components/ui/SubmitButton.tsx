'use client';
import { useFormStatus } from 'react-dom';
import { Button } from './Button';
import type { ComponentProps } from 'react';

export function SubmitButton(props: Omit<ComponentProps<typeof Button>, 'type' | 'loading'>) {
  const { pending } = useFormStatus();
  return <Button type="submit" loading={pending} {...props} />;
}
