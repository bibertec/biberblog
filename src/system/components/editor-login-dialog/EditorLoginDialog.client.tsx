'use client';
import { useState } from 'react';
import { Dialog } from '../dialog/Dialog.client';
import { Input } from '@/src/system/components/forms/Input';
import { loginEditor } from '@/src/system/lib/auth/actions';
import { translations } from '@/src/project/config/translations';

type EditorLoginDialogProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function EditorLoginDialog({ open, onClose, onSuccess }: EditorLoginDialogProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleConfirm() {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await loginEditor(password);
      if (result.success) {
        setPassword('');
        onSuccess();
      } else {
        setError(result.error ?? translations.login.failed);
      }
    } catch {
      setError(translations.login.unavailable);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    setPassword('');
    setError(null);
    onClose();
  }

  return (
    <Dialog
      open={open}
      title={translations.login.title}
      error={error}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
      confirmLabel={translations.login.submit}
      isConfirming={isSubmitting}
      confirmDisabled={password.length === 0}
    >
      <Input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoFocus
        disabled={isSubmitting}
      />
    </Dialog>
  );
}
