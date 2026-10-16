import type { ImageVariantRules } from '@/src/system/content/imageFieldRules';

export type CollectionItem = { id: string } & Record<string, unknown>;

export type CollectionItemFieldType = 'EditableText' | 'EditableRichtext' | 'EditableImage';

export type ItemFieldDef =
  | { name: string; type: 'EditableText' | 'EditableRichtext' }
  | { name: string; type: 'EditableImage'; rules: ImageVariantRules };
