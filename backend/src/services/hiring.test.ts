import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { docCollabHub } from '../collab/hub';
import { docRepository } from '../repositories/doc';
import { interviewNoteRepository } from '../repositories/interviewNote';

let createStoredDoc: (...args: any[]) => Promise<any>;
let updateStoredDocContent: (...args: any[]) => Promise<any>;
let findStoredNote: (...args: any[]) => Promise<any>;
let createStoredNote: (...args: any[]) => Promise<any>;
let updateStoredNote: (...args: any[]) => Promise<any>;

spyOn(docRepository, 'create').mockImplementation((data) => createStoredDoc(data));
spyOn(docRepository, 'updateContentAndResetCollab').mockImplementation(
  (id, data) => updateStoredDocContent(id, data)
);
spyOn(interviewNoteRepository, 'findById').mockImplementation((id) => findStoredNote(id));
spyOn(interviewNoteRepository, 'create').mockImplementation((data) => createStoredNote(data));
spyOn(interviewNoteRepository, 'update').mockImplementation((id, data) => updateStoredNote(id, data));
spyOn(docCollabHub, 'runContentMutation').mockImplementation(
  ((_docId: string, mutation: () => Promise<any>) => mutation()) as typeof docCollabHub.runContentMutation
);

const { DocBlockCanonicalizationError } = await import('../collab/docContent');
const { hiringService } = await import('./hiring');

afterAll(() => mock.restore());

const adminUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin' as const,
  isDisabled: false,
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function noteContent(text: unknown = 'Canonical note') {
  return [{
    id: 'paragraph-1',
    type: 'paragraph',
    props: { customProp: 'keep' },
    content: [{ type: 'text', text, styles: {} }],
    children: [],
    customTop: 'keep',
  }];
}

describe('HiringService interview note content', () => {
  beforeEach(() => {
    createStoredDoc = async (data) => ({ id: 'doc-1', ...data });
    updateStoredDocContent = async (_id, data) => ({ id: 'doc-1', ...data });
    findStoredNote = async () => ({ id: 'note-1', docId: 'doc-1', title: 'Note', content: [] });
    createStoredNote = async (data) => ({ id: 'note-1', ...data });
    updateStoredNote = async (id, data) => ({ id, ...data });
  });

  it('creates docs and mirrored notes with the same canonical content', async () => {
    let docData: any;
    let noteData: any;
    createStoredDoc = async (data) => {
      docData = data;
      return { id: 'doc-1', ...data };
    };
    createStoredNote = async (data) => {
      noteData = data;
      return { id: 'note-1', ...data };
    };

    await hiringService.createNote({ title: 'Note', content: noteContent() }, adminUser);

    expect(docData.content).toEqual(noteData.content);
    expect(docData.content[0]).toMatchObject({
      customTop: 'keep',
      props: { customProp: 'keep', textAlignment: 'left' },
    });
    expect(docData.searchText).toContain('Canonical note');
  });

  it('updates docs and mirrored notes with the same canonical content', async () => {
    let docData: any;
    let noteData: any;
    updateStoredDocContent = async (_id, data) => {
      docData = data;
      return { id: 'doc-1', ...data };
    };
    updateStoredNote = async (id, data) => {
      noteData = data;
      return { id, ...data };
    };

    await hiringService.updateNote('note-1', { content: noteContent('Updated canonical note') });

    expect(docData.content).toEqual(noteData.content);
    expect(docData.searchText).toContain('Updated canonical note');
  });

  it('types malformed canonical input without wrapping repository failures', async () => {
    await expect(
      hiringService.createNote({ title: 'Note', content: noteContent(42) }, adminUser)
    ).rejects.toBeInstanceOf(DocBlockCanonicalizationError);

    const infrastructureError = new Error('database unavailable');
    createStoredDoc = async () => {
      throw infrastructureError;
    };
    await expect(
      hiringService.createNote({ title: 'Note', content: noteContent() }, adminUser)
    ).rejects.toBe(infrastructureError);
  });
});
