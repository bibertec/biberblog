import EditorModeToggler, { type EditorModeTogglerProps } from './editor-mode-toggler/EditorModeToggler.client';
import { isEditorModeConfigured } from '@/src/system/lib/auth/session';

/**
 * Entry point of the editor in the root layout (`app/layout.tsx`): the edit button, and the editor
 * navbar in editor mode. Renders nothing if the editor is not configured (environment variables
 * missing), so a plain static site stays untouched. The props customize the edit button.
 */
export default function BiberblogEditor(props: EditorModeTogglerProps) {
  if (!isEditorModeConfigured()) return null;

  return (
    <aside>
      <EditorModeToggler {...props} />
    </aside>
  );
}
