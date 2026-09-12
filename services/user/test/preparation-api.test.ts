import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { db, remote } = vi.hoisted(() => ({
  db: {
    preparationQuestion: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
    preparationPlan: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    preparationTask: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    preparationInterview: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  remote: vi.fn(),
}));
vi.mock('../src/db', () => ({ prisma: db }));
vi.mock('../src/config', () => ({
  config: {
    jwtPublicKey: 'test',
    postServiceUrl: 'http://post',
    internalToken: 'internal',
  },
}));
vi.mock('@interviewhub/shared', async (original) => ({
  ...(await original<typeof import('@interviewhub/shared')>()),
  // Load validation through Vitest too, so schemas and ZodError share the same module instance.
  ...(await import('../../../packages/shared/src/validate')),
  requireAuth:
    () =>
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (!req.headers.authorization) {
        res.status(401).end();
        return;
      }
      req.user = { id: req.headers.authorization } as typeof req.user;
      next();
    },
  s2sClient: () => ({ get: remote }),
}));
import { preparationRouter } from '../src/preparation/routes';
const app = express();
app.use(express.json(), preparationRouter);
app.use(
  (
    err: { status?: number; message: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(err.status ?? 500).json({ error: err.message });
  },
);
const base = '/api/users/me/preparation';
const id = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';
const plan = {
  id,
  ownerId: 'alice',
  name: 'Prep',
  collectionId: id,
  createdAt: new Date(),
};
beforeEach(() => {
  vi.resetAllMocks();
  db.preparationPlan.findFirst.mockResolvedValue(plan);
  db.preparationTask.groupBy.mockResolvedValue([]);
});
describe('private preparation API', () => {
  it('paginates filtered questions and returns totals across all readiness levels', async () => {
    const second = '4f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';
    db.preparationQuestion.findMany.mockResolvedValue([
      { id, createdAt: new Date(), readiness: 'ready' },
      { id: second },
    ]);
    db.preparationQuestion.groupBy.mockResolvedValue([
      { readiness: 'ready', _count: { _all: 2 } },
      { readiness: 'new', _count: { _all: 3 } },
    ]);
    const res = await request(app)
      .get(`${base}/plans/${id}/questions?limit=1&readiness=ready`)
      .set('authorization', 'alice');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.nextCursor).toBeTruthy();
    expect(res.body.totals).toEqual({ new: 3, practicing: 0, ready: 2 });
    expect(db.preparationQuestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { planId: id, readiness: 'ready' },
        take: 2,
      }),
    );
    expect(db.preparationQuestion.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { planId: id } }),
    );
    await request(app)
      .get(`${base}/plans/${id}/questions?cursor=${res.body.nextCursor}`)
      .set('authorization', 'alice');
    expect(db.preparationQuestion.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: expect.any(Array) }),
      }),
    );
  });
  it('creates questions with defaults and updates answers without resetting readiness', async () => {
    db.preparationQuestion.create.mockResolvedValue({
      id,
      prompt: 'Why?',
      answer: '',
      readiness: 'new',
    });
    const created = await request(app)
      .post(`${base}/plans/${id}/questions`)
      .set('authorization', 'alice')
      .send({ prompt: 'Why?' });
    expect(created.status).toBe(201);
    expect(db.preparationQuestion.create).toHaveBeenCalledWith({
      data: { planId: id, prompt: 'Why?', answer: '', readiness: 'new' },
    });
    db.preparationQuestion.updateMany.mockResolvedValue({ count: 1 });
    db.preparationQuestion.findFirst.mockResolvedValue({
      id,
      answer: 'My answer',
      readiness: 'ready',
    });
    const updated = await request(app)
      .patch(`${base}/plans/${id}/questions/${id}`)
      .set('authorization', 'alice')
      .send({ answer: 'My answer' });
    expect(updated.body.readiness).toBe('ready');
    expect(db.preparationQuestion.updateMany).toHaveBeenCalledWith({
      where: { id, planId: id, plan: { ownerId: 'alice' } },
      data: { answer: 'My answer' },
    });
    db.preparationQuestion.deleteMany.mockResolvedValue({ count: 1 });
    expect(
      (
        await request(app)
          .delete(`${base}/plans/${id}/questions/${id}`)
          .set('authorization', 'alice')
      ).status,
    ).toBe(204);
  });
  it('denies foreign question access and scopes writes to the owner and parent', async () => {
    db.preparationPlan.findFirst.mockResolvedValue(null);
    for (const method of ['get', 'post'] as const) {
      expect(
        (
          await request(app)
            [method](`${base}/plans/${id}/questions`)
            .set('authorization', 'bob')
            .send(method === 'post' ? { prompt: 'Intruder' } : undefined)
        ).status,
      ).toBe(404);
    }
    expect(db.preparationQuestion.findMany).not.toHaveBeenCalled();
    expect(db.preparationQuestion.create).not.toHaveBeenCalled();
    db.preparationQuestion.updateMany.mockResolvedValue({ count: 0 });
    db.preparationQuestion.deleteMany.mockResolvedValue({ count: 0 });
    expect(
      (
        await request(app)
          .patch(`${base}/plans/${id}/questions/${id}`)
          .set('authorization', 'bob')
          .send({ readiness: 'ready' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(`${base}/plans/${id}/questions/${id}`)
          .set('authorization', 'bob')
      ).status,
    ).toBe(404);
    expect(db.preparationQuestion.deleteMany).toHaveBeenCalledWith({
      where: { id, planId: id, plan: { ownerId: 'bob' } },
    });
  });
  it('rejects malformed question filters and cursors before loading rows', async () => {
    for (const query of ['readiness=unknown', 'cursor=garbage']) {
      const response = await request(app)
        .get(`${base}/plans/${id}/questions?${query}`)
        .set('authorization', 'alice');
      expect(response.status, JSON.stringify(response.body)).toBe(400);
    }
    expect(db.preparationQuestion.findMany).not.toHaveBeenCalled();
  });
  it('guards all preparation routes before database access', async () => {
    expect((await request(app).get(`${base}/summary`)).status).toBe(401);
    expect(db.preparationPlan.count).not.toHaveBeenCalled();
  });
  it('returns 404 for a plan outside the owner scope', async () => {
    db.preparationPlan.findFirst.mockResolvedValue(null);
    expect(
      (
        await request(app)
          .get(`${base}/plans/${id}`)
          .set('authorization', 'bob')
      ).status,
    ).toBe(404);
    expect(db.preparationPlan.findFirst).toHaveBeenCalledWith({
      where: { id, ownerId: 'bob' },
    });
  });
  it('returns complete counts for a paginated plan list without loading task rows', async () => {
    db.preparationPlan.findMany.mockResolvedValue([plan]);
    db.preparationTask.groupBy.mockResolvedValue([
      { planId: id, completed: true, _count: { _all: 3 } },
      { planId: id, completed: false, _count: { _all: 8 } },
    ]);
    const res = await request(app)
      .get(`${base}/plans?limit=1`)
      .set('authorization', 'alice');
    expect(res.body.items[0]).toMatchObject({
      totalTasks: 11,
      completedTasks: 3,
    });
    expect(db.preparationTask.findMany).not.toHaveBeenCalled();
  });
  it('requires collection ownership before creating a linked plan', async () => {
    remote.mockResolvedValue({ ownerId: 'bob' });
    const res = await request(app)
      .post(`${base}/plans`)
      .set('authorization', 'alice')
      .send({ name: 'Prep', collectionId: id });
    expect(res.status).toBe(404);
    expect(db.preparationPlan.create).not.toHaveBeenCalled();
  });
  it('propagates collection lookup failure without creating an invalid link', async () => {
    remote.mockRejectedValue(
      Object.assign(new Error('Collection service unavailable'), {
        status: 502,
      }),
    );
    const res = await request(app)
      .post(`${base}/plans`)
      .set('authorization', 'alice')
      .send({ name: 'Prep', collectionId: id });
    expect(res.status).toBe(502);
    expect(db.preparationPlan.create).not.toHaveBeenCalled();
  });
  it('allows unrelated edits and unlinking while the collection service is down', async () => {
    remote.mockRejectedValue(new Error('down'));
    db.preparationPlan.update.mockResolvedValue(plan);
    expect(
      (
        await request(app)
          .patch(`${base}/plans/${id}`)
          .set('authorization', 'alice')
          .send({ name: 'Edited' })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .patch(`${base}/plans/${id}`)
          .set('authorization', 'alice')
          .send({ collectionId: null })
      ).status,
    ).toBe(200);
    expect(remote).not.toHaveBeenCalled();
  });
  it('scopes explicit task updates to both plan and owner without remote requests', async () => {
    db.preparationTask.updateMany.mockResolvedValue({ count: 1 });
    db.preparationTask.findFirst.mockResolvedValue({ id, completed: false });
    const res = await request(app)
      .patch(`${base}/plans/${id}/tasks/${id}`)
      .set('authorization', 'alice')
      .send({ completed: false });
    expect(res.status).toBe(200);
    expect(db.preparationTask.updateMany).toHaveBeenCalledWith({
      where: { id, planId: id, plan: { ownerId: 'alice' } },
      data: { completed: false },
    });
    expect(remote).not.toHaveBeenCalled();
  });
  it('rejects foreign interview deletion and scopes the database write', async () => {
    db.preparationInterview.deleteMany.mockResolvedValue({ count: 0 });
    expect(
      (
        await request(app)
          .delete(`${base}/plans/${id}/interviews/${id}`)
          .set('authorization', 'bob')
      ).status,
    ).toBe(404);
    expect(db.preparationInterview.deleteMany).toHaveBeenCalledWith({
      where: { id, planId: id, plan: { ownerId: 'bob' } },
    });
  });
});
