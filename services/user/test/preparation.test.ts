import { describe, expect, it } from 'vitest';
import { encodeCursor } from '@interviewhub/shared';
import {
  cursorWhere,
  interviewSchema,
  planSchema,
  scheduleWhere,
  taskSchema,
  questionSchema,
} from '../src/preparation/schemas';

describe('preparation validation', () => {
  it('accepts web job URLs and rejects unsafe schemes and excessive fields', () => {
    for (const jobUrl of [
      '',
      'https://example.com/jobs/1',
      'http://example.com',
    ]) {
      expect(planSchema.safeParse({ name: 'Prep', jobUrl }).success).toBe(true);
    }
    for (const jobUrl of [
      'javascript:alert(1)',
      'file:///tmp/job',
      'invalid',
      `https://example.com/${'a'.repeat(2000)}`,
    ]) {
      expect(planSchema.safeParse({ name: 'Prep', jobUrl }).success).toBe(
        false,
      );
    }
    expect(
      planSchema.safeParse({ name: 'Prep', jobDescription: 'a'.repeat(20001) })
        .success,
    ).toBe(false);
    expect(
      planSchema.safeParse({ name: 'Prep', notes: 'a'.repeat(10001) }).success,
    ).toBe(false);
  });
  it('validates private questions and preserves omitted answer fields on edits', () => {
    expect(questionSchema.parse({ prompt: ' Why this role? ' })).toEqual({
      prompt: 'Why this role?',
      answer: '',
      readiness: 'new',
    });
    expect(questionSchema.partial().parse({ readiness: 'ready' })).toEqual({
      readiness: 'ready',
    });
    for (const input of [
      { prompt: ' ' },
      { prompt: 'a'.repeat(5001) },
      { prompt: 'Q', answer: 'a'.repeat(20001) },
      { prompt: 'Q', readiness: 'unknown' },
    ]) {
      expect(questionSchema.safeParse(input).success).toBe(false);
    }
  });
  it('normalizes a plan and keeps optional fields empty', () => {
    expect(planSchema.parse({ name: '  Backend prep  ' })).toEqual({
      name: 'Backend prep',
      company: '',
      role: '',
      collectionId: null,
      jobUrl: '',
      jobDescription: '',
      notes: '',
    });
    expect(planSchema.safeParse({ name: ' ' }).success).toBe(false);
    expect(
      planSchema.safeParse({ name: 'Prep', collectionId: 'invalid' }).success,
    ).toBe(false);
  });
  it('preserves omitted patch fields instead of applying create defaults', () => {
    expect(planSchema.partial().parse({ name: 'New' })).toEqual({
      name: 'New',
    });
    expect(taskSchema.partial().parse({ completed: true })).toEqual({
      completed: true,
    });
  });
  it('validates real calendar dates without timezone conversion', () => {
    expect(
      taskSchema.parse({ title: 'Practice', dueDate: '2028-02-29' }).dueDate,
    ).toBe('2028-02-29');
    for (const dueDate of [
      '2027-02-29',
      '2026-04-31',
      '2026-13-01',
      'tomorrow',
    ]) {
      expect(taskSchema.safeParse({ title: 'Practice', dueDate }).success).toBe(
        false,
      );
    }
  });
  it('requires explicit booleans and known interview stages/statuses', () => {
    expect(
      taskSchema.safeParse({ title: 'Task', completed: 'false' }).success,
    ).toBe(false);
    const valid = {
      stage: 'technical',
      scheduledAt: '2026-09-10T09:00:00+08:00',
    };
    expect(interviewSchema.parse(valid).status).toBe('scheduled');
    expect(
      interviewSchema.safeParse({ ...valid, stage: 'unknown' }).success,
    ).toBe(false);
    expect(
      interviewSchema.safeParse({ ...valid, scheduledAt: '2026-09-10T09:00' })
        .success,
    ).toBe(false);
  });
});

describe('preparation pagination and schedule', () => {
  it('uses the id to break equal timestamp ties and rejects incompatible cursors', () => {
    const id = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';
    const time = '2026-09-09T00:00:00.000Z';
    const cursor = encodeCursor({ id, time, field: 'createdAt' });
    expect(cursorWhere(cursor, 'createdAt')).toEqual({
      OR: [
        { createdAt: { gt: new Date(time) } },
        { createdAt: new Date(time), id: { gt: id } },
      ],
    });
    expect(() => cursorWhere(cursor, 'scheduledAt')).toThrow(
      'Malformed cursor',
    );
    expect(() => cursorWhere(encodeCursor({ id: 123 }), 'createdAt')).toThrow(
      'Malformed cursor',
    );
    expect(cursorWhere(undefined, 'createdAt')).toEqual({});
  });
  it('excludes cancelled interviews from upcoming and includes overdue scheduled interviews in past', () => {
    const now = new Date('2026-09-09T12:00:00Z');
    expect(scheduleWhere('upcoming', now)).toEqual({
      status: 'scheduled',
      scheduledAt: { gte: now },
    });
    expect(scheduleWhere('past', now)).toEqual({
      OR: [
        { scheduledAt: { lt: now } },
        { status: { in: ['completed', 'cancelled'] } },
      ],
    });
  });
});
