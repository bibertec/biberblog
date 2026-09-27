'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useEditorMode, parseDraftKey } from '@/src/system/store/editor-mode';
import { BookOpen, LogOut, SearchCheck, UploadCloud, X } from 'lucide-react';
import { logoutEditor } from '@/src/system/lib/auth/actions';
import { discardTempImage } from '@/src/system/lib/images/actions';
import { tempImageDraftSchema } from '@/src/system/content/imageSchema';
import { pageLinks } from '@/src/system/content/pageLinks';
import { publishContent } from '@/src/system/lib/publish/actions';
import { Dialog } from '../dialog/Dialog.client';
import { EditorNavbarMenu } from './EditorNavbarMenu.client';
import { PublishStatusDialog } from './PublishStatusDialog.client';
import { SeoDialog } from './SeoDialog.client';
import { translations } from '@/src/project/config/translations';

/** Temp uploads referenced by the drafts: image fields and image item fields of collections. */
function tempImagePathnamesIn(drafts: Record<string, unknown>): string[] {
  const pathnames: string[] = [];
  function collect(value: unknown) {
    const draft = tempImageDraftSchema.safeParse(value);
    if (draft.success) pathnames.push(draft.data.temp.pathname);
  }
  for (const value of Object.values(drafts)) {
    collect(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') Object.values(item).forEach(collect);
      }
    }
  }
  return pathnames;
}

export function EditorNavbar() {
  const exitEditorMode = useEditorMode((state) => state.exitEditMode);
  const drafts = useEditorMode((state) => state.drafts);
  const clearDrafts = useEditorMode((state) => state.clearDrafts);
  const hasChanges = Object.keys(drafts).length > 0;
  const pathname = usePathname();
  // Draft keys start with the page pathname (`/about::hero1.title`) – SEO drafts included.
  const dirtyPathnames = new Set(Object.keys(drafts).map((key) => parseDraftKey(key).pathname));
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isSeoOpen, setIsSeoOpen] = useState(false);
  // Set while the "discard changes?" confirmation is open: which action runs after confirming.
  const [pendingLeave, setPendingLeave] = useState<'exit' | 'logout' | null>(null);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [publishedCommit, setPublishedCommit] = useState<{
    commitSha: string;
    trackDeployment: boolean;
  } | null>(null);
  const navbarRef = useRef<HTMLDivElement>(null);

  // Reserve space at the bottom of the page while the navbar is mounted (= editor mode only), so the
  // fixed navbar never covers the last content of the page (e.g. editable footer fields). The height is
  // measured instead of hard-coded, so it stays correct when the navbar changes size.
  useEffect(() => {
    const navbar = navbarRef.current;
    if (!navbar) return;

    const body = document.body;
    const previousInlinePadding = body.style.paddingBottom;
    // Respect a bottom padding the site itself may set on <body>.
    const basePadding = parseFloat(getComputedStyle(body).paddingBottom) || 0;

    const observer = new ResizeObserver(() => {
      const bottomOffset = parseFloat(getComputedStyle(navbar).bottom) || 0;
      // Navbar height plus the same gap above it as below it.
      body.style.paddingBottom = `${basePadding + navbar.offsetHeight + 2 * bottomOffset}px`;
    });
    observer.observe(navbar);

    return () => {
      observer.disconnect();
      body.style.paddingBottom = previousInlinePadding;
    };
  }, []);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasChanges) return;
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  async function handleLogout() {
    if (hasChanges) {
      setPendingLeave('logout');
      return;
    }
    await logoutEditor();
    exitEditorMode();
  }

  function handleExit() {
    if (hasChanges) {
      setPendingLeave('exit');
      return;
    }
    exitEditorMode();
  }

  // Leaving the editor discards the drafts – otherwise they would reappear on the next "Edit".
  async function handleDiscardAndLeave() {
    setIsDiscarding(true);
    try {
      // Unpublished uploads are only referenced by the drafts, so delete them right away (best effort,
      // the ~24h cleanup catches the rest). Before the logout: deleting needs the session.
      await Promise.allSettled(tempImagePathnamesIn(drafts).map((pathname) => discardTempImage(pathname)));
      clearDrafts();
      if (pendingLeave === 'logout') await logoutEditor();
      exitEditorMode();
    } finally {
      setIsDiscarding(false);
      setPendingLeave(null);
    }
  }

  async function handlePublish() {
    setIsPublishing(true);
    setPublishError(null);
    try {
      const plainDrafts = JSON.parse(JSON.stringify(drafts)) as Record<string, unknown>;
      const result = await publishContent(plainDrafts);
      if (result.success) {
        clearDrafts();
        setPublishedCommit({
          commitSha: result.commitSha,
          trackDeployment: result.trackDeployment,
        });
      } else {
        setPublishError(result.error);
      }
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : translations.navbar.publishFailed);
    } finally {
      setIsPublishing(false);
    }
  }

  function handlePublishStatusClose() {
    setPublishedCommit(null);
    exitEditorMode();
  }

  const publishLabel = isPublishing ? translations.navbar.publishing : translations.navbar.publish;

  return (
    <div>
      {/* Pill padding and gap are reduced by exactly the button padding (px-3 py-2) that provides the
          hover area, so the navbar keeps its size. */}
      <div
        ref={navbarRef}
        className="fixed left-1/2 bottom-6.5 z-9999 flex w-max -translate-x-1/2 items-center gap-6.5 rounded-3xl border border-white/60 bg-white/40 px-3.25 py-1 text-sm text-slate-950 shadow-xl ring-1 ring-inset ring-white/40 backdrop-blur-xl backdrop-saturate-150"
      >
        <EditorNavbarMenu
          items={[
            {
              icon: SearchCheck,
              label: translations.navbar.seo,
              onClick: () => setIsSeoOpen(true),
              disabled: isPublishing,
            },
            { icon: LogOut, label: translations.navbar.logout, onClick: handleLogout },
          ]}
        />

        {/* Links on the page itself are not clickable in editor mode (they open the edit dialog), and
            typing a URL reloads the page and loses the drafts. This client-side navigation keeps them. */}
        <EditorNavbarMenu
          icon={BookOpen}
          label={translations.navbar.pages}
          showLabel
          disabled={isPublishing}
          items={pageLinks.map((page) => ({
            label: page.label,
            href: page.pathname,
            current: page.pathname === pathname,
            isDirty: dirtyPathnames.has(page.pathname),
          }))}
        />

        <button
          type="button"
          onClick={handlePublish}
          disabled={!hasChanges || isPublishing}
          title={publishLabel}
          aria-label={publishLabel}
          className="inline-flex flex-col items-center justify-center gap-0 rounded-xl px-3 py-2 text-center enabled:hover:bg-slate-950/5 disabled:opacity-50"
        >
          <UploadCloud />
          {publishLabel}
        </button>

        <button
          type="button"
          title={translations.navbar.exitEditor}
          aria-label={translations.navbar.exitEditor}
          onClick={handleExit}
          className="ml-auto inline-flex flex-col items-center justify-center gap-0 rounded-xl px-3 py-2 text-center enabled:hover:bg-slate-950/5"
        >
          <X />
        </button>
      </div>

      <Dialog
        open={publishError !== null}
        title={translations.navbar.publishFailedTitle}
        hideCancel
        confirmLabel={translations.common.gotIt}
        onConfirm={() => setPublishError(null)}
        onCancel={() => setPublishError(null)}
      >
        <p className="text-sm text-red-600">{publishError}</p>
      </Dialog>

      <Dialog
        open={pendingLeave !== null}
        title={translations.navbar.leaveTitle}
        confirmLabel={translations.navbar.leave}
        isConfirming={isDiscarding}
        dismissible={!isDiscarding}
        onConfirm={handleDiscardAndLeave}
        onCancel={() => setPendingLeave(null)}
      >
        <p className="text-sm">{translations.navbar.leaveText}</p>
      </Dialog>

      {isSeoOpen && <SeoDialog onClose={() => setIsSeoOpen(false)} />}

      {publishedCommit && (
        <PublishStatusDialog
          commitSha={publishedCommit.commitSha}
          trackDeployment={publishedCommit.trackDeployment}
          onClose={handlePublishStatusClose}
        />
      )}
    </div>
  );
}
