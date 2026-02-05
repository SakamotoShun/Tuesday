import { Hono } from 'hono';
import { auth } from '../middleware';
import { fileService } from '../services/file';
import { success, errors } from '../utils/response';

const files = new Hono();

files.use('*', auth);

// POST /api/v1/files - Upload file
files.post('/', async (c) => {
  try {
    const user = c.get('user');
    const formData = await c.req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return errors.badRequest(c, 'File is required');
    }

    const uploaded = await fileService.upload(file as unknown as { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }, user);
    return success(c, uploaded, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error uploading file:', error);
    return errors.internal(c, 'Failed to upload file');
  }
});

// GET /api/v1/files/:id - Download file
files.get('/:id', async (c) => {
  try {
    const user = c.get('user');
    const fileId = c.req.param('id');
    const { file } = await fileService.getFileForUser(fileId, user);

    const blob = Bun.file(file.storagePath);
    const filename = file.originalName.replace(/"/g, '');

    return c.body(blob.stream(), 200, {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.sizeBytes),
      'Content-Disposition': `inline; filename="${filename}"`,
    });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error downloading file:', error);
    return errors.internal(c, 'Failed to download file');
  }
});

// DELETE /api/v1/files/:id - Delete file
files.delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    const fileId = c.req.param('id');
    await fileService.deleteFile(fileId, user);
    return success(c, { deleted: true });
  } catch (error) {
    if (error instanceof Error) {
      return errors.badRequest(c, error.message);
    }
    console.error('Error deleting file:', error);
    return errors.internal(c, 'Failed to delete file');
  }
});

export { files };
