export type ItemKind = 'task' | 'wish';
export type ItemStatus = 'open' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export interface Item {
  id: number;
  title: string;
  note: string;
  kind: ItemKind;
  status: ItemStatus;
  priority: Priority;
  dueDate: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  projectId: number | null;
  projectName: string | null;
  projectColor: string | null;
  recurrence: Recurrence;
  reminderAt: string | null;
  sortOrder: number;
  createdAt: string;
  completedAt: string | null;
}

export interface Category {
  id: number;
  name: string;
  color: string;
}

export interface Project {
  id: number;
  name: string;
  color: string;
  archived: number;
}

export interface ItemInput {
  title: string;
  note?: string;
  kind: ItemKind;
  priority?: Priority;
  dueDate?: string | null;
  categoryId?: number | null;
  projectId?: number | null;
  recurrence?: Recurrence;
  reminderAt?: string | null;
  sortOrder?: number;
}

export interface ItemUpdateResult {
  item: Item;
  nextItem: Item | null;
}
