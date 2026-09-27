import { z } from 'zod';
import { isKnownPagePath } from './pageLinks';

function isSafeExternalHref(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const linkAttrsSchema = z
  .object({
    href: z.string().min(1),
    isExternal: z.boolean(),
  })
  .refine((attrs) => (attrs.isExternal ? isSafeExternalHref(attrs.href) : isKnownPagePath(attrs.href)), {
    message: 'Invalid link target (external URL must be http/https, internal link must point to a known page)',
  });

const boldMarkSchema = z.object({ type: z.literal('bold') });
const linkMarkSchema = z.object({ type: z.literal('link'), attrs: linkAttrsSchema });
const richtextMarkSchema = z.union([boldMarkSchema, linkMarkSchema]);

const richtextTextNodeSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1),
  marks: z.array(richtextMarkSchema).max(2).optional(),
});

const richtextParagraphNodeSchema = z.object({
  type: z.literal('paragraph'),
  content: z.array(richtextTextNodeSchema).optional(),
});

const richtextListItemNodeSchema = z.object({
  type: z.literal('listItem'),
  content: z.array(richtextParagraphNodeSchema).length(1),
});

const richtextBulletListNodeSchema = z.object({
  type: z.literal('bulletList'),
  content: z.array(richtextListItemNodeSchema).min(1),
});

const richtextOrderedListNodeSchema = z.object({
  type: z.literal('orderedList'),
  content: z.array(richtextListItemNodeSchema).min(1),
});

const richtextBlockNodeSchema = z.union([
  richtextParagraphNodeSchema,
  richtextBulletListNodeSchema,
  richtextOrderedListNodeSchema,
]);

export const richtextDocSchema = z.object({
  type: z.literal('doc'),
  content: z.array(richtextBlockNodeSchema).min(1),
});

export type RichtextDoc = z.infer<typeof richtextDocSchema>;
export type RichtextMark = z.infer<typeof richtextMarkSchema>;
export type RichtextTextNode = z.infer<typeof richtextTextNodeSchema>;
export type RichtextParagraphNode = z.infer<typeof richtextParagraphNodeSchema>;
export type RichtextListItemNode = z.infer<typeof richtextListItemNodeSchema>;
export type RichtextBlockNode = z.infer<typeof richtextBlockNodeSchema>;
