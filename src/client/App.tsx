import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Inbox,
  Download,
  Edit3,
  Folder,
  Archive,
  ArrowRight,
  BarChart3,
  Clock3,
  Database,
  LayoutList,
  ListChecks,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Repeat2,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Target,
  Palette,
  Trash2,
  Upload,
  RotateCcw,
  StickyNote,
  Pin,
  GripVertical,
  Flame,
  Trophy,
  Undo2,
  Eye,
  X,
} from 'lucide-react';
import type { Category, CustomList, DailyPlan, Item, ItemInput, ItemKind, ItemUpdateResult, Note, NoteColor, NoteInput, Priority, Project, Recurrence, SubtaskInput, TaskProgress } from '../shared/types';

type View = 'dashboard' | 'calendar' | 'today' | 'upcoming' | 'overdue' | 'tasks' | 'wishes' | 'notes' | 'lists' | 'done' | 'trash' | 'settings';
type Sort = 'smart' | 'due' | 'priority' | 'created';
type Accent = 'sage' | 'blue' | 'terracotta';
type Density = 'comfortable' | 'compact';
interface Preferences { defaultView: Exclude<View, 'settings' | 'trash'>; accent: Accent; density: Density; dailyGoal: number; foregroundNotifications: boolean }
interface PushPreferences { dueEnabled: boolean; dailyEnabled: boolean; dailyTime: string; quietStart: string; quietEnd: string; quietEnabled: boolean }

const progressCopy: Record<TaskProgress, string> = { not_started: '未着手', in_progress: '作業中', done: '完了' };
const progressClass: Record<TaskProgress, string> = { not_started: 'todo', in_progress: 'doing', done: 'done' };
const defaultPreferences: Preferences = { defaultView: 'today', accent: 'sage', density: 'comfortable', dailyGoal: 3, foregroundNotifications: true };
const accentColors: Record<Accent, { base: string; dark: string }> = {
  sage: { base: '#58634a', dark: '#414b36' },
  blue: { base: '#49677e', dark: '#354f64' },
  terracotta: { base: '#a75f50', dark: '#85483d' },
};

function loadPreferences(): Preferences {
  try { return { ...defaultPreferences, ...JSON.parse(localStorage.getItem('mymanager-preferences') ?? '{}') as Partial<Preferences> }; }
  catch { return defaultPreferences; }
}

const views: { id: View; label: string; icon: typeof Circle }[] = [
  { id: 'dashboard', label: 'ダッシュボード', icon: BarChart3 },
  { id: 'calendar', label: 'カレンダー', icon: CalendarDays },
  { id: 'today', label: '今日', icon: CalendarDays },
  { id: 'upcoming', label: '今後の予定', icon: CalendarDays },
  { id: 'overdue', label: '期限切れ', icon: Bell },
  { id: 'tasks', label: 'すべてのタスク', icon: LayoutList },
  { id: 'wishes', label: 'やりたいこと', icon: Sparkles },
  { id: 'notes', label: 'メモ', icon: StickyNote },
  { id: 'lists', label: 'リスト', icon: ListChecks },
  { id: 'done', label: '完了済み', icon: CheckCircle2 },
  { id: 'trash', label: 'ゴミ箱', icon: Trash2 },
  { id: 'settings', label: '設定', icon: SettingsIcon },
];

const viewCopy: Record<View, { title: string; subtitle: string }> = {
  dashboard: { title: 'ダッシュボード', subtitle: '今の状況と、次に取り組むことを見渡せます。' },
  calendar: { title: 'カレンダー', subtitle: '期限のあるタスクを、月ごとに見渡せます。' },
  today: { title: '今日', subtitle: '今日やることに、静かに集中しましょう。' },
  upcoming: { title: '今後の予定', subtitle: 'これから一週間の予定を見渡せます。' },
  overdue: { title: '期限切れ', subtitle: '残っていることを整理して、すっきりさせましょう。' },
  tasks: { title: 'すべてのタスク', subtitle: '予定していることをまとめて確認できます。' },
  wishes: { title: 'やりたいこと', subtitle: 'いつか叶えたいことを、忘れない場所へ。' },
  notes: { title: 'メモ', subtitle: '考えやアイデアを、すぐに書き留めておけます。' },
  lists: { title: 'リスト', subtitle: '買い物、持ち物、読みたい本など、自由なチェックリストを作れます。' },
  done: { title: '完了済み', subtitle: '積み重ねてきた成果です。' },
  trash: { title: 'ゴミ箱', subtitle: '削除した項目を復元したり、完全に削除できます。' },
  settings: { title: '設定', subtitle: '自分の使い方に合わせて、MyManagerを整えます。' },
};

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function localDateFromTimestamp(value: string) {
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateAfter(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function urlBase64ToUint8Array(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: '通信に失敗しました。' })) as { error?: string };
    throw new Error(payload.error ?? '通信に失敗しました。');
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

function NotePreview({ text }: { text: string }) {
  if (!text.trim()) return <p className="formatted-note-empty">メモはありません</p>;
  return <div className="formatted-note">{text.split('\n').map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return <br key={index} />;
    if (/^[-*]\s+/.test(trimmed)) return <p key={index} className="note-bullet">{trimmed.replace(/^[-*]\s+/, '')}</p>;
    if (/^\d+\.\s+/.test(trimmed)) return <p key={index} className="note-numbered"><span>{trimmed.match(/^\d+/)?.[0]}</span>{trimmed.replace(/^\d+\.\s+/, '')}</p>;
    if (/^#{1,3}\s+/.test(trimmed)) return <h3 key={index}>{trimmed.replace(/^#{1,3}\s+/, '')}</h3>;
    return <p key={index}>{line}</p>;
  })}</div>;
}

export function App() {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const [items, setItems] = useState<Item[]>([]);
  const [trashedItems, setTrashedItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [customLists, setCustomLists] = useState<CustomList[]>([]);
  const [dailyPlan, setDailyPlan] = useState<DailyPlan>({ date: localDate(), content: '', updatedAt: '' });
  const [view, setView] = useState<View>(() => loadPreferences().defaultView);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDate, setComposerDate] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [sort, setSort] = useState<Sort>('smart');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState<number | 'all'>('all');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoNotice, setUndoNotice] = useState<{ message: string; action: () => void } | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const undoHideTimer = useRef<number | null>(null);
  const pendingDelete = useRef<{ item: Item; timer: number } | null>(null);
  const draggedItemId = useRef<number | null>(null);

  useEffect(() => {
    Promise.all([request<Item[]>('/api/items'), request<Item[]>('/api/trash'), request<Category[]>('/api/categories'), request<Project[]>('/api/projects'), request<Note[]>('/api/notes'), request<CustomList[]>('/api/lists')])
      .then(([nextItems, nextTrash, nextCategories, nextProjects, nextNotes, nextLists]) => {
        setItems(nextItems);
        setTrashedItems(nextTrash);
        setCategories(nextCategories);
        setProjects(nextProjects);
        setNotes(nextNotes);
        setCustomLists(nextLists);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    request<DailyPlan>(`/api/daily-plans/${localDate()}`).then(setDailyPlan).catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    document.body.style.overflow = composerOpen || sidebarOpen || Boolean(detailItem) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [composerOpen, detailItem, sidebarOpen]);

  useEffect(() => {
    localStorage.setItem('mymanager-preferences', JSON.stringify(preferences));
    const colors = accentColors[preferences.accent];
    document.documentElement.style.setProperty('--green', colors.base);
    document.documentElement.style.setProperty('--green-dark', colors.dark);
  }, [preferences]);

  useEffect(() => () => {
    if (undoHideTimer.current) window.clearTimeout(undoHideTimer.current);
    if (pendingDelete.current) window.clearTimeout(pendingDelete.current.timer);
  }, []);

  useEffect(() => {
    if (!detailItem) return;
    const latest = items.find((item) => item.id === detailItem.id);
    if (latest && latest !== detailItem) setDetailItem(latest);
  }, [detailItem, items]);

  function showUndo(message: string, action: () => void) {
    if (undoHideTimer.current) window.clearTimeout(undoHideTimer.current);
    setUndoNotice({ message, action });
    undoHideTimer.current = window.setTimeout(() => setUndoNotice(null), 6_000);
  }

  function performUndo() {
    const notice = undoNotice;
    if (!notice) return;
    if (undoHideTimer.current) window.clearTimeout(undoHideTimer.current);
    setUndoNotice(null);
    notice.action();
  }

  const visibleItems = useMemo(() => {
    const today = localDate();
    const weekAhead = dateAfter(7);
    const filtered = items.filter((item) => {
      const matchesView =
        view === 'today' ? item.status === 'open' && item.kind === 'task' && item.dueDate === today
          : view === 'upcoming' ? item.status === 'open' && item.kind === 'task' && Boolean(item.dueDate && item.dueDate > today && item.dueDate <= weekAhead)
            : view === 'overdue' ? item.status === 'open' && item.kind === 'task' && Boolean(item.dueDate && item.dueDate < today)
          : view === 'tasks' ? item.status === 'open' && item.kind === 'task'
            : view === 'wishes' ? item.status === 'open' && item.kind === 'wish'
              : item.status === 'done';
      const needle = query.trim().toLocaleLowerCase('ja');
      const matchesSearch = !needle || `${item.title} ${item.note} ${item.categoryName ?? ''} ${item.projectName ?? ''}`.toLocaleLowerCase('ja').includes(needle);
      return matchesView && matchesSearch && (priorityFilter === 'all' || item.priority === priorityFilter) && (projectFilter === 'all' || item.projectId === projectFilter);
    });
    const priorityRank = { high: 0, medium: 1, low: 2 };
    return filtered.sort((a, b) => {
      if (sort === 'priority') return priorityRank[a.priority] - priorityRank[b.priority];
      if (sort === 'created') return b.createdAt.localeCompare(a.createdAt);
      if (sort === 'due') return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
      return a.sortOrder - b.sortOrder || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
    });
  }, [items, priorityFilter, projectFilter, query, sort, view]);

  const counts = useMemo(() => ({
    dashboard: 0,
    calendar: 0,
    today: items.filter((item) => item.status === 'open' && item.kind === 'task' && item.dueDate === localDate()).length,
    upcoming: items.filter((item) => item.status === 'open' && item.kind === 'task' && Boolean(item.dueDate && item.dueDate > localDate() && item.dueDate <= dateAfter(7))).length,
    overdue: items.filter((item) => item.status === 'open' && item.kind === 'task' && Boolean(item.dueDate && item.dueDate < localDate())).length,
    tasks: items.filter((item) => item.status === 'open' && item.kind === 'task').length,
    wishes: items.filter((item) => item.status === 'open' && item.kind === 'wish').length,
    notes: notes.length,
    lists: customLists.length,
    done: items.filter((item) => item.status === 'done').length,
    trash: trashedItems.length,
    settings: 0,
  }), [customLists, items, notes, trashedItems]);

  async function createItem(input: ItemInput) {
    try {
      if (input.reminderAt && 'Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
      const item = await request<Item>('/api/items', { method: 'POST', body: JSON.stringify(input) });
      setItems((current) => [item, ...current]);
      setComposerOpen(false);
      setView(item.kind === 'wish' ? 'wishes' : input.dueDate === localDate() ? 'today' : input.dueDate && input.dueDate > localDate() && input.dueDate <= dateAfter(7) ? 'upcoming' : 'tasks');
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function updateItem(input: ItemInput) {
    if (!editingItem) return;
    try {
      if (input.reminderAt && 'Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
      const result = await request<ItemUpdateResult>(`/api/items/${editingItem.id}`, { method: 'PATCH', body: JSON.stringify(input) });
      setItems((current) => current.map((item) => item.id === editingItem.id ? result.item : item));
      setEditingItem(null);
      setComposerOpen(false);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function createProject(name: string, color = '#6f7c64') {
    try {
      const project = await request<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ name, color }) });
      setProjects((current) => [...current, project].sort((a, b) => a.name.localeCompare(b.name, 'ja')));
      return project;
    } catch (reason) { setError((reason as Error).message); throw reason; }
  }

  async function createCategory(name: string, color: string) {
    try {
      const category = await request<Category>('/api/categories', { method: 'POST', body: JSON.stringify({ name, color }) });
      setCategories((current) => [...current, category].sort((a, b) => a.name.localeCompare(b.name, 'ja')));
    } catch (reason) { setError((reason as Error).message); throw reason; }
  }

  async function saveNote(input: NoteInput, id?: number) {
    try {
      const note = await request<Note>(id ? `/api/notes/${id}` : '/api/notes', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(input) });
      setNotes((current) => [note, ...current.filter((candidate) => candidate.id !== note.id)].sort((a, b) => b.pinned - a.pinned || b.updatedAt.localeCompare(a.updatedAt)));
    } catch (reason) { setError((reason as Error).message); throw reason; }
  }

  async function deleteNote(note: Note) {
    if (!window.confirm(`メモ「${note.title}」を削除しますか？`)) return;
    try {
      await request<void>(`/api/notes/${note.id}`, { method: 'DELETE' });
      setNotes((current) => current.filter((candidate) => candidate.id !== note.id));
    } catch (reason) { setError((reason as Error).message); }
  }

  function replaceList(list: CustomList) {
    setCustomLists((current) => [list, ...current.filter((candidate) => candidate.id !== list.id)].sort((a, b) => a.sortOrder - b.sortOrder || b.updatedAt.localeCompare(a.updatedAt)));
  }

  async function createCustomList(name: string, color: string) {
    try {
      const list = await request<CustomList>('/api/lists', { method: 'POST', body: JSON.stringify({ name, color }) });
      setCustomLists((current) => [...current, list].sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (reason) { setError((reason as Error).message); throw reason; }
  }

  async function updateCustomList(list: CustomList, input: { name?: string; color?: string }) {
    try { replaceList(await request<CustomList>(`/api/lists/${list.id}`, { method: 'PATCH', body: JSON.stringify(input) })); }
    catch (reason) { setError((reason as Error).message); throw reason; }
  }

  async function deleteCustomList(list: CustomList) {
    if (!window.confirm(`リスト「${list.name}」を削除しますか？`)) return;
    try {
      await request<void>(`/api/lists/${list.id}`, { method: 'DELETE' });
      setCustomLists((current) => current.filter((candidate) => candidate.id !== list.id));
    } catch (reason) { setError((reason as Error).message); }
  }

  async function addCustomListItem(list: CustomList, title: string) {
    try { replaceList(await request<CustomList>(`/api/lists/${list.id}/items`, { method: 'POST', body: JSON.stringify({ title }) })); }
    catch (reason) { setError((reason as Error).message); throw reason; }
  }

  async function updateCustomListItem(itemId: number, input: { title?: string; completed?: boolean }) {
    try { replaceList(await request<CustomList>(`/api/list-items/${itemId}`, { method: 'PATCH', body: JSON.stringify(input) })); }
    catch (reason) { setError((reason as Error).message); throw reason; }
  }

  async function deleteCustomListItem(itemId: number) {
    try { replaceList(await request<CustomList>(`/api/list-items/${itemId}`, { method: 'DELETE' })); }
    catch (reason) { setError((reason as Error).message); }
  }

  async function updateCategory(category: Category) {
    try {
      const updated = await request<Category>(`/api/categories/${category.id}`, { method: 'PATCH', body: JSON.stringify(category) });
      setCategories((current) => current.map((item) => item.id === updated.id ? updated : item).sort((a, b) => a.name.localeCompare(b.name, 'ja')));
      setItems((current) => current.map((item) => item.categoryId === updated.id ? { ...item, categoryName: updated.name, categoryColor: updated.color } : item));
    } catch (reason) { setError((reason as Error).message); throw reason; }
  }

  async function deleteCategory(category: Category) {
    if (!window.confirm(`カテゴリ「${category.name}」を削除しますか？\nタスク自体は削除されません。`)) return;
    try {
      await request<void>(`/api/categories/${category.id}`, { method: 'DELETE' });
      setCategories((current) => current.filter((item) => item.id !== category.id));
      setItems((current) => current.map((item) => item.categoryId === category.id ? { ...item, categoryId: null, categoryName: null, categoryColor: null } : item));
    } catch (reason) { setError((reason as Error).message); }
  }

  async function updateProject(project: Project) {
    try {
      const updated = await request<Project>(`/api/projects/${project.id}`, { method: 'PATCH', body: JSON.stringify(project) });
      setProjects((current) => updated.archived ? current.filter((item) => item.id !== updated.id) : current.map((item) => item.id === updated.id ? updated : item).sort((a, b) => a.name.localeCompare(b.name, 'ja')));
      setItems((current) => current.map((item) => item.projectId === updated.id ? { ...item, projectName: updated.name, projectColor: updated.color } : item));
    } catch (reason) { setError((reason as Error).message); throw reason; }
  }

  async function deleteProject(project: Project) {
    if (!window.confirm(`プロジェクト「${project.name}」を削除しますか？\nタスク自体は削除されません。`)) return;
    try {
      await request<void>(`/api/projects/${project.id}`, { method: 'DELETE' });
      setProjects((current) => current.filter((item) => item.id !== project.id));
      setItems((current) => current.map((item) => item.projectId === project.id ? { ...item, projectId: null, projectName: null, projectColor: null } : item));
    } catch (reason) { setError((reason as Error).message); }
  }

  async function quickAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!quickTitle.trim()) return;
    const title = quickTitle;
    setQuickTitle('');
    await createItem({ title, kind: view === 'wishes' ? 'wish' : 'task', dueDate: view === 'today' ? localDate() : view === 'upcoming' ? dateAfter(1) : null });
  }

  async function clearCompleted() {
    if (!window.confirm('完了済みの項目をすべてゴミ箱へ移動しますか？')) return;
    try {
      await request<{ deleted: number }>('/api/items?status=done', { method: 'DELETE' });
      setItems((current) => current.filter((item) => item.status !== 'done'));
      setTrashedItems(await request<Item[]>('/api/trash'));
    } catch (reason) { setError((reason as Error).message); }
  }

  function openNew(date?: string) {
    setEditingItem(null);
    setComposerDate(date ?? null);
    setComposerOpen(true);
  }

  function openEdit(item: Item) {
    setEditingItem(item);
    setDetailItem(null);
    setComposerDate(null);
    setComposerOpen(true);
  }

  function openDetail(item: Item) {
    setDetailItem(item);
    setComposerOpen(false);
    setEditingItem(null);
  }

  async function saveDailyPlan(content: string) {
    const previous = dailyPlan;
    const optimistic = { ...dailyPlan, content };
    setDailyPlan(optimistic);
    try {
      setDailyPlan(await request<DailyPlan>(`/api/daily-plans/${dailyPlan.date}`, { method: 'PUT', body: JSON.stringify({ content }) }));
    } catch (reason) {
      setDailyPlan(previous);
      setError((reason as Error).message);
    }
  }

  async function updateItemProgress(item: Item, progress: TaskProgress) {
    const previous = item;
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, progress, status: progress === 'done' ? 'done' : 'open' } : candidate));
    try {
      const result = await request<ItemUpdateResult>(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ progress }) });
      setItems((current) => current.map((candidate) => candidate.id === item.id ? result.item : candidate));
    } catch (reason) {
      setItems((current) => current.map((candidate) => candidate.id === item.id ? previous : candidate));
      setError((reason as Error).message);
    }
  }

  async function toggleItem(item: Item) {
    const status = item.status === 'done' ? 'open' : 'done';
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, status, progress: status === 'done' ? 'done' : 'not_started' } : candidate));
    try {
      const result = await request<ItemUpdateResult>(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setItems((current) => {
        const updated = current.map((candidate) => candidate.id === item.id ? result.item : candidate);
        return result.nextItem ? [result.nextItem, ...updated] : updated;
      });
      if (status === 'done') {
        const completedToday = items.filter((candidate) => candidate.status === 'done' && candidate.completedAt && localDateFromTimestamp(candidate.completedAt) === localDate()).length;
        if (completedToday < preferences.dailyGoal && completedToday + 1 >= preferences.dailyGoal) {
          setCelebrating(true); window.setTimeout(() => setCelebrating(false), 2_400);
        }
      }
      if (status === 'done') showUndo('タスクを完了しました', () => {
        void (async () => {
          try {
            const reopened = await request<ItemUpdateResult>(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'open' }) });
            if (result.nextItem) await request<void>(`/api/items/${result.nextItem.id}?permanent=true`, { method: 'DELETE' });
            setItems((current) => current.filter((candidate) => candidate.id !== result.nextItem?.id).map((candidate) => candidate.id === item.id ? reopened.item : candidate));
          } catch (reason) { setError((reason as Error).message); }
        })();
      });
    } catch (reason) {
      setItems((current) => current.map((candidate) => candidate.id === item.id ? item : candidate));
      setError((reason as Error).message);
    }
  }

  async function updateSubtasks(item: Item, subtasks: SubtaskInput[]) {
    const previous = item;
    try {
      const result = await request<ItemUpdateResult>(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ subtasks }) });
      setItems((current) => current.map((candidate) => candidate.id === item.id ? result.item : candidate));
    } catch (reason) {
      setItems((current) => current.map((candidate) => candidate.id === item.id ? previous : candidate));
      setError((reason as Error).message);
    }
  }

  async function reorderItems(targetId: number) {
    const sourceId = draggedItemId.current;
    draggedItemId.current = null;
    if (!sourceId || sourceId === targetId) return;
    const sourceIndex = items.findIndex((item) => item.id === sourceId);
    const targetIndex = items.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const previous = items;
    const next = [...items];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    setItems(next.map((item, index) => ({ ...item, sortOrder: index })));
    setSort('smart');
    try { await request('/api/reorder/items', { method: 'PATCH', body: JSON.stringify({ ids: next.map((item) => item.id) }) }); }
    catch (reason) { setItems(previous); setError((reason as Error).message); }
  }

  async function sendToTrash(item: Item) {
    const trashed = await request<Item>(`/api/items/${item.id}`, { method: 'DELETE' });
    setTrashedItems((current) => [trashed, ...current.filter((candidate) => candidate.id !== trashed.id)]);
  }

  function removeItem(item: Item) {
    if (pendingDelete.current) {
      window.clearTimeout(pendingDelete.current.timer);
      void sendToTrash(pendingDelete.current.item).catch((reason: Error) => setError(reason.message));
      pendingDelete.current = null;
    }
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    const timer = window.setTimeout(() => {
      void sendToTrash(item).catch((reason: Error) => {
        setItems((current) => [item, ...current]);
        setError(reason.message);
      });
      pendingDelete.current = null;
    }, 6_000);
    pendingDelete.current = { item, timer };
    showUndo('タスクを削除しました', () => {
      if (pendingDelete.current?.item.id === item.id) {
        window.clearTimeout(pendingDelete.current.timer);
        pendingDelete.current = null;
        setItems((current) => [item, ...current]);
      }
    });
  }

  async function restoreTrashItem(item: Item) {
    try {
      const restored = await request<Item>(`/api/items/${item.id}/restore`, { method: 'POST' });
      setTrashedItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setItems((current) => [restored, ...current]);
    } catch (reason) { setError((reason as Error).message); }
  }

  async function permanentlyDelete(item: Item) {
    if (!window.confirm(`「${item.title}」を完全に削除しますか？\nこの操作は元に戻せません。`)) return;
    try {
      await request<void>(`/api/items/${item.id}?permanent=true`, { method: 'DELETE' });
      setTrashedItems((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch (reason) { setError((reason as Error).message); }
  }

  async function emptyTrash() {
    if (!trashedItems.length || !window.confirm('ゴミ箱を空にしますか？\nこの操作は元に戻せません。')) return;
    try {
      await request<{ deleted: number }>('/api/trash', { method: 'DELETE' });
      setTrashedItems([]);
    } catch (reason) { setError((reason as Error).message); }
  }

  async function restoreBackup(file: File) {
    if (!window.confirm(`「${file.name}」から復元しますか？\n現在のデータは復元前バックアップとして自動保存されます。`)) return;
    try {
      const backupResponse = await fetch('/api/export');
      if (!backupResponse.ok) throw new Error('復元前バックアップの作成に失敗しました。');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(await backupResponse.blob());
      link.download = `mymanager-before-restore-${localDate()}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      const data = JSON.parse(await file.text()) as unknown;
      await request('/api/import', { method: 'POST', body: JSON.stringify(data) });
      const [nextItems, nextTrash, nextCategories, nextProjects, nextNotes, nextLists] = await Promise.all([request<Item[]>('/api/items'), request<Item[]>('/api/trash'), request<Category[]>('/api/categories'), request<Project[]>('/api/projects'), request<Note[]>('/api/notes'), request<CustomList[]>('/api/lists')]);
      setItems(nextItems); setTrashedItems(nextTrash); setCategories(nextCategories); setProjects(nextProjects); setNotes(nextNotes); setCustomLists(nextLists);
      window.alert('バックアップを復元しました。');
    } catch (reason) { setError(reason instanceof SyntaxError ? 'JSONファイルの形式が正しくありません。' : (reason as Error).message); }
  }

  function navigate(next: View) {
    setView(next);
    setSidebarOpen(false);
  }

  useEffect(() => {
    if (!preferences.foregroundNotifications || !('Notification' in window) || Notification.permission !== 'granted') return;
    const check = () => {
      const notified = new Set(JSON.parse(sessionStorage.getItem('mymanager-notified') ?? '[]') as number[]);
      const now = new Date().toISOString().slice(0, 16);
      items.filter((item) => item.status === 'open' && item.reminderAt && item.reminderAt <= now && !notified.has(item.id)).forEach((item) => {
        new Notification('MyManager', { body: item.title, icon: '/icons/icon.svg' });
        notified.add(item.id);
      });
      sessionStorage.setItem('mymanager-notified', JSON.stringify([...notified]));
    };
    check();
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, [items, preferences.foregroundNotifications]);

  return (
    <div className={`app-shell density-${preferences.density}`}>
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="brand"><span className="brand-mark"><Check size={18} /></span><span>MyManager</span></div>
        <nav className="nav-list" aria-label="メインメニュー">
          <p className="nav-label">管理</p>
          {views.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${view === id ? 'nav-item--active' : ''}`} onClick={() => navigate(id)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span><span className="nav-count">{id === 'settings' || id === 'dashboard' || id === 'calendar' ? '' : counts[id]}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="sidebar-note-icon"><Sparkles size={16} /></span>
          <div><strong>小さな一歩から</strong><p>今日できることを一つずつ。</p></div>
        </div>
      </aside>

      {sidebarOpen && <button className="scrim" aria-label="メニューを閉じる" onClick={() => setSidebarOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="メニュー"><Menu size={21} /></button>
          {!['settings', 'dashboard', 'calendar', 'trash', 'notes', 'lists'].includes(view) ? <div className="search-wrap"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="タスクを検索..." aria-label="検索" />{query && <button onClick={() => setQuery('')} aria-label="検索をクリア"><X size={15} /></button>}</div> : <div className="topbar-context">{view === 'settings' ? <SettingsIcon size={17} /> : view === 'calendar' ? <CalendarDays size={17} /> : view === 'trash' ? <Trash2 size={17} /> : view === 'notes' ? <StickyNote size={17} /> : view === 'lists' ? <ListChecks size={17} /> : <BarChart3 size={17} />}{view === 'settings' ? '環境設定' : view === 'calendar' ? '月間予定' : view === 'trash' ? '削除済み' : view === 'notes' ? 'アイデアノート' : view === 'lists' ? '自由リスト' : '全体サマリー'}</div>}
          {!['settings', 'trash', 'notes', 'lists'].includes(view) && <div className="top-actions"><a className="export-button" href="/api/export" download title="データを書き出す"><Download size={17} /></a><button className="add-button" onClick={() => openNew()}><Plus size={18} /><span>新しく追加</span></button></div>}
        </header>

        <section className="content">
          <div className="page-heading">
            <div><p className="eyebrow">MY MANAGER</p><h1>{viewCopy[view].title}</h1><p>{viewCopy[view].subtitle}</p></div>
            <div className="date-card"><CalendarDays size={18} /><span>{new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</span></div>
          </div>

          {view === 'dashboard' ? <DashboardPanel items={items} projects={projects} dailyGoal={preferences.dailyGoal} dailyPlan={dailyPlan} onSaveDailyPlan={saveDailyPlan} onNavigate={navigate} onOpen={openDetail} /> : view === 'calendar' ? <CalendarPanel items={items} onAddDate={openNew} onOpen={openDetail} /> : view === 'notes' ? <NotesPanel notes={notes} onSave={saveNote} onDelete={deleteNote} /> : view === 'lists' ? <ListsPanel lists={customLists} onCreate={createCustomList} onUpdate={updateCustomList} onDelete={deleteCustomList} onAddItem={addCustomListItem} onUpdateItem={updateCustomListItem} onDeleteItem={deleteCustomListItem} /> : view === 'trash' ? <TrashPanel items={trashedItems} onRestore={restoreTrashItem} onDelete={permanentlyDelete} onEmpty={emptyTrash} /> : view === 'settings' ? <SettingsPanel categories={categories} projects={projects} preferences={preferences} completedCount={counts.done} trashCount={counts.trash} onPreferencesChange={setPreferences} onCreateCategory={createCategory} onUpdateCategory={updateCategory} onDeleteCategory={deleteCategory} onCreateProject={async (name, color) => { await createProject(name, color); }} onUpdateProject={updateProject} onDeleteProject={deleteProject} onClearCompleted={clearCompleted} onOpenTrash={() => navigate('trash')} onRestoreBackup={restoreBackup} /> : <>
          <div className="summary-strip" aria-label="進捗サマリー">
            <button onClick={() => navigate('today')}><span>今日</span><strong>{counts.today}</strong></button>
            <button onClick={() => navigate('upcoming')}><span>今後7日</span><strong>{counts.upcoming}</strong></button>
            <button className={counts.overdue ? 'danger' : ''} onClick={() => navigate('overdue')}><span>期限切れ</span><strong>{counts.overdue}</strong></button>
            <button onClick={() => navigate('done')}><span>完了</span><strong>{counts.done}</strong></button>
          </div>

          {view === 'today' && <DailyPlanCard plan={dailyPlan} onSave={saveDailyPlan} compact />}
          <div className="list-card">
            {view !== 'done' && view !== 'overdue' && <form className="quick-add" onSubmit={quickAdd}><Plus size={17} /><input value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder={view === 'wishes' ? 'やりたいことをすぐ追加…' : 'タスクをすぐ追加…'} aria-label="クイック追加" /><button disabled={!quickTitle.trim()}>追加</button></form>}
            <div className="filter-bar"><SlidersHorizontal size={15} /><select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="並び順"><option value="smart">おすすめ順</option><option value="due">期限順</option><option value="priority">優先度順</option><option value="created">新しい順</option></select><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as Priority | 'all')} aria-label="優先度で絞り込み"><option value="all">すべての優先度</option><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select><select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))} aria-label="プロジェクトで絞り込み"><option value="all">すべてのプロジェクト</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></div>
            <div className="list-header"><span>{visibleItems.length}件</span>{view === 'done' ? <button className="clear-done" onClick={clearCompleted}><Trash2 size={14} />すべて削除</button> : <span className="sort-label"><span>整理済み</span><ChevronDown size={15} /></span>}</div>
            {loading ? <LoadingRows /> : visibleItems.length ? (
              <div className="item-list">
                {visibleItems.map((item) => <ItemRow key={item.id} item={item} onToggle={toggleItem} onUpdateSubtasks={updateSubtasks} onUpdateProgress={updateItemProgress} onRemove={removeItem} onOpen={openDetail} onEdit={openDetail} onDragStart={() => { draggedItemId.current = item.id; }} onDrop={() => void reorderItems(item.id)} />)}
              </div>
            ) : <EmptyState view={view} hasQuery={Boolean(query)} onAdd={openNew} />}
          </div>
          </>}
        </section>
      </main>

      <nav className="bottom-nav" aria-label="スマートフォン用メニュー">
        {views.filter(({ id }) => ['dashboard', 'today', 'tasks', 'lists', 'notes', 'settings'].includes(id)).map(({ id, label, icon: Icon }) => (
          <button key={id} className={view === id ? 'active' : ''} onClick={() => navigate(id)} aria-current={view === id ? 'page' : undefined}>
            <span className="bottom-nav-icon"><Icon size={20} strokeWidth={1.8} />{counts[id] > 0 && <i>{counts[id] > 99 ? '99+' : counts[id]}</i>}</span>
            <span>{id === 'tasks' ? 'タスク' : id === 'wishes' ? 'やりたい' : id === 'upcoming' ? '予定' : label}</span>
          </button>
        ))}
      </nav>

      {!['settings', 'trash', 'notes', 'lists'].includes(view) && <button className="mobile-fab" onClick={() => openNew()} aria-label="新しい項目を追加"><Plus size={24} /></button>}
      {detailItem && <TaskDetailModal item={detailItem} onClose={() => setDetailItem(null)} onEdit={openEdit} onToggle={toggleItem} onUpdateProgress={updateItemProgress} />}
      {composerOpen && <Composer categories={categories} projects={projects} initialItem={editingItem} defaultKind={view === 'wishes' ? 'wish' : 'task'} defaultDate={composerDate ?? (view === 'today' ? localDate() : null)} onClose={() => { setComposerOpen(false); setEditingItem(null); setComposerDate(null); }} onSubmit={editingItem ? updateItem : createItem} onCreateProject={createProject} />}
      {undoNotice && <div className="undo-toast" role="status"><span>{undoNotice.message}</span><button onClick={performUndo}><Undo2 size={15} />元に戻す</button></div>}
      {celebrating && <div className="celebration" aria-live="polite"><Trophy size={34} /><strong>今日の目標達成！</strong><span>{Array.from({ length: 18 }, (_, index) => <i key={index} />)}</span></div>}
      {error && <div className="toast" role="alert"><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}
    </div>
  );
}

function TaskDetailModal({ item, onClose, onEdit, onToggle, onUpdateProgress }: { item: Item; onClose: () => void; onEdit: (item: Item) => void; onToggle: (item: Item) => void; onUpdateProgress: (item: Item, progress: TaskProgress) => Promise<void> }) {
  const dateLabel = item.dueDate ? new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${item.dueDate}T00:00:00`)) : '期限なし';
  const timeLabel = item.kind === 'task' && item.dueDate ? item.allDay ? '終日' : [item.startTime, item.endTime].filter(Boolean).join(' - ') || '時刻未設定' : null;
  const completedSubtasks = item.subtasks.filter((subtask) => subtask.completed).length;

  useEffect(() => {
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [onClose]);

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="task-detail-modal" role="dialog" aria-modal="true" aria-labelledby="task-detail-title">
      <div className="composer-header"><div><p className="eyebrow">{item.kind === 'wish' ? 'WISH DETAIL' : 'TASK DETAIL'}</p><h2 id="task-detail-title">{item.title}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></div>
      <div className="detail-actions">
        {item.kind === 'task' && <select className={`progress-select progress-${progressClass[item.progress]}`} value={item.progress} onChange={(event) => void onUpdateProgress(item, event.target.value as TaskProgress)} aria-label="進捗">{(Object.keys(progressCopy) as TaskProgress[]).map((value) => <option key={value} value={value}>{progressCopy[value]}</option>)}</select>}
        <button type="button" className="secondary-button" onClick={() => onToggle(item)}>{item.status === 'done' ? '未完了に戻す' : '完了にする'}</button>
        <button type="button" className="primary-button" onClick={() => onEdit(item)}><Edit3 size={15} />編集</button>
      </div>
      <div className="detail-meta-grid">
        <span><CalendarDays size={15} /><strong>{dateLabel}</strong></span>
        {timeLabel && <span><Clock3 size={15} /><strong>{timeLabel}</strong></span>}
        {item.projectName && <span><Folder size={15} /><strong>{item.projectName}</strong></span>}
        {item.categoryName && <span><Tags size={15} /><strong>{item.categoryName}</strong></span>}
        <span><Target size={15} /><strong>{item.priority === 'high' ? '優先度：高' : item.priority === 'medium' ? '優先度：中' : '優先度：低'}</strong></span>
      </div>
      <section className="detail-section"><h3>メモ</h3><NotePreview text={item.note} /></section>
      {item.subtasks.length > 0 && <section className="detail-section"><h3>サブタスク <small>{completedSubtasks}/{item.subtasks.length}</small></h3><div className="detail-subtasks">{item.subtasks.map((subtask) => <div key={subtask.id} className={subtask.completed ? 'done' : ''}><i>{Boolean(subtask.completed) && <Check size={11} />}</i><span>{subtask.title}</span>{subtask.dueDate && <small>{new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(new Date(`${subtask.dueDate}T00:00:00`))}</small>}</div>)}</div></section>}
    </section>
  </div>;
}

function CalendarPanel({ items, onAddDate, onOpen }: { items: Item[]; onAddDate: (date: string) => void; onOpen: (item: Item) => void }) {
  const [month, setMonth] = useState(() => { const date = new Date(); date.setDate(1); return date; });
  const [selectedDate, setSelectedDate] = useState(localDate());
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const gridStart = new Date(firstDay);
  gridStart.setDate(gridStart.getDate() - ((firstDay.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { date, key, items: items.filter((item) => item.dueDate === key && item.kind === 'task') };
  });
  const selectedItems = items.filter((item) => item.dueDate === selectedDate && item.kind === 'task').sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'));

  function changeMonth(offset: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return <div className="calendar-layout">
    <section className="calendar-card">
      <div className="calendar-toolbar"><button onClick={() => changeMonth(-1)} aria-label="前の月"><ChevronLeft size={18} /></button><div><strong>{year}年 {monthIndex + 1}月</strong><button onClick={() => { const now = new Date(); now.setDate(1); setMonth(now); setSelectedDate(localDate()); }}>今日へ戻る</button></div><button onClick={() => changeMonth(1)} aria-label="次の月"><ChevronRight size={18} /></button></div>
      <div className="calendar-weekdays">{['月', '火', '水', '木', '金', '土', '日'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">{days.map((day) => <div key={day.key} className={`calendar-day ${day.date.getMonth() !== monthIndex ? 'outside' : ''} ${day.key === selectedDate ? 'selected' : ''} ${day.key === localDate() ? 'today' : ''}`}><button className="calendar-day-number" onClick={() => setSelectedDate(day.key)}>{day.date.getDate()}</button><div className="calendar-day-items">{day.items.slice(0, 3).map((item) => <button key={item.id} className={item.status === 'done' ? 'done' : ''} onClick={() => onOpen(item)}><i style={{ background: item.projectColor ?? item.categoryColor ?? '#657153' }} /><span>{item.title}</span></button>)}{day.items.length > 3 && <small>ほか{day.items.length - 3}件</small>}</div><span className="calendar-mobile-count">{day.items.length > 0 && day.items.length}</span></div>)}</div>
    </section>
    <aside className="calendar-agenda">
      <div className="calendar-agenda-header"><div><p className="eyebrow">SELECTED DAY</p><h2>{new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${selectedDate}T00:00:00`))}</h2></div><button onClick={() => onAddDate(selectedDate)}><Plus size={16} />追加</button></div>
      <div className="calendar-agenda-list">{selectedItems.length ? selectedItems.map((item) => <button key={item.id} onClick={() => onOpen(item)}><i className={item.status === 'done' ? 'done' : ''}>{item.status === 'done' && <Check size={11} />}</i><span><strong>{item.title}</strong><small>{item.projectName ?? item.categoryName ?? (item.priority === 'high' ? '優先度：高' : 'タスク')}</small></span><ChevronRight size={14} /></button>) : <DashboardEmpty icon={<CalendarDays size={19} />} text="この日のタスクはありません" />}</div>
    </aside>
  </div>;
}

function DashboardPanel({ items, projects, dailyGoal, dailyPlan, onSaveDailyPlan, onNavigate, onOpen }: { items: Item[]; projects: Project[]; dailyGoal: number; dailyPlan: DailyPlan; onSaveDailyPlan: (content: string) => Promise<void>; onNavigate: (view: View) => void; onOpen: (item: Item) => void }) {
  const today = localDate();
  const openTasks = items.filter((item) => item.kind === 'task' && item.status === 'open');
  const completedItems = items.filter((item) => item.status === 'done');
  const completedThisWeek = completedItems.filter((item) => item.completedAt && localDateFromTimestamp(item.completedAt) >= dateAfter(-6));
  const completedToday = completedItems.filter((item) => item.completedAt && localDateFromTimestamp(item.completedAt) === today).length;
  const completedDates = new Set(completedItems.flatMap((item) => item.completedAt ? [localDateFromTimestamp(item.completedAt)] : []));
  let streak = 0;
  for (let offset = completedDates.has(today) ? 0 : 1; completedDates.has(dateAfter(-offset)); offset += 1) streak += 1;
  const todayCount = openTasks.filter((item) => item.dueDate === today).length;
  const overdueCount = openTasks.filter((item) => item.dueDate && item.dueDate < today).length;
  const completionRate = items.length ? Math.round((completedItems.length / items.length) * 100) : 0;
  const upcoming = openTasks.filter((item) => item.dueDate && item.dueDate >= today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!)).slice(0, 5);
  const wishes = items.filter((item) => item.kind === 'wish' && item.status === 'open').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = dateAfter(index - 6);
    return {
      date,
      label: new Intl.DateTimeFormat('ja-JP', { weekday: 'short' }).format(new Date(`${date}T00:00:00`)),
      count: completedItems.filter((item) => item.completedAt && localDateFromTimestamp(item.completedAt) === date).length,
    };
  });
  const maxCompleted = Math.max(1, ...week.map((day) => day.count));
  const projectProgress = projects.map((project) => {
    const related = items.filter((item) => item.projectId === project.id);
    const done = related.filter((item) => item.status === 'done').length;
    return { project, total: related.length, done, percent: related.length ? Math.round((done / related.length) * 100) : 0 };
  }).filter((entry) => entry.total > 0).sort((a, b) => b.total - a.total).slice(0, 5);

  return <div className="dashboard">
    <div className="dashboard-metrics">
      <button onClick={() => onNavigate('tasks')}><span className="metric-icon"><LayoutList size={18} /></span><div><small>未完了タスク</small><strong>{openTasks.length}</strong><em>件</em></div><ArrowRight size={15} /></button>
      <button onClick={() => onNavigate('today')}><span className="metric-icon"><Target size={18} /></span><div><small>今日やること</small><strong>{todayCount}</strong><em>件</em></div><ArrowRight size={15} /></button>
      <button className={overdueCount ? 'metric-danger' : ''} onClick={() => onNavigate('overdue')}><span className="metric-icon"><Bell size={18} /></span><div><small>期限切れ</small><strong>{overdueCount}</strong><em>件</em></div><ArrowRight size={15} /></button>
      <button onClick={() => onNavigate('done')}><span className="metric-icon"><CheckCircle2 size={18} /></span><div><small>全体の完了率</small><strong>{completionRate}</strong><em>%</em></div><ArrowRight size={15} /></button>
    </div>

    <section className={`motivation-card ${completedToday >= dailyGoal ? 'goal-complete' : ''}`}>
      <div className="goal-ring" style={{ '--goal-progress': `${Math.min(100, (completedToday / Math.max(1, dailyGoal)) * 100)}%` } as React.CSSProperties}><span><strong>{completedToday}</strong><small>/{dailyGoal}</small></span></div>
      <div><p className="eyebrow">TODAY'S MOMENTUM</p><h2>{completedToday >= dailyGoal ? '今日の目標を達成しました！' : completedToday ? 'いい流れです。その調子。' : '小さな一歩から始めましょう。'}</h2><p>{completedToday >= dailyGoal ? '積み重ねが、確かな前進になっています。' : `あと${Math.max(0, dailyGoal - completedToday)}件で今日の目標です。`}</p></div>
      <div className="streak-badge"><Flame size={20} /><span><strong>{streak}</strong><small>日連続</small></span></div>
      {completedToday >= dailyGoal && <Trophy className="goal-trophy" size={25} />}
    </section>

    <DailyPlanCard plan={dailyPlan} onSave={onSaveDailyPlan} />

    <div className="dashboard-layout">
      <section className="dashboard-card dashboard-card--activity">
        <div className="dashboard-card-header"><div><p className="eyebrow">ACTIVITY</p><h2>直近7日の完了</h2></div><span className="activity-total"><strong>{completedThisWeek.length}</strong>件完了</span></div>
        <div className="week-chart">{week.map((day) => <div className="chart-column" key={day.date}><span className="chart-value">{day.count || ''}</span><div className="chart-track"><i style={{ height: `${Math.max(day.count ? 14 : 3, (day.count / maxCompleted) * 100)}%` }} /></div><small>{day.label}</small></div>)}</div>
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-header"><div><p className="eyebrow">UPCOMING</p><h2>次の予定</h2></div><button onClick={() => onNavigate('upcoming')}>すべて見る<ArrowRight size={13} /></button></div>
        <div className="dashboard-list">{upcoming.length ? upcoming.map((item) => <button key={item.id} onClick={() => onOpen(item)}><span className="dashboard-date"><strong>{new Date(`${item.dueDate}T00:00:00`).getDate()}</strong><small>{new Intl.DateTimeFormat('ja-JP', { month: 'short' }).format(new Date(`${item.dueDate}T00:00:00`))}</small></span><span className="dashboard-list-body"><strong>{item.title}</strong><small>{item.projectName ?? item.categoryName ?? 'タスク'}</small></span><ArrowRight size={14} /></button>) : <DashboardEmpty icon={<CalendarDays size={19} />} text="予定されているタスクはありません" />}</div>
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-header"><div><p className="eyebrow">PROJECTS</p><h2>プロジェクト進捗</h2></div><button onClick={() => onNavigate('settings')}>管理<SettingsIcon size={13} /></button></div>
        <div className="project-progress-list">{projectProgress.length ? projectProgress.map(({ project, total, done, percent }) => <div key={project.id}><div className="project-progress-meta"><span><i style={{ background: project.color }} />{project.name}</span><small>{done}/{total} · {percent}%</small></div><div className="progress-track"><i style={{ width: `${percent}%`, background: project.color }} /></div></div>) : <DashboardEmpty icon={<Folder size={19} />} text="タスクのあるプロジェクトはまだありません" />}</div>
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-header"><div><p className="eyebrow">SOMEDAY</p><h2>やりたいこと</h2></div><button onClick={() => onNavigate('wishes')}>すべて見る<ArrowRight size={13} /></button></div>
        <div className="wish-preview">{wishes.length ? wishes.map((item) => <button key={item.id} onClick={() => onOpen(item)}><Sparkles size={14} /><span>{item.title}</span><ArrowRight size={13} /></button>) : <DashboardEmpty icon={<Sparkles size={19} />} text="やりたいことを追加してみましょう" />}</div>
      </section>
    </div>
  </div>;
}

function DailyPlanCard({ plan, onSave, compact = false }: { plan: DailyPlan; onSave: (content: string) => Promise<void>; compact?: boolean }) {
  const [content, setContent] = useState(plan.content);
  const [saving, setSaving] = useState(false);
  const changed = content !== plan.content;

  useEffect(() => setContent(plan.content), [plan.content]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try { await onSave(content); } finally { setSaving(false); }
  }

  return <form className={`daily-plan-card ${compact ? 'daily-plan-card--compact' : ''}`} onSubmit={submit}>
    <div className="daily-plan-heading"><div><p className="eyebrow">TODAY PLAN</p><h2>今日やること</h2></div><button disabled={!changed || saving}><Save size={14} />{saving ? '保存中' : '保存'}</button></div>
    <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="- 今日やることをざっくり書く&#10;- タスクにする前のメモもOK" rows={compact ? 4 : 5} maxLength={5000} />
  </form>;
}

function DashboardEmpty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="dashboard-empty"><span>{icon}</span><p>{text}</p></div>;
}

function NotesPanel({ notes, onSave, onDelete }: { notes: Note[]; onSave: (input: NoteInput, id?: number) => Promise<void>; onDelete: (note: Note) => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [color, setColor] = useState<NoteColor>('sage');
  const [saving, setSaving] = useState(false);
  const filtered = notes.filter((note) => `${note.title} ${note.content}`.toLocaleLowerCase('ja').includes(query.trim().toLocaleLowerCase('ja')));

  function open(note?: Note) {
    setEditing(note ?? null); setCreating(!note); setTitle(note?.title ?? ''); setContent(note?.content ?? ''); setColor(note?.color ?? 'sage');
  }

  function addLayout(prefix: string) {
    setContent((current) => `${current}${current && !current.endsWith('\n') ? '\n' : ''}${prefix}`);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!title.trim()) return; setSaving(true);
    try { await onSave({ title, content, color, pinned: Boolean(editing?.pinned) }, editing?.id); setEditing(null); setCreating(false); }
    finally { setSaving(false); }
  }

  return <div className="notes-view">
    <div className="notes-toolbar"><div className="notes-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="メモを検索…" /></div><button onClick={() => open()}><Plus size={16} />新しいメモ</button></div>
    {filtered.length ? <div className="notes-grid">{filtered.map((note) => <article className={`note-card note-${note.color}`} key={note.id} onClick={() => open(note)}><button className={note.pinned ? 'pinned' : ''} onClick={(event) => { event.stopPropagation(); void onSave({ pinned: !note.pinned, title: note.title }, note.id); }} title={note.pinned ? '固定を解除' : '上部に固定'}><Pin size={14} /></button><h2>{note.title}</h2><NotePreview text={note.content} /><footer><span>{new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric' }).format(new Date(note.updatedAt.replace(' ', 'T') + 'Z'))}</span><button onClick={(event) => { event.stopPropagation(); void onDelete(note); }}><Trash2 size={14} /></button></footer></article>)}</div> : <div className="notes-empty"><StickyNote size={28} /><h2>{query ? 'メモが見つかりません' : '最初のメモを書いてみましょう'}</h2><p>アイデア、記録、あとで考えたいことを自由に残せます。</p>{!query && <button onClick={() => open()}><Plus size={15} />メモを作成</button>}</div>}
    {(creating || editing) && <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) { setCreating(false); setEditing(null); } }}><form className="note-editor" onSubmit={submit}><div className="composer-header"><div><p className="eyebrow">NOTE</p><h2>{editing ? 'メモを編集' : '新しいメモ'}</h2></div><button type="button" className="icon-button" onClick={() => { setCreating(false); setEditing(null); }}><X size={20} /></button></div><input className="note-title-input" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder="タイトル" /><div className="note-tools note-tools--editor" aria-label="メモのレイアウト"><button type="button" onClick={() => addLayout('# 見出し')}>見出し</button><button type="button" onClick={() => addLayout('- 箇条書き')}>箇条書き</button><button type="button" onClick={() => addLayout('1. 番号リスト')}>番号</button></div><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="考えていることを書き留める…" rows={12} /><div className="note-colors">{(['sage', 'blue', 'amber', 'rose'] as NoteColor[]).map((value) => <button type="button" key={value} className={`${value} ${color === value ? 'active' : ''}`} onClick={() => setColor(value)} aria-label={`${value}色`} />)}</div><div className="composer-actions"><button type="button" className="secondary-button" onClick={() => { setCreating(false); setEditing(null); }}>キャンセル</button><button className="primary-button" disabled={!title.trim() || saving}>{saving ? '保存中…' : '保存'}</button></div></form></div>}
  </div>;
}

function ListsPanel({ lists, onCreate, onUpdate, onDelete, onAddItem, onUpdateItem, onDeleteItem }: {
  lists: CustomList[];
  onCreate: (name: string, color: string) => Promise<void>;
  onUpdate: (list: CustomList, input: { name?: string; color?: string }) => Promise<void>;
  onDelete: (list: CustomList) => Promise<void>;
  onAddItem: (list: CustomList, title: string) => Promise<void>;
  onUpdateItem: (itemId: number, input: { title?: string; completed?: boolean }) => Promise<void>;
  onDeleteItem: (itemId: number) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#657153');

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    await onCreate(name, color);
    setName('');
  }

  return <div className="lists-view">
    <form className="list-create" onSubmit={create}>
      <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="リスト色" />
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="新しいリスト名（例：買い物リスト）" maxLength={120} />
      <button disabled={!name.trim()}><Plus size={16} />リスト作成</button>
    </form>
    {lists.length ? <div className="custom-list-grid">{lists.map((list) => <CustomListCard key={list.id} list={list} onUpdate={onUpdate} onDelete={onDelete} onAddItem={onAddItem} onUpdateItem={onUpdateItem} onDeleteItem={onDeleteItem} />)}</div> : <div className="notes-empty"><ListChecks size={29} /><h2>自由リストを作ってみましょう</h2><p>買い物、持ち物、見たい作品などをチェックリスト化できます。</p></div>}
  </div>;
}

function CustomListCard({ list, onUpdate, onDelete, onAddItem, onUpdateItem, onDeleteItem }: {
  list: CustomList;
  onUpdate: (list: CustomList, input: { name?: string; color?: string }) => Promise<void>;
  onDelete: (list: CustomList) => Promise<void>;
  onAddItem: (list: CustomList, title: string) => Promise<void>;
  onUpdateItem: (itemId: number, input: { title?: string; completed?: boolean }) => Promise<void>;
  onDeleteItem: (itemId: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);
  const [color, setColor] = useState(list.color);
  const [newItem, setNewItem] = useState('');
  const [collapsed, setCollapsed] = useState(true);
  const done = list.items.filter((item) => item.completed).length;

  useEffect(() => { setName(list.name); setColor(list.color); }, [list.color, list.name]);

  async function saveList(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    await onUpdate(list, { name, color });
    setEditing(false);
  }

  async function addItem(event: React.FormEvent) {
    event.preventDefault();
    if (!newItem.trim()) return;
    await onAddItem(list, newItem);
    setNewItem('');
  }

  return <article className={`custom-list-card ${collapsed ? 'custom-list-card--collapsed' : ''}`} style={{ '--list-color': list.color } as React.CSSProperties}>
    {editing ? <form className="custom-list-edit" onSubmit={saveList}><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /><button disabled={!name.trim()}><Save size={14} /></button></form> : <header><button className="custom-list-toggle" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? 'リストを開く' : 'リストを閉じる'} aria-expanded={!collapsed}><ChevronDown size={15} /></button><span className="list-color-dot" /><div><h2>{list.name}</h2><small>{done}/{list.items.length} 完了</small></div><button onClick={() => setEditing(true)} aria-label="リスト名を編集"><Edit3 size={14} /></button><button onClick={() => void onDelete(list)} aria-label="リストを削除"><Trash2 size={14} /></button></header>}
    {!collapsed && <>
      <div className="custom-list-items">
        {list.items.map((item) => <div key={item.id} className={item.completed ? 'done' : ''}><button onClick={() => void onUpdateItem(item.id, { completed: !item.completed })}><i>{Boolean(item.completed) && <Check size={11} />}</i></button><input defaultValue={item.title} onBlur={(event) => { const value = event.target.value.trim(); if (value && value !== item.title) void onUpdateItem(item.id, { title: value }); }} /><button className="inline-subtask-delete" onClick={() => void onDeleteItem(item.id)}><X size={13} /></button></div>)}
      </div>
      <form className="custom-list-add" onSubmit={addItem}><Plus size={14} /><input value={newItem} onChange={(event) => setNewItem(event.target.value)} placeholder="項目を追加…" maxLength={240} /><button disabled={!newItem.trim()}>追加</button></form>
    </>}
  </article>;
}

function TrashPanel({ items, onRestore, onDelete, onEmpty }: { items: Item[]; onRestore: (item: Item) => Promise<void>; onDelete: (item: Item) => Promise<void>; onEmpty: () => Promise<void> }) {
  return <section className="trash-card">
    <div className="trash-toolbar"><span>{items.length}件</span><button disabled={!items.length} onClick={onEmpty}><Trash2 size={14} />ゴミ箱を空にする</button></div>
    {items.length ? <div className="trash-list">{items.map((item) => <article key={item.id}><span className="trash-icon"><Trash2 size={15} /></span><div><strong>{item.title}</strong><small>{item.deletedAt ? `${new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(item.deletedAt.replace(' ', 'T') + 'Z'))} に削除` : '削除済み'}</small></div><button className="restore-button" onClick={() => void onRestore(item)}><RotateCcw size={14} />復元</button><button className="permanent-button" onClick={() => void onDelete(item)}><Trash2 size={14} />完全削除</button></article>)}</div> : <div className="trash-empty"><Trash2 size={27} /><h2>ゴミ箱は空です</h2><p>削除した項目はここに移動します。</p></div>}
  </section>;
}

function SettingsPanel({ categories, projects, preferences, completedCount, trashCount, onPreferencesChange, onCreateCategory, onUpdateCategory, onDeleteCategory, onCreateProject, onUpdateProject, onDeleteProject, onClearCompleted, onOpenTrash, onRestoreBackup }: {
  categories: Category[];
  projects: Project[];
  preferences: Preferences;
  completedCount: number;
  trashCount: number;
  onPreferencesChange: React.Dispatch<React.SetStateAction<Preferences>>;
  onCreateCategory: (name: string, color: string) => Promise<void>;
  onUpdateCategory: (category: Category) => Promise<void>;
  onDeleteCategory: (category: Category) => Promise<void>;
  onCreateProject: (name: string, color: string) => Promise<void>;
  onUpdateProject: (project: Project) => Promise<void>;
  onDeleteProject: (project: Project) => Promise<void>;
  onClearCompleted: () => Promise<void>;
  onOpenTrash: () => void;
  onRestoreBackup: (file: File) => Promise<void>;
}) {
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState('#657153');
  const [projectName, setProjectName] = useState('');
  const [projectColor, setProjectColor] = useState('#6f7c64');
  const [notificationPermission, setNotificationPermission] = useState(() => 'Notification' in window ? Notification.permission : 'unsupported');
  const [pushStatus, setPushStatus] = useState<'checking' | 'enabled' | 'disabled' | 'unconfigured' | 'unsupported'>('checking');
  const [pushEndpoint, setPushEndpoint] = useState<string | null>(null);
  const [pushPreferences, setPushPreferences] = useState<PushPreferences>({ dueEnabled: true, dailyEnabled: false, dailyTime: '09:00', quietStart: '22:00', quietEnd: '07:00', quietEnabled: true });

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setPushStatus('unsupported'); return; }
    void (async () => {
      try {
        const config = await request<{ configured: boolean }>('/api/push/config');
        if (!config.configured) { setPushStatus('unconfigured'); return; }
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) { setPushStatus('disabled'); return; }
        setPushEndpoint(subscription.endpoint);
        const stored = await request<{ dueEnabled: number; dailyEnabled: number; dailyTime: string; quietStart: string; quietEnd: string; quietEnabled: number }>(`/api/push/preferences?endpoint=${encodeURIComponent(subscription.endpoint)}`);
        setPushPreferences({ ...stored, dueEnabled: Boolean(stored.dueEnabled), dailyEnabled: Boolean(stored.dailyEnabled), quietEnabled: Boolean(stored.quietEnabled) });
        setPushStatus('enabled');
      } catch { setPushStatus('disabled'); }
    })();
  }, []);

  async function addCategory(event: React.FormEvent) {
    event.preventDefault();
    if (!categoryName.trim()) return;
    try { await onCreateCategory(categoryName, categoryColor); setCategoryName(''); } catch { /* Toast is shown by App. */ }
  }

  async function addProject(event: React.FormEvent) {
    event.preventDefault();
    if (!projectName.trim()) return;
    try { await onCreateProject(projectName, projectColor); setProjectName(''); } catch { /* Toast is shown by App. */ }
  }

  async function requestNotifications() {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  async function toggleBackgroundNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const current = await registration.pushManager.getSubscription();
      if (current) {
        await request<void>('/api/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: current.endpoint }) });
        await current.unsubscribe(); setPushEndpoint(null); setPushStatus('disabled'); return;
      }
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== 'granted') return;
      const config = await request<{ configured: boolean; publicKey: string | null }>('/api/push/config');
      if (!config.configured || !config.publicKey) { setPushStatus('unconfigured'); return; }
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.publicKey) });
      await request('/api/push/subscriptions', { method: 'POST', body: JSON.stringify({ ...subscription.toJSON(), endpoint: subscription.endpoint, timezoneOffset: new Date().getTimezoneOffset() }) });
      setPushEndpoint(subscription.endpoint);
      setPushStatus('enabled');
    } catch (reason) { window.alert((reason as Error).message); }
  }

  async function updatePushPreferences(patch: Partial<PushPreferences>) {
    if (!pushEndpoint) return;
    const next = { ...pushPreferences, ...patch };
    setPushPreferences(next);
    try { await request('/api/push/preferences', { method: 'PATCH', body: JSON.stringify({ endpoint: pushEndpoint, ...next }) }); }
    catch (reason) { setPushPreferences(pushPreferences); window.alert((reason as Error).message); }
  }

  async function testNotification() {
    if (!('serviceWorker' in navigator)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission !== 'granted') return;
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('MyManager テスト通知', { body: '通知設定は正常に動作しています。', icon: '/icons/icon.svg', tag: 'mymanager-test' });
  }

  return (
    <div className="settings-grid">
      <section className="settings-card">
        <div className="settings-card-heading"><span><Palette size={18} /></span><div><h2>表示</h2><p>見た目と起動時の画面</p></div></div>
        <div className="setting-field"><label htmlFor="default-view">最初に開く画面</label><select id="default-view" value={preferences.defaultView} onChange={(event) => onPreferencesChange((current) => ({ ...current, defaultView: event.target.value as Preferences['defaultView'] }))}><option value="dashboard">ダッシュボード</option><option value="today">今日</option><option value="upcoming">今後の予定</option><option value="tasks">すべてのタスク</option><option value="wishes">やりたいこと</option><option value="notes">メモ</option><option value="lists">リスト</option><option value="done">完了済み</option></select></div>
        <div className="setting-field"><span>表示密度</span><div className="setting-segments"><button className={preferences.density === 'comfortable' ? 'active' : ''} onClick={() => onPreferencesChange((current) => ({ ...current, density: 'comfortable' }))}>ゆったり</button><button className={preferences.density === 'compact' ? 'active' : ''} onClick={() => onPreferencesChange((current) => ({ ...current, density: 'compact' }))}>コンパクト</button></div></div>
        <div className="setting-field"><span>アクセントカラー</span><div className="accent-options">{(Object.keys(accentColors) as Accent[]).map((accent) => <button key={accent} className={preferences.accent === accent ? 'active' : ''} style={{ background: accentColors[accent].base }} onClick={() => onPreferencesChange((current) => ({ ...current, accent }))} aria-label={accent} />)}</div></div>
        <div className="setting-field"><label htmlFor="daily-goal">1日の完了目標</label><select id="daily-goal" value={preferences.dailyGoal} onChange={(event) => onPreferencesChange((current) => ({ ...current, dailyGoal: Number(event.target.value) }))}>{[1, 3, 5, 8, 10].map((goal) => <option value={goal} key={goal}>{goal}件</option>)}</select></div>
      </section>

      <section className="settings-card">
        <div className="settings-card-heading"><span><Bell size={18} /></span><div><h2>通知</h2><p>期限を忘れないための通知</p></div></div>
        <div className="setting-status"><div><strong>ブラウザ通知</strong><p>{notificationPermission === 'granted' ? '通知が許可されています。' : notificationPermission === 'denied' ? 'ブラウザの設定でブロックされています。' : notificationPermission === 'unsupported' ? 'このブラウザは通知に対応していません。' : '通知はまだ許可されていません。'}</p></div><button disabled={notificationPermission === 'granted' || notificationPermission === 'unsupported'} onClick={requestNotifications}>{notificationPermission === 'granted' ? '許可済み' : '通知を許可'}</button></div>
        <div className="setting-status"><div><strong>バックグラウンド通知</strong><p>{pushStatus === 'enabled' ? 'アプリを閉じていても通知します。' : pushStatus === 'unconfigured' ? 'VAPID秘密鍵の設定後に利用できます。' : pushStatus === 'unsupported' ? 'この環境はWeb Pushに対応していません。' : '期限通知をバックグラウンドで受け取ります。'}</p></div><button disabled={pushStatus === 'checking' || pushStatus === 'unconfigured' || pushStatus === 'unsupported'} onClick={toggleBackgroundNotifications}>{pushStatus === 'enabled' ? '解除する' : '有効にする'}</button></div>
        <div className="setting-field"><span>アプリを開いている間も通知</span><button className={`setting-toggle ${preferences.foregroundNotifications ? 'active' : ''}`} onClick={() => onPreferencesChange((current) => ({ ...current, foregroundNotifications: !current.foregroundNotifications }))} aria-pressed={preferences.foregroundNotifications}><i /></button></div>
        <div className="setting-status"><div><strong>テスト通知</strong><p>この端末で通知が表示されるか確認します。</p></div><button disabled={notificationPermission === 'unsupported'} onClick={testNotification}>通知を試す</button></div>
        <p className="settings-hint">バックグラウンド通知はインストール済みPWAでも利用できます。</p>
      </section>

      <section className="settings-card settings-card--wide">
        <div className="settings-card-heading"><span><SlidersHorizontal size={18} /></span><div><h2>通知の詳細</h2><p>この端末で受け取る通知と時間帯</p></div></div>
        {pushStatus === 'enabled' ? <div className="notification-preferences">
          <div className="setting-field"><span><strong>期限通知</strong><small>タスクに設定した通知日時にお知らせ</small></span><button className={`setting-toggle ${pushPreferences.dueEnabled ? 'active' : ''}`} onClick={() => void updatePushPreferences({ dueEnabled: !pushPreferences.dueEnabled })} aria-pressed={pushPreferences.dueEnabled}><i /></button></div>
          <div className="setting-field"><span><strong>毎日の応援通知</strong><small>1日1回、タスクを確認するきっかけを通知</small></span><button className={`setting-toggle ${pushPreferences.dailyEnabled ? 'active' : ''}`} onClick={() => void updatePushPreferences({ dailyEnabled: !pushPreferences.dailyEnabled })} aria-pressed={pushPreferences.dailyEnabled}><i /></button></div>
          {pushPreferences.dailyEnabled && <div className="setting-field"><label htmlFor="daily-notification-time">応援通知の時刻</label><input id="daily-notification-time" type="time" value={pushPreferences.dailyTime} onChange={(event) => void updatePushPreferences({ dailyTime: event.target.value })} /></div>}
          <div className="setting-field"><span><strong>通知しない時間帯</strong><small>静かに過ごしたい時間は通知を翌時間帯まで保留</small></span><button className={`setting-toggle ${pushPreferences.quietEnabled ? 'active' : ''}`} onClick={() => void updatePushPreferences({ quietEnabled: !pushPreferences.quietEnabled })} aria-pressed={pushPreferences.quietEnabled}><i /></button></div>
          {pushPreferences.quietEnabled && <div className="setting-field quiet-hours"><span>開始と終了</span><div><input type="time" value={pushPreferences.quietStart} onChange={(event) => void updatePushPreferences({ quietStart: event.target.value })} /><span>〜</span><input type="time" value={pushPreferences.quietEnd} onChange={(event) => void updatePushPreferences({ quietEnd: event.target.value })} /></div></div>}
        </div> : <div className="notification-locked"><Bell size={20} /><div><strong>バックグラウンド通知を有効にしてください</strong><p>有効化すると、通知の種類と時間帯を細かく設定できます。</p></div></div>}
      </section>

      <section className="settings-card settings-card--wide">
        <div className="settings-card-heading"><span><Tags size={18} /></span><div><h2>カテゴリ</h2><p>タスクを横断して分類するラベル</p></div></div>
        <form className="resource-create" onSubmit={addCategory}><input type="color" value={categoryColor} onChange={(event) => setCategoryColor(event.target.value)} aria-label="カテゴリ色" /><input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="新しいカテゴリ名" maxLength={40} /><button disabled={!categoryName.trim()}><Plus size={15} />追加</button></form>
        <div className="resource-list">{categories.map((category) => <ResourceRow key={category.id} name={category.name} color={category.color} onSave={(name, color) => onUpdateCategory({ ...category, name, color })} onDelete={() => onDeleteCategory(category)} />)}</div>
      </section>

      <section className="settings-card settings-card--wide">
        <div className="settings-card-heading"><span><Folder size={18} /></span><div><h2>プロジェクト</h2><p>複数のタスクを目的ごとにまとめる</p></div></div>
        <form className="resource-create" onSubmit={addProject}><input type="color" value={projectColor} onChange={(event) => setProjectColor(event.target.value)} aria-label="プロジェクト色" /><input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="新しいプロジェクト名" maxLength={60} /><button disabled={!projectName.trim()}><Plus size={15} />追加</button></form>
        <div className="resource-list">{projects.map((project) => <ResourceRow key={project.id} name={project.name} color={project.color} onSave={(name, color) => onUpdateProject({ ...project, name, color })} onArchive={() => onUpdateProject({ ...project, archived: 1 })} onDelete={() => onDeleteProject(project)} />)}</div>
      </section>

      <section className="settings-card">
        <div className="settings-card-heading"><span><Database size={18} /></span><div><h2>データ管理</h2><p>バックアップと整理</p></div></div>
        <div className="settings-actions"><a href="/api/export" download><Download size={16} /><span><strong>JSONを書き出す</strong><small>サブタスクを含むすべてのデータ</small></span></a><label className="restore-action"><Upload size={16} /><span><strong>バックアップから復元</strong><small>復元前の現データも自動保存</small></span><input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onRestoreBackup(file); event.target.value = ''; }} /></label><button onClick={onOpenTrash}><Trash2 size={16} /><span><strong>ゴミ箱を開く</strong><small>{trashCount}件の削除済みデータ</small></span></button><button className="danger-action" disabled={!completedCount} onClick={onClearCompleted}><Trash2 size={16} /><span><strong>完了済みをゴミ箱へ</strong><small>{completedCount}件の完了データ</small></span></button></div>
      </section>

      <section className="settings-card">
        <div className="settings-card-heading"><span><ShieldCheck size={18} /></span><div><h2>セキュリティ</h2><p>アクセス保護</p></div></div>
        <div className="security-note"><ShieldCheck size={21} /><div><strong>Cloudflare Access</strong><p>本番環境はAccess側でログインを制限します。許可メールアドレスはCloudflareダッシュボードで管理してください。</p></div></div>
      </section>
    </div>
  );
}

function ResourceRow({ name: initialName, color: initialColor, onSave, onDelete, onArchive }: { name: string; color: string; onSave: (name: string, color: string) => Promise<void>; onDelete: () => Promise<void>; onArchive?: () => Promise<void> }) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [saving, setSaving] = useState(false);
  const changed = name.trim() !== initialName || color !== initialColor;

  useEffect(() => { setName(initialName); setColor(initialColor); }, [initialColor, initialName]);

  async function save() {
    if (!name.trim() || !changed) return;
    setSaving(true);
    try { await onSave(name, color); } finally { setSaving(false); }
  }

  return <div className="resource-row"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="色" /><input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} /><div className="resource-row-actions"><button disabled={!changed || saving} onClick={save} title="保存"><Save size={15} /></button>{onArchive && <button onClick={onArchive} title="アーカイブ"><Archive size={15} /></button>}<button className="danger" onClick={onDelete} title="削除"><Trash2 size={15} /></button></div></div>;
}

function ItemRow({ item, onToggle, onUpdateSubtasks, onUpdateProgress, onRemove, onOpen, onEdit, onDragStart, onDrop }: { item: Item; onToggle: (item: Item) => void; onUpdateSubtasks: (item: Item, subtasks: SubtaskInput[]) => Promise<void>; onUpdateProgress: (item: Item, progress: TaskProgress) => Promise<void>; onRemove: (item: Item) => void; onOpen: (item: Item) => void; onEdit: (item: Item) => void; onDragStart: () => void; onDrop: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const draggedSubtask = useRef<number | null>(null);
  const dueLabel = item.dueDate ? new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric' }).format(new Date(`${item.dueDate}T00:00:00`)) : null;
  const overdue = item.dueDate && item.dueDate < localDate() && item.status === 'open';
  const completedSubtasks = item.subtasks.filter((subtask) => subtask.completed).length;
  const inputs = (subtasks = item.subtasks): SubtaskInput[] => subtasks.map((subtask) => ({ title: subtask.title, completed: Boolean(subtask.completed), dueDate: subtask.dueDate }));

  function dropSubtask(targetId: number) {
    const sourceId = draggedSubtask.current; draggedSubtask.current = null;
    if (!sourceId || sourceId === targetId) return;
    const next = [...item.subtasks];
    const sourceIndex = next.findIndex((subtask) => subtask.id === sourceId);
    const targetIndex = next.findIndex((subtask) => subtask.id === targetId);
    const [moved] = next.splice(sourceIndex, 1); next.splice(targetIndex, 0, moved);
    void onUpdateSubtasks(item, inputs(next));
  }

  return (
    <article className={`item-row ${item.status === 'done' ? 'item-row--done' : ''}`} draggable onDragStart={(event) => { if ((event.target as HTMLElement).closest('input,button,.inline-subtasks')) { event.preventDefault(); return; } onDragStart(); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onDrop(); }}>
      <span className="drag-handle" title="ドラッグして並べ替え"><GripVertical size={15} /></span>
      <button className="check-button" onClick={() => onToggle(item)} aria-label={item.status === 'done' ? '未完了に戻す' : '完了にする'}>{item.status === 'done' && <Check size={15} />}</button>
      <div className="item-body" onDoubleClick={() => onEdit(item)}><h3>{item.title}</h3>{item.note && <p>{item.note}</p>}{item.subtasks.length > 0 && <button className="subtask-progress" onClick={(event) => { event.stopPropagation(); setSubtasksOpen((open) => !open); }}><ListChecks size={12} /><span>{completedSubtasks}/{item.subtasks.length}</span><i><b style={{ width: `${(completedSubtasks / item.subtasks.length) * 100}%` }} /></i><ChevronDown size={12} className={subtasksOpen ? 'open' : ''} /></button>}{subtasksOpen && <div className="inline-subtasks" onDoubleClick={(event) => event.stopPropagation()}>{item.subtasks.map((subtask) => <div key={subtask.id} className={subtask.completed ? 'done' : ''} draggable onDragStart={() => { draggedSubtask.current = subtask.id; }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); dropSubtask(subtask.id); }}><GripVertical size={13} /><button onClick={() => void onUpdateSubtasks(item, inputs().map((entry, index) => index === item.subtasks.findIndex((candidate) => candidate.id === subtask.id) ? { ...entry, completed: !entry.completed } : entry))}><i>{Boolean(subtask.completed) && <Check size={11} />}</i></button><input defaultValue={subtask.title} onBlur={(event) => { const value = event.target.value.trim(); if (value && value !== subtask.title) void onUpdateSubtasks(item, inputs().map((entry, index) => index === item.subtasks.findIndex((candidate) => candidate.id === subtask.id) ? { ...entry, title: value } : entry)); }} />{subtask.dueDate && <small>{new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(new Date(`${subtask.dueDate}T00:00:00`))}</small>}<button className="inline-subtask-delete" onClick={() => void onUpdateSubtasks(item, inputs(item.subtasks.filter((candidate) => candidate.id !== subtask.id)))}><X size={12} /></button></div>)}<form onSubmit={(event) => { event.preventDefault(); if (!newSubtask.trim()) return; void onUpdateSubtasks(item, [...inputs(), { title: newSubtask.trim(), completed: false }]); setNewSubtask(''); }}><Plus size={13} /><input value={newSubtask} onChange={(event) => setNewSubtask(event.target.value)} placeholder="サブタスクを追加…" /><button disabled={!newSubtask.trim()}>追加</button></form></div>}<div className="item-meta">{item.projectName && <span className="project-chip"><Folder size={13} style={{ color: item.projectColor ?? '#657153' }} />{item.projectName}</span>}{item.categoryName && <span className="category-chip"><i style={{ background: item.categoryColor ?? '#657153' }} />{item.categoryName}</span>}{dueLabel && <span className={overdue ? 'overdue' : ''}><CalendarDays size={13} />{overdue ? '期限切れ · ' : ''}{dueLabel}</span>}{item.recurrence !== 'none' && <span><Repeat2 size={13} />{item.recurrence === 'daily' ? '毎日' : item.recurrence === 'weekly' ? '毎週' : '毎月'}</span>}{item.reminderAt && <span><Bell size={12} />通知</span>}{item.priority === 'high' && <span className="priority-high">優先</span>}</div></div>
      <div className="item-menu-wrap"><button className="more-button" onClick={() => setMenuOpen((open) => !open)} aria-label="操作"><MoreHorizontal size={19} /></button>{menuOpen && <div className="item-menu"><button className="edit-action" onClick={() => { setMenuOpen(false); onEdit(item); }}><Edit3 size={15} />編集</button><button onClick={() => onRemove(item)}><Trash2 size={15} />削除</button></div>}</div>
    </article>
  );
}

function Composer({ categories, projects, initialItem, defaultKind, defaultDate, onClose, onSubmit, onCreateProject }: { categories: Category[]; projects: Project[]; initialItem: Item | null; defaultKind: ItemKind; defaultDate: string | null; onClose: () => void; onSubmit: (input: ItemInput) => Promise<void>; onCreateProject: (name: string) => Promise<Project> }) {
  const [title, setTitle] = useState(initialItem?.title ?? '');
  const [note, setNote] = useState(initialItem?.note ?? '');
  const [kind, setKind] = useState<ItemKind>(initialItem?.kind ?? defaultKind);
  const [dueDate, setDueDate] = useState(initialItem?.dueDate ?? defaultDate ?? '');
  const [progress, setProgress] = useState<TaskProgress>(initialItem?.progress ?? 'not_started');
  const [allDay, setAllDay] = useState(initialItem ? Boolean(initialItem.allDay) : true);
  const [startTime, setStartTime] = useState(initialItem?.startTime ?? '');
  const [endTime, setEndTime] = useState(initialItem?.endTime ?? '');
  const [priority, setPriority] = useState<Priority>(initialItem?.priority ?? 'medium');
  const [categoryId, setCategoryId] = useState(initialItem?.categoryId ? String(initialItem.categoryId) : '');
  const [projectId, setProjectId] = useState(initialItem?.projectId ? String(initialItem.projectId) : '');
  const [recurrence, setRecurrence] = useState<Recurrence>(initialItem?.recurrence ?? 'none');
  const [reminderAt, setReminderAt] = useState(initialItem?.reminderAt ?? '');
  const [subtasks, setSubtasks] = useState<SubtaskInput[]>(initialItem?.subtasks.map((subtask) => ({ title: subtask.title, completed: Boolean(subtask.completed), dueDate: subtask.dueDate })) ?? []);
  const draggedComposerSubtask = useRef<number | null>(null);
  const [addingProject, setAddingProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    await onSubmit({ title, note, kind, progress: kind === 'task' ? progress : 'not_started', dueDate: kind === 'task' ? dueDate || null : null, allDay, startTime: allDay ? null : startTime || null, endTime: allDay ? null : endTime || null, priority, categoryId: categoryId ? Number(categoryId) : null, projectId: projectId ? Number(projectId) : null, recurrence: kind === 'task' ? recurrence : 'none', reminderAt: kind === 'task' ? reminderAt || null : null, subtasks: kind === 'task' ? subtasks.filter((subtask) => subtask.title.trim()) : [] });
    setSaving(false);
  }

  async function addProject() {
    if (!projectName.trim()) return;
    try {
      const project = await onCreateProject(projectName);
      setProjectId(String(project.id));
      setProjectName('');
      setAddingProject(false);
    } catch (reason) { window.alert((reason as Error).message); }
  }

  function addNoteLayout(prefix: string) {
    setNote((current) => {
      const suffix = current && !current.endsWith('\n') ? '\n' : '';
      return `${current}${suffix}${prefix}`;
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <form className="composer" onSubmit={submit}>
        <div className="composer-header"><div><p className="eyebrow">{initialItem ? 'EDIT ITEM' : 'NEW ITEM'}</p><h2>{initialItem ? '項目を編集' : '新しく追加'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></div>
        <div className="kind-switch"><button type="button" className={kind === 'task' ? 'active' : ''} onClick={() => setKind('task')}><CheckCircle2 size={17} />タスク</button><button type="button" className={kind === 'wish' ? 'active' : ''} onClick={() => setKind('wish')}><Sparkles size={17} />やりたいこと</button></div>
        <label className="field"><span>タイトル</span><input autoFocus={!window.matchMedia('(pointer: coarse)').matches} maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === 'task' ? '何をしますか？' : 'いつか叶えたいことは？'} /></label>
        <label className="field"><span>メモ <small>任意</small></span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="詳細やアイデアを書き留める" /></label>
        <div className="note-tools" aria-label="メモのレイアウト">
          <button type="button" onClick={() => addNoteLayout('# 見出し')}>見出し</button>
          <button type="button" onClick={() => addNoteLayout('- 箇条書き')}>箇条書き</button>
          <button type="button" onClick={() => addNoteLayout('1. 番号リスト')}>番号</button>
        </div>
        {kind === 'task' && <div className="subtask-editor"><div className="subtask-editor-heading"><span><ListChecks size={15} />サブタスク</span><small>ドラッグで並べ替え · {subtasks.filter((subtask) => subtask.completed).length}/{subtasks.length}</small></div><div className="subtask-editor-list">{subtasks.map((subtask, index) => <div key={index} draggable onDragStart={() => { draggedComposerSubtask.current = index; }} onDragOver={(event) => event.preventDefault()} onDrop={() => { const source = draggedComposerSubtask.current; if (source === null || source === index) return; setSubtasks((current) => { const next = [...current]; const [moved] = next.splice(source, 1); next.splice(index, 0, moved); return next; }); draggedComposerSubtask.current = null; }}><GripVertical className="composer-drag" size={14} /><button type="button" className={subtask.completed ? 'checked' : ''} onClick={() => setSubtasks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, completed: !item.completed } : item))}>{subtask.completed && <Check size={13} />}</button><input value={subtask.title} onChange={(event) => setSubtasks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} placeholder="小さな作業を入力" /><input className="subtask-date" type="date" value={subtask.dueDate ?? ''} onChange={(event) => setSubtasks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, dueDate: event.target.value || null } : item))} aria-label="サブタスクの期限" /><button type="button" className="remove-subtask" onClick={() => setSubtasks((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button></div>)}</div><button type="button" className="add-subtask" onClick={() => setSubtasks((current) => [...current, { title: '', completed: false, dueDate: null }])}><Plus size={14} />サブタスクを追加</button></div>}
        <div className="field-grid composer-options">
          {kind === 'task' && <div className="field date-field"><label htmlFor="due-date">期限</label><input id="due-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /><span className="date-shortcuts"><button type="button" className={dueDate === localDate() ? 'active' : ''} onClick={() => setDueDate(localDate())}>今日</button><button type="button" className={dueDate === dateAfter(1) ? 'active' : ''} onClick={() => setDueDate(dateAfter(1))}>明日</button><button type="button" className={!dueDate ? 'active' : ''} onClick={() => setDueDate('')}>期限なし</button></span></div>}
          {kind === 'task' && <label className="field"><span>進捗</span><select value={progress} onChange={(event) => setProgress(event.target.value as TaskProgress)}>{(Object.keys(progressCopy) as TaskProgress[]).map((value) => <option key={value} value={value}>{progressCopy[value]}</option>)}</select></label>}
          <label className="field"><span>カテゴリ</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">なし</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          <label className="field"><span>優先度</span><select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
          <label className="field"><span>プロジェクト</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">なし</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select><button type="button" className="inline-link" onClick={() => setAddingProject((value) => !value)}>＋ 新しいプロジェクト</button></label>
          {kind === 'task' && <label className="field"><span>繰り返し</span><select value={recurrence} onChange={(event) => setRecurrence(event.target.value as Recurrence)}><option value="none">なし</option><option value="daily">毎日</option><option value="weekly">毎週</option><option value="monthly">毎月</option></select></label>}
        </div>
        {kind === 'task' && <div className="time-editor">
          <label className="time-all-day"><input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />終日</label>
          {!allDay && <div className="time-range"><label>開始<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label>終了<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div>}
        </div>}
        {addingProject && <div className="inline-create"><input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="プロジェクト名" autoFocus /><button type="button" onClick={addProject}>作成</button></div>}
        {kind === 'task' && <label className="field"><span>通知日時 <small>任意・アプリを開いている間</small></span><input type="datetime-local" value={reminderAt} onChange={(event) => setReminderAt(event.target.value)} /></label>}
        <div className="composer-actions"><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button className="primary-button" disabled={!title.trim() || saving}>{saving ? '保存中...' : initialItem ? '変更を保存' : '追加する'}</button></div>
      </form>
    </div>
  );
}

function EmptyState({ view, hasQuery, onAdd }: { view: View; hasQuery: boolean; onAdd: () => void }) {
  return <div className="empty-state"><span><Inbox size={26} /></span><h2>{hasQuery ? '見つかりませんでした' : view === 'done' ? '完了した項目はまだありません' : 'ここはきれいです'}</h2><p>{hasQuery ? '検索語を変えて試してみてください。' : view === 'today' ? '今日のタスクを追加して、一日を始めましょう。' : '新しい項目を追加してみましょう。'}</p>{view !== 'done' && !hasQuery && <button onClick={onAdd}><Plus size={16} />最初の項目を追加</button>}</div>;
}

function LoadingRows() {
  return <div className="loading-rows">{[1, 2, 3].map((value) => <div key={value}><i /><span><b /><em /></span></div>)}</div>;
}
