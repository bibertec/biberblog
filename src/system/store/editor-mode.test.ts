import { beforeEach, describe, expect, it } from 'vitest';
import { draftKey, parseDraftKey, useEditorMode } from './editor-mode';

describe('draftKey / parseDraftKey', () => {
  it.each([
    ['/', 'hero1.title'],
    ['/about-us', 'team1.members'],
    ['/a/b', 'faq2.items'],
  ])('round-trips pathname %s and fieldId %s', (pathname, fieldId) => {
    expect(parseDraftKey(draftKey(pathname, fieldId))).toEqual({ pathname, fieldId });
  });

  it('builds the documented flat key format', () => {
    expect(draftKey('/about', 'team1.title')).toBe('/about::team1.title');
  });

  it('throws for a key without separator', () => {
    expect(() => parseDraftKey('/about.team1.title')).toThrow('Invalid draft key');
  });
});

describe('useEditorMode store', () => {
  beforeEach(() => {
    useEditorMode.setState({ editMode: false, drafts: {} });
  });

  it('enters and exits the editor mode idempotently', () => {
    const { enterEditMode, exitEditMode } = useEditorMode.getState();

    enterEditMode();
    enterEditMode();
    expect(useEditorMode.getState().editMode).toBe(true);

    exitEditMode();
    exitEditMode();
    expect(useEditorMode.getState().editMode).toBe(false);
  });

  it('sets, overwrites and reverts single drafts without touching others', () => {
    const { setDraft, revertDraft } = useEditorMode.getState();

    setDraft('/::a.title', 'one');
    setDraft('/::b.title', 'two');
    setDraft('/::a.title', 'three');
    expect(useEditorMode.getState().drafts).toEqual({ '/::a.title': 'three', '/::b.title': 'two' });

    revertDraft('/::a.title');
    expect(useEditorMode.getState().drafts).toEqual({ '/::b.title': 'two' });
  });

  it('clears all drafts of all pages', () => {
    const { setDraft, clearDrafts } = useEditorMode.getState();
    setDraft('/::a.title', 'one');
    setDraft('/about::b.title', 'two');

    clearDrafts();

    expect(useEditorMode.getState().drafts).toEqual({});
  });

  it('never mutates the previous drafts object (immutable updates for React)', () => {
    const { setDraft } = useEditorMode.getState();
    setDraft('/::a.title', 'one');
    const before = useEditorMode.getState().drafts;

    setDraft('/::b.title', 'two');

    expect(before).toEqual({ '/::a.title': 'one' });
    expect(useEditorMode.getState().drafts).not.toBe(before);
  });
});
