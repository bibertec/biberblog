'use client';

import { useState, type KeyboardEvent } from 'react';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import { Bold as BoldIcon, List, ListOrdered, Link2, Link2Off } from 'lucide-react';
import { richtextExtensions } from './richtextExtensions';
import { Input } from '@/src/system/components/forms/Input';
import { Select } from '@/src/system/components/forms/Select';
import { fieldWithinClassName } from '@/src/system/components/forms/fieldStyles';
import { pageLinks } from '@/src/system/content/pageLinks';
import type { RichtextDoc } from '@/src/system/content/richtextSchema';
import { translations } from '@/src/project/config/translations';

type LinkPanelState = {
  isExternal: boolean;
  href: string;
};

export type RichtextFieldInputProps = {
  value: RichtextDoc;
  onChange: (doc: RichtextDoc) => void;
};

export default function RichtextFieldInput({ value, onChange }: RichtextFieldInputProps) {
  const [linkPanel, setLinkPanel] = useState<LinkPanelState | null>(null);
  const editor = useEditor({
    immediatelyRender: true,
    extensions: richtextExtensions,
    content: value,
    editorProps: { attributes: { class: 'outline-hidden' } },
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON() as RichtextDoc);
    },
  });

  // Toolbar state at the cursor/selection. `useEditor` no longer re-renders on selection changes
  // (Tiptap v3), so the state is subscribed here – re-renders only when one of these values changes.
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      link: editor.isActive('link'),
    }),
  });

  function openLinkPanel() {
    const attrs = editor.getAttributes('link') as {
      href?: string;
      isExternal?: boolean;
    };
    setLinkPanel({
      isExternal: attrs.href ? Boolean(attrs.isExternal) : true,
      href: attrs.href ?? pageLinks[0]?.pathname ?? '',
    });
  }

  function applyLink() {
    if (!editor || !linkPanel || !linkPanel.href) return;
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setRichtextLink({ href: linkPanel.href, isExternal: linkPanel.isExternal })
      .run();
    setLinkPanel(null);
  }

  function removeLink() {
    editor?.chain().focus().unsetRichtextLink().run();
    setLinkPanel(null);
  }

  function preventFormSubmit(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyLink();
    }
  }

  if (!editor) {
    return null;
  }

  return (
    // Toolbar, link panel and text area form one field: shared background, no gaps, separated only
    // by a hairline. `px-2.5` + the buttons' `p-1.5` = 16px, so the icons line up with the text (`px-4`).
    <div className="flex flex-col">
      <div className="flex gap-1 border-b border-border bg-background px-2.5 py-1">
        <button
          type="button"
          aria-pressed={active.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className="p-1.5 rounded aria-pressed:bg-black aria-pressed:text-white"
        >
          <BoldIcon size={16} />
        </button>
        <button
          type="button"
          aria-pressed={active.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className="p-1.5 rounded aria-pressed:bg-black aria-pressed:text-white"
        >
          <List size={16} />
        </button>
        <button
          type="button"
          aria-pressed={active.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className="p-1.5 rounded aria-pressed:bg-black aria-pressed:text-white"
        >
          <ListOrdered size={16} />
        </button>
        <button
          type="button"
          aria-pressed={active.link}
          onClick={openLinkPanel}
          className="p-1.5 rounded aria-pressed:bg-black aria-pressed:text-white"
        >
          <Link2 size={16} />
        </button>
        {active.link && (
          <button type="button" onClick={removeLink} className="p-1.5 rounded">
            <Link2Off size={16} />
          </button>
        )}
      </div>

      {linkPanel && (
        <div className="flex flex-col gap-2 border-b border-border bg-background px-4 py-2 text-sm">
          <div className="flex gap-3">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={linkPanel.isExternal}
                onChange={() => setLinkPanel({ isExternal: true, href: '' })}
              />
              {translations.richtext.externalLink}
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={!linkPanel.isExternal}
                onChange={() =>
                  setLinkPanel({ isExternal: false, href: pageLinks[0]?.pathname ?? '' })
                }
              />
              {translations.richtext.internalLink}
            </label>
          </div>

          {linkPanel.isExternal ? (
            <Input
              type="url"
              placeholder="https://…"
              value={linkPanel.href}
              onChange={(e) => setLinkPanel({ ...linkPanel, href: e.target.value })}
              onKeyDown={preventFormSubmit}
              autoFocus
            />
          ) : (
            <Select
              value={linkPanel.href}
              onChange={(e) => setLinkPanel({ ...linkPanel, href: e.target.value })}
              onKeyDown={preventFormSubmit}
              autoFocus
            >
              {pageLinks.map((page) => (
                <option key={page.pathname} value={page.pathname}>
                  {page.label} ({page.pathname})
                </option>
              ))}
            </Select>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setLinkPanel(null)}
              className="px-2 py-1 rounded border text-sm"
            >
              {translations.common.cancel}
            </button>
            <button
              type="button"
              onClick={applyLink}
              disabled={!linkPanel.href}
              className="px-2 py-1 rounded bg-black text-white text-sm"
            >
              {translations.richtext.applyLink}
            </button>
          </div>
        </div>
      )}

      <EditorContent editor={editor} className={`richtext min-h-30 ${fieldWithinClassName}`} />
    </div>
  );
}
