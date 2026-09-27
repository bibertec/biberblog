'use client';

import { useEffect, useId, useState, type ChangeEvent } from 'react';
import { Dialog } from '../dialog/Dialog.client';
import { Input } from '@/src/system/components/forms/Input';
import { Textarea } from '@/src/system/components/forms/Textarea';
import { useEditorMode, draftKey } from '@/src/system/store/editor-mode';
import { SEO_FIELD_ID, SEO_RECOMMENDED_LENGTH, seoSchema, type PageSeo } from '@/src/system/content/seo';
import { loadSeoPages, type SeoPage } from '@/src/system/lib/seo/actions';
import { translations } from '@/src/project/config/translations';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; pages: SeoPage[] };

type SeoDialogProps = {
  onClose: () => void;
};

/**
 * SEO title and description of all pages. Mounted only while open: loads the published values on
 * mount and starts from the open drafts; "Apply" writes one draft per changed page.
 */
export function SeoDialog({ onClose }: SeoDialogProps) {
  const drafts = useEditorMode((state) => state.drafts);
  const setDraft = useEditorMode((state) => state.setDraft);
  const revertDraft = useEditorMode((state) => state.revertDraft);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [values, setValues] = useState<Record<string, PageSeo>>({});

  useEffect(() => {
    let cancelled = false;
    loadSeoPages()
      .then((result) => {
        if (cancelled) return;
        if (!result.success) {
          setLoadState({ status: 'error', error: result.error });
          return;
        }
        const currentDrafts = useEditorMode.getState().drafts;
        setValues(
          Object.fromEntries(
            result.pages.map((page) => {
              const draft = seoSchema.safeParse(currentDrafts[draftKey(page.pathname, SEO_FIELD_ID)]);
              return [page.pathname, draft.success ? draft.data : page.seo];
            }),
          ),
        );
        setLoadState({ status: 'ready', pages: result.pages });
      })
      .catch(() => {
        if (!cancelled) setLoadState({ status: 'error', error: translations.seo.loadFailed });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleConfirm() {
    if (loadState.status !== 'ready') return;
    for (const page of loadState.pages) {
      const key = draftKey(page.pathname, SEO_FIELD_ID);
      const value = values[page.pathname];
      const next: PageSeo = { title: value.title.trim(), description: value.description.trim() };
      // Invariant of the store: a draft always means an actual deviation from the published value.
      if (next.title === page.seo.title && next.description === page.seo.description) {
        if (key in drafts) revertDraft(key);
      } else {
        setDraft(key, next);
      }
    }
    onClose();
  }

  function updateValue(pathname: string, field: keyof PageSeo, value: string) {
    setValues((previous) => ({ ...previous, [pathname]: { ...previous[pathname], [field]: value } }));
  }

  return (
    <Dialog
      open
      title={translations.seo.dialogTitle}
      confirmLabel={translations.common.apply}
      confirmDisabled={loadState.status !== 'ready'}
      error={loadState.status === 'error' ? loadState.error : null}
      onConfirm={handleConfirm}
      onCancel={onClose}
    >
      {loadState.status === 'loading' && <p className="text-sm text-gray-500">{translations.seo.loading}</p>}
      {loadState.status === 'ready' && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-gray-500">{translations.seo.help}</p>
          {loadState.pages.map((page) => (
            <fieldset key={page.pathname} className="flex flex-col gap-2 rounded border p-3">
              <legend className="flex items-center gap-2 px-1 text-sm font-medium">
                {page.label}
                <span className="font-normal text-gray-500">{page.pathname}</span>
                {draftKey(page.pathname, SEO_FIELD_ID) in drafts && (
                  <span className="rounded bg-black/70 px-1.5 py-0.5 text-xs font-normal text-white">
                    {translations.common.unsaved}
                  </span>
                )}
              </legend>
              <SeoTextField
                label={translations.seo.title}
                value={values[page.pathname].title}
                recommendedLength={SEO_RECOMMENDED_LENGTH.title}
                onChange={(value) => updateValue(page.pathname, 'title', value)}
              />
              <SeoTextField
                label={translations.seo.description}
                value={values[page.pathname].description}
                recommendedLength={SEO_RECOMMENDED_LENGTH.description}
                multiline
                onChange={(value) => updateValue(page.pathname, 'description', value)}
              />
            </fieldset>
          ))}
        </div>
      )}
    </Dialog>
  );
}

type SeoTextFieldProps = {
  label: string;
  value: string;
  recommendedLength: number;
  multiline?: boolean;
  onChange: (value: string) => void;
};

function SeoTextField({ label, value, recommendedLength, multiline = false, onChange }: SeoTextFieldProps) {
  const counterId = useId();
  const length = value.trim().length;
  const fieldProps = {
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    'aria-describedby': counterId,
  };

  return (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      {multiline ? <Textarea rows={3} {...fieldProps} /> : <Input type="text" {...fieldProps} />}
      <span
        id={counterId}
        className={`self-end text-xs ${length > recommendedLength ? 'text-amber-700' : 'text-gray-500'}`}
      >
        {translations.seo.characterCount(length, recommendedLength)}
      </span>
    </label>
  );
}
