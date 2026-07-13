import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import {
  HttpError,
  authedUser,
  requireAuth,
  requireInternal,
  param,
} from '@interviewhub/shared';
import { ALLOWED_MIME_TYPES, config } from './config';
import { prisma } from './db';
import { getObjectStream, putObject } from './storage';
import { logger } from './logger';

// Files are ≤10MB so buffering in memory is fine and keeps the container stateless.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileBytes, files: 1 },
});

function sanitizeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 150) || 'file';
}

export const router: Router = Router();

router.post('/api/files', requireAuth(config.jwtPublicKey), upload.single('file'), async (req, res) => {
  const user = authedUser(req);
  const file = req.file;
  if (!file) throw new HttpError(400, 'Attach a file under the "file" form field');
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new HttpError(415, `Unsupported file type: ${file.mimetype}. Allowed: PDF, txt, markdown, doc(x)`);
  }

  const originalName = sanitizeName(file.originalname);
  const s3Key = `${user.id}/${crypto.randomUUID()}/${originalName}`;
  await putObject(s3Key, file.buffer, file.mimetype);
  const record = await prisma.file.create({
    data: { ownerId: user.id, s3Key, originalName, mime: file.mimetype, sizeBytes: file.size },
  });
  res.status(201).json({
    id: record.id,
    name: record.originalName,
    mime: record.mime,
    sizeBytes: record.sizeBytes,
  });
});

router.get('/api/files/:id/download', requireAuth(config.jwtPublicKey), async (req, res) => {
  const record = await prisma.file.findUnique({ where: { id: param(req, 'id') } });
  if (!record) throw new HttpError(404, 'File not found');
  const stream = await getObjectStream(record.s3Key);
  res.setHeader('content-type', record.mime);
  res.setHeader('content-length', String(record.sizeBytes));
  res.setHeader('content-disposition', `attachment; filename="${record.originalName}"`);
  stream.on('error', (err) => {
    logger.error({ err }, 'download stream error');
    res.destroy(err);
  });
  stream.pipe(res);
});

// Public inline serving for media previews (<img>/<video> can't send auth
// headers). IDs are unguessable UUIDs; explicit downloads stay authenticated.
router.get('/api/files/:id/content', async (req, res) => {
  const record = await prisma.file.findUnique({ where: { id: param(req, 'id') } });
  if (!record) throw new HttpError(404, 'File not found');
  const stream = await getObjectStream(record.s3Key);
  res.setHeader('content-type', record.mime);
  res.setHeader('content-length', String(record.sizeBytes));
  res.setHeader('content-disposition', `inline; filename="${record.originalName}"`);
  res.setHeader('cache-control', 'public, max-age=31536000, immutable');
  stream.on('error', (err) => {
    logger.error({ err }, 'content stream error');
    res.destroy(err);
  });
  stream.pipe(res);
});

// post-service verifies file ownership before attaching a file to a post
router.get('/internal/files/:id', requireInternal(config.internalToken), async (req, res) => {
  const record = await prisma.file.findUnique({ where: { id: param(req, 'id') } });
  if (!record) throw new HttpError(404, 'File not found');
  res.json({
    id: record.id,
    ownerId: record.ownerId,
    name: record.originalName,
    mime: record.mime,
    sizeBytes: record.sizeBytes,
  });
});
