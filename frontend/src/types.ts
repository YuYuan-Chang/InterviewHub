import type { InterviewExperience } from './interview';

export interface AuthorSummary {
  userId: string;
  username: string;
  displayName: string;
  school?: string;
  avatarFileId?: string | null;
}

export interface Profile {
  userId: string;
  username: string;
  displayName: string;
  school: string;
  targetRoles: string[];
  bio: string;
  avatarFileId: string | null;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
}

export interface Attachment {
  fileId: string;
  name: string;
  mime: string;
  sizeBytes: number;
}

export interface Post {
  type: 'material' | 'experience';
  interviewExperience: InterviewExperience | null;
  id: string;
  authorId: string;
  title: string;
  description: string;
  tags: string[];
  attachments: Attachment[];
  resumeText: string | null;
  resumeVersion: number;
  upvoteCount: number;
  commentCount: number;
  createdAt: string;
  author: AuthorSummary | null;
  viewerHasUpvoted: boolean;
  viewerHasBookmarked: boolean;
}

export interface Collection {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  isPrivate: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  /** Only present when the list was fetched with ?postId= (the "Save to…" picker). */
  containsPost?: boolean;
}

export interface CommentNode {
  id: string;
  postId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  upvoteCount: number;
  createdAt: string;
  author: AuthorSummary | null;
  viewerHasUpvoted: boolean;
  replies: CommentNode[];
}

export interface AppNotification {
  id: string;
  type: 'new_follower' | 'new_comment' | 'new_reply';
  actorId: string;
  postId: string | null;
  commentId: string | null;
  read: boolean;
  createdAt: string;
  actor: AuthorSummary | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface ResumeRevision {
  id: string;
  postId: string;
  authorId: string;
  baseVersion: number;
  proposedText: string;
  patch: string;
  summary: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  resolvedAt: string | null;
  author: AuthorSummary | null;
}

export interface PreparationPlan {
  jobUrl: string;
  jobDescription: string;
  notes: string;
  id: string;
  name: string;
  company: string;
  role: string;
  collectionId: string | null;
  totalTasks: number;
  completedTasks: number;
}
export interface PreparationQuestion {
  id: string;
  planId: string;
  prompt: string;
  answer: string;
  readiness: 'new' | 'practicing' | 'ready';
  createdAt: string;
  updatedAt: string;
}
export interface PreparationTask {
  id: string;
  planId: string;
  title: string;
  dueDate: string | null;
  completed: boolean;
}
export interface PreparationInterview {
  id: string;
  planId: string;
  stage: keyof typeof import('./interview').INTERVIEW_STAGES;
  scheduledAt: string;
  notes: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  plan?: { name: string };
}
export interface PreparationSummary {
  planCount: number;
  totalTasks: number;
  completedTasks: number;
  nextInterview: PreparationInterview | null;
}
