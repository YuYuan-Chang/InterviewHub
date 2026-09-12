import { Router } from 'express';
import {
  authedUser,
  clampLimit,
  encodeCursor,
  HttpError,
  param,
  parseQuery,
  requireAuth,
  s2sClient,
  validateBody,
} from '@interviewhub/shared';
import { prisma } from '../db';
import { config } from '../config';
import {
  cursorWhere,
  interviewSchema,
  listSchema,
  planSchema,
  scheduleWhere,
  taskSchema,
  questionSchema,
  questionListSchema,
} from './schemas';

export const preparationRouter: Router = Router();
const base = '/api/users/me/preparation';
const posts = s2sClient(config.postServiceUrl, config.internalToken);
preparationRouter.use(base, requireAuth(config.jwtPublicKey));

async function owned(ownerId: string, id: string) {
  const plan = await prisma.preparationPlan.findFirst({
    where: { id, ownerId },
  });
  if (!plan) throw new HttpError(404, 'Preparation plan not found');
  return plan;
}
async function collectionOwner(ownerId: string, collectionId?: string | null) {
  if (!collectionId) return;
  const collection = await posts.get<{ ownerId: string }>(
    `/internal/collections/${collectionId}`,
  );
  if (collection.ownerId !== ownerId)
    throw new HttpError(404, 'Collection not found');
}
async function planDtos<T extends { id: string }>(plans: T[]) {
  const groups = await prisma.preparationTask.groupBy({
    by: ['planId', 'completed'],
    where: { planId: { in: plans.map((plan) => plan.id) } },
    _count: { _all: true },
  });
  return plans.map((plan) => {
    const counts = groups.filter((group) => group.planId === plan.id);
    return {
      ...plan,
      totalTasks: counts.reduce((sum, group) => sum + group._count._all, 0),
      completedTasks: counts.find((group) => group.completed)?._count._all ?? 0,
    };
  });
}
function page<T extends { id: string }>(
  rows: T[],
  limit: number,
  field: 'createdAt' | 'scheduledAt',
) {
  const items = rows.slice(0, limit);
  const last = items.at(-1) as
    (T & { createdAt?: Date; scheduledAt?: Date }) | undefined;
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ id: last.id, field, time: last[field]!.toISOString() })
        : null,
  };
}
preparationRouter.get(`${base}/plans/:planId/questions`, async (req, res) => {
  const plan = await owned(authedUser(req).id, param(req, 'planId'));
  const query = parseQuery(questionListSchema, req.query);
  const limit = clampLimit(query.limit);
  const [rows, groups] = await Promise.all([
    prisma.preparationQuestion.findMany({
      where: {
        planId: plan.id,
        ...(query.readiness ? { readiness: query.readiness } : {}),
        ...cursorWhere(query.cursor, 'createdAt'),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    }),
    prisma.preparationQuestion.groupBy({
      by: ['readiness'],
      where: { planId: plan.id },
      _count: { _all: true },
    }),
  ]);
  const totals = { new: 0, practicing: 0, ready: 0 };
  for (const group of groups) {
    if (group.readiness in totals)
      totals[group.readiness as keyof typeof totals] = group._count._all;
  }
  res.json({ ...page(rows, limit, 'createdAt'), totals });
});
preparationRouter.post(
  `${base}/plans/:planId/questions`,
  validateBody(questionSchema),
  async (req, res) => {
    const plan = await owned(authedUser(req).id, param(req, 'planId'));
    res
      .status(201)
      .json(
        await prisma.preparationQuestion.create({
          data: { ...req.body, planId: plan.id },
        }),
      );
  },
);
preparationRouter.patch(
  `${base}/plans/:planId/questions/:questionId`,
  validateBody(questionSchema.partial()),
  async (req, res) => {
    const where = {
      id: param(req, 'questionId'),
      planId: param(req, 'planId'),
      plan: { ownerId: authedUser(req).id },
    };
    const result = await prisma.preparationQuestion.updateMany({
      where,
      data: req.body,
    });
    if (!result.count) throw new HttpError(404, 'Question not found');
    res.json(await prisma.preparationQuestion.findFirst({ where }));
  },
);
preparationRouter.delete(
  `${base}/plans/:planId/questions/:questionId`,
  async (req, res) => {
    const result = await prisma.preparationQuestion.deleteMany({
      where: {
        id: param(req, 'questionId'),
        planId: param(req, 'planId'),
        plan: { ownerId: authedUser(req).id },
      },
    });
    if (!result.count) throw new HttpError(404, 'Question not found');
    res.status(204).end();
  },
);
preparationRouter.get(`${base}/summary`, async (req, res) => {
  const ownerId = authedUser(req).id;
  const [planCount, totalTasks, completedTasks, nextInterview] =
    await Promise.all([
      prisma.preparationPlan.count({ where: { ownerId } }),
      prisma.preparationTask.count({ where: { plan: { ownerId } } }),
      prisma.preparationTask.count({
        where: { plan: { ownerId }, completed: true },
      }),
      prisma.preparationInterview.findFirst({
        where: { plan: { ownerId }, ...scheduleWhere('upcoming', new Date()) },
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        include: { plan: { select: { name: true } } },
      }),
    ]);
  res.json({ planCount, totalTasks, completedTasks, nextInterview });
});
preparationRouter.get(`${base}/plans`, async (req, res) => {
  const query = parseQuery(listSchema, req.query);
  const limit = clampLimit(query.limit);
  const rows = await prisma.preparationPlan.findMany({
    where: {
      ownerId: authedUser(req).id,
      ...cursorWhere(query.cursor, 'createdAt'),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
  });
  const result = page(rows, limit, 'createdAt');
  res.json({ ...result, items: await planDtos(result.items) });
});
preparationRouter.post(
  `${base}/plans`,
  validateBody(planSchema),
  async (req, res) => {
    const ownerId = authedUser(req).id;
    await collectionOwner(ownerId, req.body.collectionId);
    const plan = await prisma.preparationPlan.create({
      data: { ...req.body, ownerId },
    });
    res.status(201).json((await planDtos([plan]))[0]);
  },
);
preparationRouter.get(`${base}/plans/:planId`, async (req, res) => {
  const plan = await prisma.preparationPlan.findFirst({
    where: { id: param(req, 'planId'), ownerId: authedUser(req).id },
  });
  if (!plan) throw new HttpError(404, 'Preparation plan not found');
  res.json((await planDtos([plan]))[0]);
});
preparationRouter.patch(
  `${base}/plans/:planId`,
  validateBody(planSchema.partial()),
  async (req, res) => {
    const plan = await owned(authedUser(req).id, param(req, 'planId'));
    if (req.body.collectionId !== plan.collectionId)
      await collectionOwner(plan.ownerId, req.body.collectionId);
    const updated = await prisma.preparationPlan.update({
      where: { id: plan.id, ownerId: plan.ownerId },
      data: req.body,
    });
    res.json((await planDtos([updated]))[0]);
  },
);
preparationRouter.delete(`${base}/plans/:planId`, async (req, res) => {
  const result = await prisma.preparationPlan.deleteMany({
    where: { id: param(req, 'planId'), ownerId: authedUser(req).id },
  });
  if (!result.count) throw new HttpError(404, 'Preparation plan not found');
  res.status(204).end();
});
preparationRouter.get(`${base}/plans/:planId/tasks`, async (req, res) => {
  const plan = await owned(authedUser(req).id, param(req, 'planId'));
  const query = parseQuery(listSchema, req.query);
  const limit = clampLimit(query.limit);
  const rows = await prisma.preparationTask.findMany({
    where: { planId: plan.id, ...cursorWhere(query.cursor, 'createdAt') },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit + 1,
  });
  res.json(page(rows, limit, 'createdAt'));
});
preparationRouter.post(
  `${base}/plans/:planId/tasks`,
  validateBody(taskSchema),
  async (req, res) => {
    const plan = await owned(authedUser(req).id, param(req, 'planId'));
    res
      .status(201)
      .json(
        await prisma.preparationTask.create({
          data: { ...req.body, planId: plan.id },
        }),
      );
  },
);
preparationRouter.patch(
  `${base}/plans/:planId/tasks/:taskId`,
  validateBody(taskSchema.partial()),
  async (req, res) => {
    const where = {
      id: param(req, 'taskId'),
      planId: param(req, 'planId'),
      plan: { ownerId: authedUser(req).id },
    };
    const result = await prisma.preparationTask.updateMany({
      where,
      data: req.body,
    });
    if (!result.count) throw new HttpError(404, 'Task not found');
    res.json(await prisma.preparationTask.findFirst({ where }));
  },
);
preparationRouter.delete(
  `${base}/plans/:planId/tasks/:taskId`,
  async (req, res) => {
    const result = await prisma.preparationTask.deleteMany({
      where: {
        id: param(req, 'taskId'),
        planId: param(req, 'planId'),
        plan: { ownerId: authedUser(req).id },
      },
    });
    if (!result.count) throw new HttpError(404, 'Task not found');
    res.status(204).end();
  },
);
for (const path of [`${base}/interviews`, `${base}/plans/:planId/interviews`]) {
  preparationRouter.get(path, async (req, res) => {
    const ownerId = authedUser(req).id;
    const planId = req.params.planId ? param(req, 'planId') : undefined;
    if (planId) await owned(ownerId, planId);
    const query = parseQuery(listSchema, req.query);
    const limit = clampLimit(query.limit);
    const rows = await prisma.preparationInterview.findMany({
      where: {
        plan: { ownerId },
        ...(planId ? { planId } : {}),
        AND: [
          cursorWhere(query.cursor, 'scheduledAt'),
          query.view || !planId
            ? scheduleWhere(query.view ?? 'upcoming', new Date())
            : {},
        ],
      },
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: { plan: { select: { name: true } } },
    });
    res.json(page(rows, limit, 'scheduledAt'));
  });
}
preparationRouter.post(
  `${base}/plans/:planId/interviews`,
  validateBody(interviewSchema),
  async (req, res) => {
    const plan = await owned(authedUser(req).id, param(req, 'planId'));
    res.status(201).json(
      await prisma.preparationInterview.create({
        data: {
          ...req.body,
          scheduledAt: new Date(req.body.scheduledAt),
          planId: plan.id,
        },
      }),
    );
  },
);
preparationRouter.patch(
  `${base}/plans/:planId/interviews/:interviewId`,
  validateBody(interviewSchema.partial()),
  async (req, res) => {
    const where = {
      id: param(req, 'interviewId'),
      planId: param(req, 'planId'),
      plan: { ownerId: authedUser(req).id },
    };
    const data = {
      ...req.body,
      ...(req.body.scheduledAt
        ? { scheduledAt: new Date(req.body.scheduledAt) }
        : {}),
    };
    const result = await prisma.preparationInterview.updateMany({
      where,
      data,
    });
    if (!result.count) throw new HttpError(404, 'Interview not found');
    res.json(await prisma.preparationInterview.findFirst({ where }));
  },
);
preparationRouter.delete(
  `${base}/plans/:planId/interviews/:interviewId`,
  async (req, res) => {
    const result = await prisma.preparationInterview.deleteMany({
      where: {
        id: param(req, 'interviewId'),
        planId: param(req, 'planId'),
        plan: { ownerId: authedUser(req).id },
      },
    });
    if (!result.count) throw new HttpError(404, 'Interview not found');
    res.status(204).end();
  },
);
