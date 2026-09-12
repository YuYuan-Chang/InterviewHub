/** Exercises private preparation workflows using the main smoke test's two users. */
export async function preparationSmoke(api, check, alice, bob, collectionId) {
  const base = '/api/users/me/preparation';
  const request = (path, method = 'GET', body, token = alice.accessToken) =>
    api(`${base}${path}`, { method, body, token });
  check(
    'preparation rejects anonymous access',
    (await request('/summary', 'GET', undefined, null)).status === 401,
  );
  const foreignCollection = await request(
    '/plans',
    'POST',
    { name: 'Forbidden', collectionId },
    bob.accessToken,
  );
  check(
    'cannot attach another user’s collection',
    foreignCollection.status === 404,
  );
  const created = await request('/plans', 'POST', {
    name: 'Backend preparation',
    company: 'Example Corp',
    role: 'Backend engineer',
    collectionId,
  });
  check(
    'creates a private collection-linked plan',
    created.status === 201 &&
      created.data.collectionId === collectionId &&
      created.data.totalTasks === 0,
  );
  if (created.status !== 201) return;
  const plan = `/plans/${created.data.id}`;
  check(
    'older plan requests receive empty workspace details',
    created.data.jobUrl === '' &&
      created.data.notes === '' &&
      created.data.jobDescription === '',
  );
  await request(plan, 'PATCH', {
    jobUrl: 'https://example.com/jobs/backend',
    jobDescription: 'Build APIs',
    notes: 'Review trade-offs',
  });
  const workspace = await request(plan);
  check(
    'workspace details persist on reload',
    workspace.data.notes === 'Review trade-offs' &&
      workspace.data.jobDescription === 'Build APIs',
  );
  const question = await request(`${plan}/questions`, 'POST', {
    prompt: 'Explain a difficult trade-off.',
  });
  check(
    'creates a private practice question',
    question.status === 201 && question.data.readiness === 'new',
  );
  const questionPath = `${plan}/questions/${question.data.id}`;
  check('invalid readiness is rejected', (await request(`${plan}/questions?readiness=unknown`)).status === 400);
  check('anonymous question access is rejected', (await request(`${plan}/questions`, 'GET', undefined, null)).status === 401);
  check('invalid job URL is rejected', (await request(plan, 'PATCH', { jobUrl: 'javascript:alert(1)' })).status === 400);
  const disposableQuestion = await request(`${plan}/questions`, 'POST', { prompt: 'Temporary practice question' });
  check('owner can delete a question', (await request(`${plan}/questions/${disposableQuestion.data.id}`, 'DELETE')).status === 204);
  await request(questionPath, 'PATCH', {
    answer: 'I compared consistency and latency.',
    readiness: 'ready',
  });
  await request(`${plan}/questions`, 'POST', { prompt: 'Why this company?' });
  const questions = await request(`${plan}/questions?readiness=ready&limit=1`);
  check(
    'question answers, readiness and unfiltered totals persist',
    questions.data.items[0].answer === 'I compared consistency and latency.' &&
      questions.data.totals.new === 1 &&
      questions.data.totals.ready === 1,
  );
  const firstQuestionPage = await request(`${plan}/questions?limit=1`);
  const secondQuestionPage = await request(
    `${plan}/questions?limit=1&cursor=${firstQuestionPage.data.nextCursor}`,
  );
  check(
    'questions paginate without duplicates',
    firstQuestionPage.data.items[0].id !== secondQuestionPage.data.items[0].id,
  );
  check(
    'foreign question listing returns 404',
    (await request(`${plan}/questions`, 'GET', undefined, bob.accessToken))
      .status === 404,
  );
  check(
    'foreign question edit returns 404',
    (
      await request(
        questionPath,
        'PATCH',
        { answer: 'Intruder' },
        bob.accessToken,
      )
    ).status === 404,
  );
  check(
    'foreign question deletion returns 404',
    (await request(questionPath, 'DELETE', undefined, bob.accessToken))
      .status === 404,
  );
  for (const method of ['GET', 'PATCH', 'DELETE']) {
    check(
      `foreign plan ${method} returns 404`,
      (
        await request(
          plan,
          method,
          method === 'PATCH' ? { name: 'Intruder' } : undefined,
          bob.accessToken,
        )
      ).status === 404,
    );
  }
  check(
    'foreign task creation returns 404',
    (
      await request(
        `${plan}/tasks`,
        'POST',
        { title: 'Intruder' },
        bob.accessToken,
      )
    ).status === 404,
  );
  const tasks = [];
  for (const title of [
    'Review API design',
    'Practice behavioral answers',
    'Review system design',
  ]) {
    tasks.push(
      (await request(`${plan}/tasks`, 'POST', { title, dueDate: '2026-09-01' }))
        .data,
    );
  }
  const taskPath = `${plan}/tasks/${tasks[0].id}`;
  check(
    'completes a task explicitly',
    (await request(taskPath, 'PATCH', { completed: true })).data.completed ===
      true,
  );
  await request(taskPath, 'PATCH', { completed: true });
  const page1 = await request(`${plan}/tasks?limit=1`);
  const page2 = await request(
    `${plan}/tasks?limit=1&cursor=${page1.data.nextCursor}`,
  );
  check(
    'task pagination does not repeat rows',
    page1.data.items.length === 1 &&
      page2.data.items[0].id !== page1.data.items[0].id,
  );
  const persisted = await request(plan);
  check(
    'progress counts all tasks, not just one page',
    persisted.data.totalTasks === 3 && persisted.data.completedTasks === 1,
  );
  const summary = await request('/summary');
  check(
    'summary aggregates task completion',
    summary.data.totalTasks === 3 && summary.data.completedTasks === 1,
  );
  check(
    'foreign task edit returns 404',
    (await request(taskPath, 'PATCH', { completed: false }, bob.accessToken))
      .status === 404,
  );
  check(
    'foreign task list returns 404',
    (await request(`${plan}/tasks`, 'GET', undefined, bob.accessToken))
      .status === 404,
  );
  check(
    'reopens a task',
    (
      await request(taskPath, 'PATCH', {
        completed: false,
        title: 'Review API contracts',
      })
    ).data.completed === false,
  );
  check(
    'rejects invalid dates',
    (await request(taskPath, 'PATCH', { dueDate: '2026-02-30' })).status ===
      400,
  );
  check(
    'rejects malformed cursors',
    (await request(`${plan}/tasks?cursor=garbage`)).status === 400,
  );
  const tomorrow = new Date(Date.now() + 86400000).toISOString();
  const later = new Date(Date.now() + 172800000).toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const interview = await request(`${plan}/interviews`, 'POST', {
    stage: 'technical',
    scheduledAt: tomorrow,
    notes: 'Bring questions',
  });
  const interviewPath = `${plan}/interviews/${interview.data.id}`;
  check('schedules an interview', interview.status === 201);
  check(
    'reschedules an interview',
    (await request(interviewPath, 'PATCH', { scheduledAt: later })).data
      .scheduledAt === later,
  );
  check(
    'foreign interview edit returns 404',
    (
      await request(
        interviewPath,
        'PATCH',
        { status: 'cancelled' },
        bob.accessToken,
      )
    ).status === 404,
  );
  const past = await request(`${plan}/interviews`, 'POST', {
    stage: 'behavioral',
    scheduledAt: yesterday,
  });
  const cancelled = await request(`${plan}/interviews`, 'POST', {
    stage: 'onsite',
    scheduledAt: tomorrow,
    status: 'cancelled',
  });
  const upcoming = await request('/interviews?view=upcoming');
  check(
    'upcoming excludes cancelled and past interviews',
    upcoming.data.items.length === 1 &&
      upcoming.data.items[0].id === interview.data.id,
  );
  const history = await request('/interviews?view=past');
  check(
    'history includes past scheduled and cancelled interviews',
    history.data.items.some((i) => i.id === past.data.id) &&
      history.data.items.some((i) => i.id === cancelled.data.id),
  );
  check(
    'next interview uses earliest scheduled future interview',
    (await request('/summary')).data.nextInterview.id === interview.data.id,
  );
  const earlier = await request(`${plan}/interviews`, 'POST', {
    stage: 'recruiter_screen',
    scheduledAt: tomorrow,
  });
  const ordered = await request('/interviews?view=upcoming');
  check(
    'schedule orders by interview time rather than creation order',
    ordered.data.items[0].id === earlier.data.id &&
      ordered.data.items[1].id === interview.data.id,
  );
  check(
    'summary updates when an earlier interview is added',
    (await request('/summary')).data.nextInterview.id === earlier.data.id,
  );
  await request(`${plan}/interviews/${earlier.data.id}`, 'PATCH', {
    status: 'completed',
  });
  check(
    'completing an interview removes it from upcoming',
    (await request('/interviews?view=upcoming')).data.items.length === 1,
  );
  check(
    'other user’s summary excludes private plans',
    (await request('/summary', 'GET', undefined, bob.accessToken)).data
      .planCount === 0,
  );
  check(
    'other user’s schedule excludes private interviews',
    (await request('/interviews', 'GET', undefined, bob.accessToken)).data.items
      .length === 0,
  );
  const disposable = await api('/api/collections', {
    method: 'POST',
    token: alice.accessToken,
    body: { name: 'Preparation temporary collection' },
  });
  await request(plan, 'PATCH', { collectionId: disposable.data.id });
  await api(`/api/collections/${disposable.data.id}`, {
    method: 'DELETE',
    token: alice.accessToken,
  });
  check(
    'plan remains editable after linked collection deletion',
    (await request(plan, 'PATCH', { name: 'Updated preparation' })).status ===
      200,
  );
  check(
    'deleted collection can be unlinked',
    (await request(plan, 'PATCH', { collectionId: null })).data.collectionId ===
      null,
  );
  check('deletes the plan', (await request(plan, 'DELETE')).status === 204);
  check('deleted plan cannot be read', (await request(plan)).status === 404);
  check(
    'cascaded question cannot be updated',
    (await request(questionPath, 'PATCH', { readiness: 'new' })).status === 404,
  );
  check(
    'plan deletion preserves study collection',
    (
      await api(`/api/collections/${collectionId}`, {
        token: alice.accessToken,
      })
    ).status === 200,
  );
  check(
    'plan deletion removes tasks from summary',
    (await request('/summary')).data.totalTasks === 0,
  );
  check(
    'plan deletion removes interviews from schedule',
    (await request('/interviews?view=past')).data.items.length === 0,
  );
  check(
    'cascaded task cannot be updated',
    (await request(taskPath, 'PATCH', { completed: true })).status === 404,
  );
  check(
    'cascaded interview cannot be updated',
    (await request(interviewPath, 'PATCH', { status: 'completed' })).status ===
      404,
  );
}
