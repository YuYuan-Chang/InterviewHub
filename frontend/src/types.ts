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
  id: string;
  authorId: string;
  title: string;
  description: string;
  tags: string[];
  attachments: Attachment[];
  upvoteCount: number;
  commentCount: number;
  createdAt: string;
  author: AuthorSummary | null;
  viewerHasUpvoted: boolean;
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
