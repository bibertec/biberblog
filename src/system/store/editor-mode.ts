import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export function draftKey(pathname: string, fieldId: string): string {
  return `${pathname}::${fieldId}`;
}

interface EditorState {
  editMode: boolean;
  enterEditMode: () => void;
  exitEditMode: () => void;
  drafts: Record<string, unknown>;
  setDraft: (key: string, value: unknown) => void;
  revertDraft: (key: string) => void;
  clearDrafts: () => void;
}

export function parseDraftKey(key: string): { pathname: string; fieldId: string } {
  const separatorIndex = key.indexOf('::');
  if (separatorIndex === -1) {
    throw new Error(`Invalid draft key: "${key}"`);
  }
  return {
    pathname: key.slice(0, separatorIndex),
    fieldId: key.slice(separatorIndex + 2),
  };
}

export const useEditorMode = create<EditorState>()(
  devtools(
    (set) => ({
      editMode: false,
      enterEditMode: () => set({ editMode: true }, false, 'enterEditMode'),
      exitEditMode: () => set({ editMode: false }, false, 'exitEditMode'),
      drafts: {},
      setDraft: (key, value) =>
        set((state) => ({ drafts: { ...state.drafts, [key]: value } }), false, 'setDraft'),
      revertDraft: (key) =>
        set(
          (state) => {
            const drafts = { ...state.drafts };
            delete drafts[key];
            return { drafts };
          },
          false,
          'revertDraft'
        ),
      clearDrafts: () => set({ drafts: {} }, false, 'clearDrafts'),
    }),
    { name: 'editor-mode', enabled: process.env.NODE_ENV !== 'production' }
  )
);
