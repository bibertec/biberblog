import type { EditorTranslations } from '../../system/config/editorTranslations.ts';

/**
 * All texts the customer sees in the editor UI. Adjust freely per project (e.g. for a
 * German-speaking customer); TypeScript reports missing or misspelled keys.
 *
 * Relative import with `.ts` extension on purpose: Plop loads this file via plain Node.
 */
export const translations = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    apply: 'Apply',
    gotIt: 'Got it',
    pleaseWait: 'Please wait…',
    saveFailed: 'Saving failed.',
    resetToOriginal: 'Reset to original',
    unsaved: 'Unsaved',
  },
  toggler: {
    editWebsite: 'Edit website',
  },
  login: {
    title: 'Password',
    submit: 'Login',
    wrongPassword: 'Wrong password.',
    failed: 'Login failed.',
    unavailable: 'Login failed. Please try again later.',
  },
  navbar: {
    publish: 'Publish',
    publishing: 'Publishing…',
    exitEditor: 'Exit',
    logout: 'Logout',
    seo: 'SEO',
    moreOptions: 'Weitere Optionen',
    pages: 'Pages',
    publishFailedTitle: 'Publishing failed',
    publishFailed: 'Publishing failed.',
    leaveTitle: 'Leave editor?',
    leaveText: 'Changes you made will not be saved.',
    leave: 'Leave',
  },
  publishStatus: {
    deployingTitle: 'Publishing',
    deployingText: 'Your new content is being published. This can take up to 60 seconds.',
    liveTitle: 'Published',
    liveText: 'Your new content is now live!',
    viewPage: 'View page',
    timeoutTitle: 'Publishing is taking unusually long',
    timeoutText:
      'Your changes have been saved but are not online yet. Please reload the page in a few minutes. If the changes are still not visible then, contact your developer.',
    untrackedTitle: 'Committed',
    untrackedText:
      'The changes have been committed to GitHub. There is no deployment to wait for in this environment. Locally, the changes only become visible after a "git pull".',
  },
  seo: {
    dialogTitle: 'SEO',
    help: 'Title and description of each page appear in search results and in the browser tab.',
    title: 'Title',
    description: 'Description',
    characterCount: (count, recommended) => `${count} / ${recommended}`,
    loading: 'Loading pages…',
    loadFailed: 'Pages could not be loaded.',
  },
  text: {
    dialogTitle: 'Edit text',
  },
  richtext: {
    dialogTitle: 'Edit text',
    externalLink: 'External link',
    internalLink: 'Internal link',
    applyLink: 'Apply',
  },
  collection: {
    dialogTitle: 'Edit list',
    itemFallbackTitle: (position) => `Item ${position}`,
    moveUp: 'Move up',
    moveDown: 'Move down',
    removeItem: 'Remove item',
    confirmRemoveItem: 'Really delete?',
    keepItem: 'No, keep it',
    addItem: 'Add item',
  },
  image: {
    dialogTitle: 'Edit image',
    change: 'Change image',
    chooseFile: 'Choose a different image',
    allowedFormats: (maxMegabytes) => `Allowed: JPEG, PNG, WEBP · max. ${maxMegabytes} MB`,
    loading: 'Loading image…',
    loadFailed: 'Image could not be loaded.',
    cropPreview: 'Preview of the image crop',
    zoom: 'Zoom',
    panHorizontal: 'Move horizontally',
    panVertical: 'Move vertically',
    rotate: 'Rotate 90°',
    resetCrop: 'Reset crop',
    altText: 'Alt text',
    altTextHelp: 'Briefly describe what the image shows.',
    previewLoading: 'Loading preview…',
    previewFailed: 'Preview failed',
    invalidType: 'Only JPEG, PNG and WEBP images are allowed.',
    tooLarge: (maxMegabytes) => `The image must not be larger than ${maxMegabytes} MB.`,
    altTextRequired: 'Please enter an alt text.',
    notReady: 'Please wait until the image has loaded.',
    existingImageLoadFailed: 'The existing image could not be loaded.',
  },
  errors: {
    notAuthenticated: 'Not logged in.',
    noChanges: 'There are no changes.',
    publishFailed: (detail) => `Publishing failed. Technical details: ${detail}`,
    uploadFailed: 'Upload failed.',
    previewFailed: 'Preview could not be loaded.',
    discardFailed: 'Changes could not be discarded.',
    tempImageNotFound: 'Temporary image not found.',
    tempImageMismatch: 'The temporary image does not match the original upload.',
    cropFormatMismatch: 'The image crop does not match the required format.',
    cropFailed: (detail) => `The selected image crop could not be processed: ${detail}`,
  },
  placeholders: {
    text: 'You can edit this text',
    imageAlt: 'You can replace this image',
  },
} satisfies EditorTranslations;
