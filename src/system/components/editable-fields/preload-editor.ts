let preloadStarted = false;

export function preloadEditableFields() {
  if (preloadStarted) return;
  preloadStarted = true;
  import('@/src/system/components/editable-fields/text/EditableText.editor.client');
  import('@/src/system/components/editable-fields/richtext/EditableRichtext.editor.client');
  import('@/src/system/components/editable-fields/collection/EditableCollection.editor.client');
  import('@/src/system/components/editable-fields/image/EditableImage.editor.client');
}
