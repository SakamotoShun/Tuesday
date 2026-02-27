import { Hono } from 'hono';
import { docService } from '../services';
import { auth, requireProjectAccess } from '../middleware';
import { success, errors } from '../utils/response';
import { validateBody, formatValidationErrors, createDocSchema, updateDocSchema, updateDocSharesSchema } from '../utils/validation';

const docs = new Hono();

// All doc routes require authentication
docs.use('*', auth);

// GET /api/v1/projects/:id/docs - List project docs
docs.get('/projects/:id/docs', requireProjectAccess, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const projectDocs = await docService.getProjectDocs(projectId, user);
    return success(c, projectDocs);
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error fetching project docs:', error);
    return errors.internal(c, 'Failed to fetch docs');
  }
});

// POST /api/v1/projects/:id/docs - Create doc in project
docs.post('/projects/:id/docs', requireProjectAccess, async (c) => {
  try {
    const user = c.get('user');
    const projectId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(createDocSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const doc = await docService.createDoc(
      { ...validation.data, projectId },
      user
    );
    return success(c, doc, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating doc:', error);
    return errors.internal(c, 'Failed to create doc');
  }
});

// GET /api/v1/docs/personal - List personal docs
docs.get('/personal', async (c) => {
  try {
    const user = c.get('user');
    const personalDocs = await docService.getPersonalDocs(user);
    return success(c, personalDocs);
  } catch (error) {
    console.error('Error fetching personal docs:', error);
    return errors.internal(c, 'Failed to fetch docs');
  }
});

// POST /api/v1/docs/personal - Create personal doc
docs.post('/personal', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();

    const validation = validateBody(createDocSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const doc = await docService.createDoc(
      { ...validation.data, projectId: null },
      user
    );
    return success(c, doc, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating personal doc:', error);
    return errors.internal(c, 'Failed to create doc');
  }
});

// GET /api/v1/docs/:id - Get doc
// GET /api/v1/docs/:id/children - Get doc with children
docs.get('/:id/children', async (c) => {
  try {
    const user = c.get('user');
    const docId = c.req.param('id');

    const doc = await docService.getDocWithChildren(docId, user);

    if (!doc) {
      return errors.notFound(c, 'Doc not found');
    }

    return success(c, doc);
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error fetching doc children:', error);
    return errors.internal(c, 'Failed to fetch doc children');
  }
});

// GET /api/v1/docs/:id - Get doc
docs.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    const docId = c.req.param('id');

    const doc = await docService.getDoc(docId, user);

    if (!doc) {
      return errors.notFound(c, 'Doc not found');
    }

    return success(c, doc);
  } catch (error) {
    if (error instanceof Error) {
      return errors.forbidden(c, error.message);
    }
    console.error('Error fetching doc:', error);
    return errors.internal(c, 'Failed to fetch doc');
  }
});

// GET /api/v1/docs/:id/shares - List doc shares
docs.get('/:id/shares', async (c) => {
  try {
    const user = c.get('user');
    const docId = c.req.param('id');

    const shares = await docService.listDocShares(docId, user);
    if (!shares) {
      return errors.notFound(c, 'Doc not found');
    }

    return success(c, shares);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Access denied to manage doc shares') {
        return errors.forbidden(c, error.message);
      }
      return errors.badRequest(c, error.message);
    }
    console.error('Error fetching doc shares:', error);
    return errors.internal(c, 'Failed to fetch doc shares');
  }
});

// PUT /api/v1/docs/:id/shares - Replace doc shares
docs.put('/:id/shares', async (c) => {
  try {
    const user = c.get('user');
    const docId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(updateDocSharesSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const shares = await docService.updateDocShares(docId, validation.data.userIds, user);
    if (!shares) {
      return errors.notFound(c, 'Doc not found');
    }

    return success(c, shares);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Access denied to manage doc shares') {
        return errors.forbidden(c, error.message);
      }
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating doc shares:', error);
    return errors.internal(c, 'Failed to update doc shares');
  }
});

// GET /api/v1/docs/:id/share-link - Get public share link
docs.get('/:id/share-link', async (c) => {
  try {
    const user = c.get('user');
    const docId = c.req.param('id');
    const shareLink = await docService.getDocPublicShareLink(docId, user);
    return success(c, shareLink);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Access denied to manage doc shares') {
        return errors.forbidden(c, error.message);
      }
      if (error.message === 'Doc not found') {
        return errors.notFound(c, 'Doc');
      }
      return errors.badRequest(c, error.message);
    }
    console.error('Error fetching doc public share link:', error);
    return errors.internal(c, 'Failed to fetch doc public share link');
  }
});

// PUT /api/v1/docs/:id/share-link - Create or refresh public share link
docs.put('/:id/share-link', async (c) => {
  try {
    const user = c.get('user');
    const docId = c.req.param('id');
    const shareLink = await docService.createDocPublicShareLink(docId, user);
    return success(c, shareLink);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Access denied to manage doc shares') {
        return errors.forbidden(c, error.message);
      }
      if (error.message === 'Doc not found') {
        return errors.notFound(c, 'Doc');
      }
      return errors.badRequest(c, error.message);
    }
    console.error('Error creating doc public share link:', error);
    return errors.internal(c, 'Failed to create doc public share link');
  }
});

// DELETE /api/v1/docs/:id/share-link - Revoke public share link
docs.delete('/:id/share-link', async (c) => {
  try {
    const user = c.get('user');
    const docId = c.req.param('id');
    const deleted = await docService.deleteDocPublicShareLink(docId, user);
    return success(c, { deleted });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Access denied to manage doc shares') {
        return errors.forbidden(c, error.message);
      }
      if (error.message === 'Doc not found') {
        return errors.notFound(c, 'Doc');
      }
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting doc public share link:', error);
    return errors.internal(c, 'Failed to delete doc public share link');
  }
});

// PATCH /api/v1/docs/:id - Update doc
docs.patch('/:id', async (c) => {
  try {
    const user = c.get('user');
    const docId = c.req.param('id');
    const body = await c.req.json();

    const validation = validateBody(updateDocSchema, body);
    if (!validation.success) {
      return errors.validation(c, formatValidationErrors(validation.errors));
    }

    const doc = await docService.updateDoc(docId, validation.data, user);

    if (!doc) {
      return errors.notFound(c, 'Doc not found');
    }

    return success(c, doc);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error updating doc:', error);
    return errors.internal(c, 'Failed to update doc');
  }
});

// DELETE /api/v1/docs/:id - Delete doc
docs.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    const docId = c.req.param('id');

    const deleted = await docService.deleteDoc(docId, user);

    if (!deleted) {
      return errors.notFound(c, 'Doc not found');
    }

    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting doc:', error);
    return errors.internal(c, 'Failed to delete doc');
  }
});

export { docs };
