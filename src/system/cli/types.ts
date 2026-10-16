export type ItemFieldAnswer = {
  fieldName: string;
  contentType: string;
  /** Only for `EditableImage` item fields. */
  imageWidth?: number;
  imageHeight?: number;
};

export type ModuleFieldAnswer = {
  fieldName: string;
  contentType: string;
  itemFields?: ItemFieldAnswer[];
  titleField?: string;
  imageWidth?: number;
  imageHeight?: number;
  /** Optional mobile variant of an `EditableImage` field (both or none). */
  imageMobileWidth?: number;
  imageMobileHeight?: number;
};
