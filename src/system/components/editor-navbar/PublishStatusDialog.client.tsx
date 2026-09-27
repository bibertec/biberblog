'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog } from '../dialog/Dialog.client';
import { translations } from '@/src/project/config/translations';

const DEPLOYMENT_ENDPOINT = '/api/editor/deployment';

const POLL_INTERVAL_MS = 3000;

const DEPLOYMENT_TIMEOUT_MS = 5 * 60 * 1000;

type Phase = 'deploying' | 'live' | 'timeout' | 'local';

type PublishStatusDialogProps = {
  commitSha: string;
  /** `false` e.g. in local development: there is no deployment to wait for there. */
  trackDeployment: boolean;
  /** Closes the dialog without reloading (after a timeout or locally) and ends the editor mode. */
  onClose: () => void;
};

async function fetchDeployedCommitSha(): Promise<string | null> {
  const response = await fetch(DEPLOYMENT_ENDPOINT, { cache: 'no-store' });
  if (!response.ok) return null;
  const data: unknown = await response.json();
  if (typeof data === 'object' && data !== null && 'commitSha' in data) {
    return typeof data.commitSha === 'string' ? data.commitSha : null;
  }

  return null;
}

export function PublishStatusDialog({ commitSha, trackDeployment, onClose }: PublishStatusDialogProps) {
  const [phase, setPhase] = useState<Phase>(trackDeployment ? 'deploying' : 'local');

  useEffect(() => {
    if (phase !== 'deploying') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    async function poll() {
      try {
        if ((await fetchDeployedCommitSha()) === commitSha) {
          if (!cancelled) setPhase('live');
          return;
        }
      } catch {
        // Network error: simply retry at the next interval.
      }
      if (cancelled) return;
      if (Date.now() - startedAt >= DEPLOYMENT_TIMEOUT_MS) {
        setPhase('timeout');
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    timer = setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phase, commitSha]);

  function reloadPage() {
    // Reloading shows the new content and ends the editor mode (the store starts empty).
    window.location.reload();
  }

  if (phase === 'deploying') {
    return (
      <Dialog
        open
        title={translations.publishStatus.deployingTitle}
        hideCancel
        hideConfirm
        dismissible={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      >
        <p>{translations.publishStatus.deployingText}</p>
        <div className="flex justify-center py-2" role="status" aria-label={translations.publishStatus.deployingTitle}>
          <Loader2 className="animate-spin" />
        </div>
      </Dialog>
    );
  }

  if (phase === 'live') {
    return (
      <Dialog
        open
        title={translations.publishStatus.liveTitle}
        hideCancel
        confirmLabel={translations.publishStatus.viewPage}
        onConfirm={reloadPage}
        onCancel={reloadPage}
      >
        <p>{translations.publishStatus.liveText}</p>
      </Dialog>
    );
  }

  if (phase === 'timeout') {
    return (
      <Dialog
        open
        title={translations.publishStatus.timeoutTitle}
        hideCancel
        confirmLabel={translations.common.gotIt}
        onConfirm={onClose}
        onCancel={onClose}
      >
        <p>{translations.publishStatus.timeoutText}</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      title={translations.publishStatus.untrackedTitle}
      hideCancel
      confirmLabel={translations.common.gotIt}
      onConfirm={onClose}
      onCancel={onClose}
    >
      <p>{translations.publishStatus.untrackedText}</p>
    </Dialog>
  );
}
