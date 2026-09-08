import { s2sClient, startJob } from '@interviewhub/shared';
import { z } from 'zod';
import { config } from './config';
import { prisma } from './db';
import { logger } from './logger';
import { deleteObject, listObjects } from './storage';

const posts = s2sClient(config.postServiceUrl, config.internalToken);
const users = s2sClient(config.userServiceUrl, config.internalToken);
let afterId = '';
let objectToken: string | undefined;

export async function cleanFiles() {
  // At least one day of quarantine lets pre-existing attachment requests finish.
  const cutoff = new Date(Date.now() - Math.max(86_400_000, config.fileGcGraceMs));
  const files = await prisma.file.findMany({ where: { id: { gt: afterId }, createdAt: { lt: cutoff } }, orderBy: { id: 'asc' }, take: 100 });
  for (const candidate of files) {
    await prisma.$transaction(async (tx) => {
      // Serialize GC replicas so stale scans cannot delete a restored reference.
      await tx.$queryRaw`SELECT id FROM files WHERE id = ${candidate.id} FOR UPDATE`;
      const file = await tx.file.findUnique({ where: { id: candidate.id } });
      if (!file) return;
      const refs = await Promise.all([posts, users].map((client) =>
        client.get<{ referenced: boolean }>(`/internal/file-references/${file.id}`)));
      const referenced = refs.map((ref) => z.object({ referenced: z.boolean() }).parse(ref));
      if (referenced.some((ref) => ref.referenced)) {
        if (file.gcMarkedAt) await tx.file.update({ where: { id: file.id }, data: { gcMarkedAt: null } });
      } else if (!file.gcMarkedAt) {
        await tx.file.update({ where: { id: file.id }, data: { gcMarkedAt: new Date() } });
      } else if (file.gcMarkedAt < cutoff) {
        // Delete bytes first. A crash leaves metadata to retry the idempotent delete.
        await deleteObject(file.s3Key);
        await tx.file.delete({ where: { id: file.id } });
      }
    }, { timeout: 10_000 });
    afterId = candidate.id;
  }
  if (files.length < 100) afterId = '';
  const objects = await listObjects(objectToken);
  for (const object of objects.Contents ?? []) {
    if (!object.Key || !object.LastModified || object.LastModified >= cutoff) continue;
    if (!await prisma.file.findUnique({ where: { s3Key: object.Key } })) await deleteObject(object.Key);
  }
  objectToken = objects.NextContinuationToken;
  return { scanned: files.length };
}

export function startMaintenance() {
  return startJob('file-cleanup', cleanFiles, logger, config.maintenanceIntervalMs);
}
