import { beforeEach, describe, expect, it, mock } from 'bun:test';

let createStoredDoc: (...args: any[]) => Promise<any>;
let updateStoredDocContent: (...args: any[]) => Promise<any>;
let findStoredNote: (...args: any[]) => Promise<any>;
let createStoredNote: (...args: any[]) => Promise<any>;
let updateStoredNote: (...args: any[]) => Promise<any>;

mock.module('../repositories', () => ({
  interviewStageRepository: {},
  jobPositionRepository: {},
  candidateRepository: {},
  jobApplicationRepository: {},
  interviewRepository: {},
  positionDocRepository: {},
  docRepository: {
    create: (data: any) => createStoredDoc(data),
    updateContentAndResetCollab: (id: string, data: any) => updateStoredDocContent(id, data),
  },
  interviewNoteRepository: {
    findById: (id: string) => findStoredNote(id),
    create: (data: any) => createStoredNote(data),
    update: (id: string, data: any) => updateStoredNote(id, data),
  },
}));

mock.module('../collab/hub', () => ({
  docCollabHub: {
    runContentMutation: (_docId: string, mutation: () => Promise<any>) => mutation(),
  },
}));

mock.module('./doc', () => ({ docService: {} }));
mock.module('./file', () => ({ fileService: {} }));

const { DocBlockCanonicalizationError } = await import('../collab/docContent');
const { hiringService } = await import('./hiring');

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
