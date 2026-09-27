'use client';
import { useState } from 'react';
import { Loader2, SquarePen } from 'lucide-react';
import { useEditorMode } from '@/src/system/store/editor-mode';
import { EditorNavbar } from '../editor-navbar/EditorNavbar.client';
import { preloadEditableFields } from '../editable-fields/preload-editor';
import { checkEditorSession } from '@/src/system/lib/auth/actions';
import { EditorLoginDialog } from '../editor-login-dialog/EditorLoginDialog.client';
import { translations } from '@/src/project/config/translations';

export type EditorModeTogglerProps = {
  className?: string;
  text?: string;
  icon?: React.ReactNode;
};

export default function EditorModeToggler({ className, text, icon }: EditorModeTogglerProps) {
  const isEditorMode = useEditorMode((state) => state.editMode);
  const enterEditorMode = useEditorMode((state) => state.enterEditMode);

  const [isChecking, setIsChecking] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  if (isEditorMode) {
    return <EditorNavbar />;
  }

  async function handleClick() {
    setIsChecking(true);
    let isAuthenticated = false;
    try {
      isAuthenticated = await checkEditorSession();
    } catch {
      // Network/server error: treat like "no session" – a repeated error during login is then shown
      // in the login dialog instead of the button getting stuck in the spinner.
    } finally {
      setIsChecking(false);
    }

    if (isAuthenticated) {
      enterEditorMode();
    } else {
      setShowLoginDialog(true);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        aria-label={translations.toggler.editWebsite}
        onClick={handleClick}
        onMouseEnter={preloadEditableFields}
        onFocus={preloadEditableFields}
        disabled={isChecking}
      >
        <div className="flex items-center gap-2">
          {isChecking ? (
            <Loader2 className="animate-spin" />
          ) : (
            <>
              {icon && <div>{icon}</div>}
              {!icon && !text && <SquarePen />}
            </>
          )}
          {text && !isChecking && <div>{text}</div>}
        </div>
      </button>

      <EditorLoginDialog
        open={showLoginDialog}
        onClose={() => setShowLoginDialog(false)}
        onSuccess={() => {
          setShowLoginDialog(false);
          enterEditorMode();
        }}
      />
    </div>
  );
}
