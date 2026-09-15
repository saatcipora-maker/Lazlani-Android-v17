export const DEMO_DATASET_VERSION = 'lazlani-demo-v1';

export const DEMO_USER_IDS = new Set(['u1', 'u2', 'u3', 'u4', 'u5']);
export const PROTECTED_USER_IDS = new Set(['superadmin']);

export const DEMO_BOOK_IDS = new Set(['b1', 'b2', 'b3', 'b4', 'b5']);
export const DEMO_STORY_IDS = new Set(['s1', 's2', 's3']);
export const DEMO_POEM_IDS = new Set(['p1', 'p2', 'p3']);
export const DEMO_POST_IDS = new Set(['post0', 'post1', 'post2']);
export const DEMO_COMMENT_IDS = new Set(['c1', 'c2', 'pc1', 'pc2', 'r1', 'pr1']);
export const DEMO_NOTIFICATION_IDS = new Set(['n1', 'n2', 'n3', 'n4']);
export const DEMO_CONVERSATION_IDS = new Set(['conv1', 'conv2', 'conv3']);
export const DEMO_MESSAGE_IDS = new Set(['m1', 'm2', 'm3']);

export const DEMO_CONTENT_IDS = new Set([
  ...DEMO_BOOK_IDS,
  ...DEMO_STORY_IDS,
  ...DEMO_POEM_IDS,
  ...DEMO_POST_IDS,
]);

export const DEMO_DATA_ENABLED =
  __DEV__ && process.env.EXPO_PUBLIC_ENABLE_DEMO_DATA === 'true';