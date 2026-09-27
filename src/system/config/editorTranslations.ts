/**
 * Shape of all texts the customer sees in the editor UI (including server errors shown in
 * dialogs and the placeholder content Plop writes for new fields).
 *
 * The actual texts live in `src/project/config/translations.ts` (project-specific). Developer-facing
 * messages (logs, internal errors, Plop prompts) are not part of this and stay in English in the code.
 *
 * Kept free of runtime imports so that Plop (plain Node with type stripping) can load the
 * translations file as well.
 */
export type EditorTranslations = {
  common: {
    save: string;
    cancel: string;
    apply: string;
    gotIt: string;
    pleaseWait: string;
    saveFailed: string;
    resetToOriginal: string;
    unsaved: string;
  };
  toggler: {
    editWebsite: string;
  };
  login: {
    title: string;
    submit: string;
    wrongPassword: string;
    failed: string;
    unavailable: string;
  };
  navbar: {
    publish: string;
    publishing: string;
    exitEditor: string;
    logout: string;
    seo: string;
    moreOptions: string;
    /** Navbar button + flyout for switching between pages without losing drafts. */
    pages: string;
    publishFailedTitle: string;
    publishFailed: string;
    /** Confirmation before "Exit"/"Log out" discards unpublished drafts. */
    leaveTitle: string;
    leaveText: string;
    leave: string;
  };
  publishStatus: {
    deployingTitle: string;
    deployingText: string;
    liveTitle: string;
    liveText: string;
    viewPage: string;
    timeoutTitle: string;
    timeoutText: string;
    untrackedTitle: string;
    untrackedText: string;
  };
  seo: {
    dialogTitle: string;
    help: string;
    title: string;
    description: string;
    /** Character counter below a field, e.g. `48 / 60`. */
    characterCount: (count: number, recommended: number) => string;
    loading: string;
    loadFailed: string;
  };
  text: {
    dialogTitle: string;
  };
  richtext: {
    dialogTitle: string;
    externalLink: string;
    internalLink: string;
    applyLink: string;
  };
  collection: {
    dialogTitle: string;
    itemFallbackTitle: (position: number) => string;
    moveUp: string;
    moveDown: string;
    removeItem: string;
    /** Shown next to the trash icon after the first click; the second click removes the item. */
    confirmRemoveItem: string;
    /** Replaces the item title while the removal is pending; cancels it. */
    keepItem: string;
    addItem: string;
  };
  image: {
    dialogTitle: string;
    /** Button of an image field inside a collection item. */
    change: string;
    chooseFile: string;
    allowedFormats: (maxMegabytes: number) => string;
    loading: string;
    loadFailed: string;
    cropPreview: string;
    zoom: string;
    panHorizontal: string;
    panVertical: string;
    rotate: string;
    resetCrop: string;
    altText: string;
    altTextHelp: string;
    previewLoading: string;
    previewFailed: string;
    invalidType: string;
    tooLarge: (maxMegabytes: number) => string;
    altTextRequired: string;
    notReady: string;
    existingImageLoadFailed: string;
  };
  errors: {
    notAuthenticated: string;
    noChanges: string;
    publishFailed: (detail: string) => string;
    uploadFailed: string;
    previewFailed: string;
    discardFailed: string;
    tempImageNotFound: string;
    tempImageMismatch: string;
    cropFormatMismatch: string;
    cropFailed: (detail: string) => string;
  };
  /** Placeholder content Plop writes into newly scaffolded fields. */
  placeholders: {
    text: string;
    imageAlt: string;
  };
};
