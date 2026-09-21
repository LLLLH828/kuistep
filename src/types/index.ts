// 数据库类型定义（与 schema.sql 对应）

export type Dimension = 'de' | 'zhi' | 'ti' | 'mei' | 'lao' | 'custom';
export type TaskStatus = 'pending' | 'submitted' | 'confirmed' | 'rejected';
export type TaskMode = 'required' | 'challenge';

export interface Family {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  user_id: string;
  role: 'parent' | 'child';
  nickname?: string;
  avatar_url?: string;
  is_primary: boolean;
}

export interface RewardAccount {
  id: string;
  child_member_id: string;
  total_points: number;
  lifetime_points: number;
  daily_points_earned: number;
  daily_points_spent: number;
  daily_reset_date: string;
}

export interface RewardTransaction {
  id: string;
  account_id: string;
  member_id: string;
  points: number;
  reason: string;
  dimension?: Dimension;
  custom_dimension_name?: string;
  source?: string;
  source_id?: string;
  created_by?: string;
  created_at: string;
}

export interface RewardTemplate {
  id: string;
  family_id: string;
  dimension: Dimension;
  custom_dimension_name?: string;
  item_name: string;
  points: number;
  is_decrease: boolean;
  is_active: boolean;
  sort_order: number;
  category?: string;
}

export interface RewardItem {
  id: string;
  family_id: string;
  child_member_id?: string;
  name: string;
  description?: string;
  points_required: number;
  category: 'material' | 'non-material';
  image_url?: string;
  stock?: number;
  is_active: boolean;
}

export interface Redemption {
  id: string;
  item_id: string;
  account_id: string;
  points_spent: number;
  status: 'pending' | 'fulfilled' | 'cancelled';
  fulfilled_by?: string;
  fulfilled_at?: string;
  created_at: string;
}

export interface Task {
  id: string;
  family_id: string;
  child_member_id: string;
  title: string;
  description?: string;
  dimension: Dimension;
  points_reward: number;
  mode: TaskMode;
  points_multiplier: number;
  due_date?: string;
  status: TaskStatus;
  ai_generated: boolean;
  source_text?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface TaskSubmission {
  id: string;
  task_id: string;
  submitted_by: string;
  content?: string;
  photo_urls?: string[];
  audio_url?: string;
  ai_score?: number;
  ai_feedback?: string;
  status: TaskStatus;
  confirmed_by?: string;
  confirmed_at?: string;
  created_at: string;
}

export interface WrongQuestion {
  id: string;
  family_id: string;
  child_member_id: string;
  subject: string;
  content: string;
  photo_url?: string;
  knowledge_point?: string;
  difficulty: number;
  review_count: number;
  last_reviewed_at?: string;
  next_review_at?: string;
  created_at: string;
}

// UI 辅助类型
export interface ChildWithAccount extends FamilyMember {
  account?: RewardAccount;
}

// 维度中文名映射
export const DIMENSION_LABELS: Record<Dimension, string> = {
  de: '德',
  zhi: '智',
  ti: '体',
  mei: '美',
  lao: '劳',
  custom: '自定义',
};

export const DIMENSION_COLORS: Record<Dimension, string> = {
  de: '#F59E0B',   // 琥珀
  zhi: '#3B82F6',  // 蓝
  ti: '#10B981',   // 绿
  mei: '#8B5CF6',  // 紫
  lao: '#EF4444',  // 红
  custom: '#6B7280',
};
