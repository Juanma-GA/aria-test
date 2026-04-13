'use client';
import { Modal } from './Modal';
import { Spinner } from './Spinner';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isLoading = false,
}: ConfirmModalProps) {
  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-muted mb-6">{message}</p>
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="btn-secondary"
        >
          {cancelLabel}
        </button>
        <button
          onClick={handleConfirm}
          disabled={isLoading}
          className="btn-danger flex items-center gap-2"
        >
          {isLoading && <Spinner size="sm" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
