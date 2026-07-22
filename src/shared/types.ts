export type ItemKind = 'task' | 'wish';
export type ItemStatus = 'open' | 'done';
export type Priority = 'low' | 'medium' | 'high';

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
  createdAt: string;
  completedAt: string | null;
}

export interface Category {
  id: number;
  name: string;
  color: string;
}

export interface ItemInput {
  title: string;
  note?: string;
  kind: ItemKind;
  priority?: Priority;
  dueDate?: string | null;
  categoryId?: number | null;
}
