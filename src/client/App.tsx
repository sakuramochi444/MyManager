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
  Undo2,
  X,
} from 'lucide-react';
import type { Category, Item, ItemInput, ItemKind, ItemUpdateResult, Priority, Project, Recurrence, SubtaskInput } from '../shared/types';

type View = 'dashboard' | 'calendar' | 'today' | 'upcoming' | 'overdue' | 'tasks' | 'wishes' | 'done' | 'settings';
type Sort = 'smart' | 'due' | 'priority' | 'created';
type Accent = 'sage' | 'blue' | 'terracotta';
type Density = 'comfortable' | 'compact';
interface Preferences { defaultView: Exclude<View, 'settings'>; accent: Accent; density: Density }

const defaultPreferences: Preferences = { defaultView: 'today', accent: 'sage', density: 'comfortable' };
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
  { id: 'done', label: '完了済み', icon: CheckCircle2 },
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
  done: { title: '完了済み', subtitle: '積み重ねてきた成果です。' },
  settings: { title: '設定', subtitle: '自分の使い方に合わせて、MyManagerを整えます。' },
};

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function dateAfter(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

export function App() {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [view, setView] = useState<View>(() => loadPreferences().defaultView);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDate, setComposerDate] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [sort, setSort] = useState<Sort>('smart');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState<number | 'all'>('all');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoNotice, setUndoNotice] = useState<{ message: string; action: () => void } | null>(null);
  const undoHideTimer = useRef<number | null>(null);
  const pendingDelete = useRef<{ item: Item; timer: number } | null>(null);

  useEffect(() => {
    Promise.all([request<Item[]>('/api/items'), request<Category[]>('/api/categories'), request<Project[]>('/api/projects')])
      .then(([nextItems, nextCategories, nextProjects]) => {
        setItems(nextItems);
        setCategories(nextCategories);
        setProjects(nextProjects);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.body.style.overflow = composerOpen || sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [composerOpen, sidebarOpen]);

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
    done: items.filter((item) => item.status === 'done').length,
    settings: 0,
  }), [items]);

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
    if (!window.confirm('完了済みの項目をすべて削除しますか？')) return;
    try {
      await request<{ deleted: number }>('/api/items?status=done', { method: 'DELETE' });
      setItems((current) => current.filter((item) => item.status !== 'done'));
    } catch (reason) { setError((reason as Error).message); }
  }

  function openNew(date?: string) {
    setEditingItem(null);
    setComposerDate(date ?? null);
    setComposerOpen(true);
  }

  function openEdit(item: Item) {
    setEditingItem(item);
    setComposerDate(null);
    setComposerOpen(true);
  }

  async function toggleItem(item: Item) {
    const status = item.status === 'done' ? 'open' : 'done';
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, status } : candidate));
    try {
      const result = await request<ItemUpdateResult>(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setItems((current) => {
        const updated = current.map((candidate) => candidate.id === item.id ? result.item : candidate);
        return result.nextItem ? [result.nextItem, ...updated] : updated;
      });
      if (status === 'done') showUndo('タスクを完了しました', () => {
        void (async () => {
          try {
            const reopened = await request<ItemUpdateResult>(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'open' }) });
            if (result.nextItem) await request<void>(`/api/items/${result.nextItem.id}`, { method: 'DELETE' });
            setItems((current) => current.filter((candidate) => candidate.id !== result.nextItem?.id).map((candidate) => candidate.id === item.id ? reopened.item : candidate));
          } catch (reason) { setError((reason as Error).message); }
        })();
      });
    } catch (reason) {
      setItems((current) => current.map((candidate) => candidate.id === item.id ? item : candidate));
      setError((reason as Error).message);
    }
  }

  function removeItem(item: Item) {
    if (pendingDelete.current) {
      window.clearTimeout(pendingDelete.current.timer);
      void request<void>(`/api/items/${pendingDelete.current.item.id}`, { method: 'DELETE' }).catch((reason: Error) => setError(reason.message));
      pendingDelete.current = null;
    }
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    const timer = window.setTimeout(() => {
      void request<void>(`/api/items/${item.id}`, { method: 'DELETE' }).catch((reason: Error) => {
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

  function navigate(next: View) {
    setView(next);
    setSidebarOpen(false);
  }

  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
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
  }, [items]);

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
          {!['settings', 'dashboard', 'calendar'].includes(view) ? <div className="search-wrap"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="タスクを検索..." aria-label="検索" />{query && <button onClick={() => setQuery('')} aria-label="検索をクリア"><X size={15} /></button>}</div> : <div className="topbar-context">{view === 'settings' ? <SettingsIcon size={17} /> : view === 'calendar' ? <CalendarDays size={17} /> : <BarChart3 size={17} />}{view === 'settings' ? '環境設定' : view === 'calendar' ? '月間予定' : '全体サマリー'}</div>}
          {view !== 'settings' && <div className="top-actions"><a className="export-button" href="/api/export" download title="データを書き出す"><Download size={17} /></a><button className="add-button" onClick={() => openNew()}><Plus size={18} /><span>新しく追加</span></button></div>}
        </header>

        <section className="content">
          <div className="page-heading">
            <div><p className="eyebrow">MY MANAGER</p><h1>{viewCopy[view].title}</h1><p>{viewCopy[view].subtitle}</p></div>
            <div className="date-card"><CalendarDays size={18} /><span>{new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</span></div>
          </div>

          {view === 'dashboard' ? <DashboardPanel items={items} projects={projects} onNavigate={navigate} onEdit={openEdit} /> : view === 'calendar' ? <CalendarPanel items={items} onAddDate={openNew} onEdit={openEdit} /> : view === 'settings' ? <SettingsPanel categories={categories} projects={projects} preferences={preferences} completedCount={counts.done} onPreferencesChange={setPreferences} onCreateCategory={createCategory} onUpdateCategory={updateCategory} onDeleteCategory={deleteCategory} onCreateProject={async (name, color) => { await createProject(name, color); }} onUpdateProject={updateProject} onDeleteProject={deleteProject} onClearCompleted={clearCompleted} /> : <>
          <div className="summary-strip" aria-label="進捗サマリー">
            <button onClick={() => navigate('today')}><span>今日</span><strong>{counts.today}</strong></button>
            <button onClick={() => navigate('upcoming')}><span>今後7日</span><strong>{counts.upcoming}</strong></button>
            <button className={counts.overdue ? 'danger' : ''} onClick={() => navigate('overdue')}><span>期限切れ</span><strong>{counts.overdue}</strong></button>
            <button onClick={() => navigate('done')}><span>完了</span><strong>{counts.done}</strong></button>
          </div>

          <div className="list-card">
            {view !== 'done' && view !== 'overdue' && <form className="quick-add" onSubmit={quickAdd}><Plus size={17} /><input value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder={view === 'wishes' ? 'やりたいことをすぐ追加…' : 'タスクをすぐ追加…'} aria-label="クイック追加" /><button disabled={!quickTitle.trim()}>追加</button></form>}
            <div className="filter-bar"><SlidersHorizontal size={15} /><select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="並び順"><option value="smart">おすすめ順</option><option value="due">期限順</option><option value="priority">優先度順</option><option value="created">新しい順</option></select><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as Priority | 'all')} aria-label="優先度で絞り込み"><option value="all">すべての優先度</option><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select><select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))} aria-label="プロジェクトで絞り込み"><option value="all">すべてのプロジェクト</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></div>
            <div className="list-header"><span>{visibleItems.length}件</span>{view === 'done' ? <button className="clear-done" onClick={clearCompleted}><Trash2 size={14} />すべて削除</button> : <span className="sort-label"><span>整理済み</span><ChevronDown size={15} /></span>}</div>
            {loading ? <LoadingRows /> : visibleItems.length ? (
              <div className="item-list">
                {visibleItems.map((item) => <ItemRow key={item.id} item={item} onToggle={toggleItem} onRemove={removeItem} onEdit={openEdit} />)}
              </div>
            ) : <EmptyState view={view} hasQuery={Boolean(query)} onAdd={openNew} />}
          </div>
          </>}
        </section>
      </main>

      <nav className="bottom-nav" aria-label="スマートフォン用メニュー">
        {views.filter(({ id }) => ['dashboard', 'today', 'calendar', 'tasks', 'wishes', 'settings'].includes(id)).map(({ id, label, icon: Icon }) => (
          <button key={id} className={view === id ? 'active' : ''} onClick={() => navigate(id)} aria-current={view === id ? 'page' : undefined}>
            <span className="bottom-nav-icon"><Icon size={20} strokeWidth={1.8} />{counts[id] > 0 && <i>{counts[id] > 99 ? '99+' : counts[id]}</i>}</span>
            <span>{id === 'tasks' ? 'タスク' : id === 'wishes' ? 'やりたい' : id === 'upcoming' ? '予定' : label}</span>
          </button>
        ))}
      </nav>

      {view !== 'settings' && <button className="mobile-fab" onClick={() => openNew()} aria-label="新しい項目を追加"><Plus size={24} /></button>}
      {composerOpen && <Composer categories={categories} projects={projects} initialItem={editingItem} defaultKind={view === 'wishes' ? 'wish' : 'task'} defaultDate={composerDate ?? (view === 'today' ? localDate() : null)} onClose={() => { setComposerOpen(false); setEditingItem(null); setComposerDate(null); }} onSubmit={editingItem ? updateItem : createItem} onCreateProject={createProject} />}
      {undoNotice && <div className="undo-toast" role="status"><span>{undoNotice.message}</span><button onClick={performUndo}><Undo2 size={15} />元に戻す</button></div>}
      {error && <div className="toast" role="alert"><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}
    </div>
  );
}

function CalendarPanel({ items, onAddDate, onEdit }: { items: Item[]; onAddDate: (date: string) => void; onEdit: (item: Item) => void }) {
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
      <div className="calendar-grid">{days.map((day) => <div key={day.key} className={`calendar-day ${day.date.getMonth() !== monthIndex ? 'outside' : ''} ${day.key === selectedDate ? 'selected' : ''} ${day.key === localDate() ? 'today' : ''}`}><button className="calendar-day-number" onClick={() => setSelectedDate(day.key)}>{day.date.getDate()}</button><div className="calendar-day-items">{day.items.slice(0, 3).map((item) => <button key={item.id} className={item.status === 'done' ? 'done' : ''} onClick={() => onEdit(item)}><i style={{ background: item.projectColor ?? item.categoryColor ?? '#657153' }} /><span>{item.title}</span></button>)}{day.items.length > 3 && <small>ほか{day.items.length - 3}件</small>}</div><span className="calendar-mobile-count">{day.items.length > 0 && day.items.length}</span></div>)}</div>
    </section>
    <aside className="calendar-agenda">
      <div className="calendar-agenda-header"><div><p className="eyebrow">SELECTED DAY</p><h2>{new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${selectedDate}T00:00:00`))}</h2></div><button onClick={() => onAddDate(selectedDate)}><Plus size={16} />追加</button></div>
      <div className="calendar-agenda-list">{selectedItems.length ? selectedItems.map((item) => <button key={item.id} onClick={() => onEdit(item)}><i className={item.status === 'done' ? 'done' : ''}>{item.status === 'done' && <Check size={11} />}</i><span><strong>{item.title}</strong><small>{item.projectName ?? item.categoryName ?? (item.priority === 'high' ? '優先度：高' : 'タスク')}</small></span><ChevronRight size={14} /></button>) : <DashboardEmpty icon={<CalendarDays size={19} />} text="この日のタスクはありません" />}</div>
    </aside>
  </div>;
}

function DashboardPanel({ items, projects, onNavigate, onEdit }: { items: Item[]; projects: Project[]; onNavigate: (view: View) => void; onEdit: (item: Item) => void }) {
  const today = localDate();
  const openTasks = items.filter((item) => item.kind === 'task' && item.status === 'open');
  const completedItems = items.filter((item) => item.status === 'done');
  const completedThisWeek = completedItems.filter((item) => item.completedAt && item.completedAt.slice(0, 10) >= dateAfter(-6));
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
      count: completedItems.filter((item) => item.completedAt?.slice(0, 10) === date).length,
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

    <div className="dashboard-layout">
      <section className="dashboard-card dashboard-card--activity">
        <div className="dashboard-card-header"><div><p className="eyebrow">ACTIVITY</p><h2>直近7日の完了</h2></div><span className="activity-total"><strong>{completedThisWeek.length}</strong>件完了</span></div>
        <div className="week-chart">{week.map((day) => <div className="chart-column" key={day.date}><span className="chart-value">{day.count || ''}</span><div className="chart-track"><i style={{ height: `${Math.max(day.count ? 14 : 3, (day.count / maxCompleted) * 100)}%` }} /></div><small>{day.label}</small></div>)}</div>
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-header"><div><p className="eyebrow">UPCOMING</p><h2>次の予定</h2></div><button onClick={() => onNavigate('upcoming')}>すべて見る<ArrowRight size={13} /></button></div>
        <div className="dashboard-list">{upcoming.length ? upcoming.map((item) => <button key={item.id} onClick={() => onEdit(item)}><span className="dashboard-date"><strong>{new Date(`${item.dueDate}T00:00:00`).getDate()}</strong><small>{new Intl.DateTimeFormat('ja-JP', { month: 'short' }).format(new Date(`${item.dueDate}T00:00:00`))}</small></span><span className="dashboard-list-body"><strong>{item.title}</strong><small>{item.projectName ?? item.categoryName ?? 'タスク'}</small></span><ArrowRight size={14} /></button>) : <DashboardEmpty icon={<CalendarDays size={19} />} text="予定されているタスクはありません" />}</div>
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-header"><div><p className="eyebrow">PROJECTS</p><h2>プロジェクト進捗</h2></div><button onClick={() => onNavigate('settings')}>管理<SettingsIcon size={13} /></button></div>
        <div className="project-progress-list">{projectProgress.length ? projectProgress.map(({ project, total, done, percent }) => <div key={project.id}><div className="project-progress-meta"><span><i style={{ background: project.color }} />{project.name}</span><small>{done}/{total} · {percent}%</small></div><div className="progress-track"><i style={{ width: `${percent}%`, background: project.color }} /></div></div>) : <DashboardEmpty icon={<Folder size={19} />} text="タスクのあるプロジェクトはまだありません" />}</div>
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-header"><div><p className="eyebrow">SOMEDAY</p><h2>やりたいこと</h2></div><button onClick={() => onNavigate('wishes')}>すべて見る<ArrowRight size={13} /></button></div>
        <div className="wish-preview">{wishes.length ? wishes.map((item) => <button key={item.id} onClick={() => onEdit(item)}><Sparkles size={14} /><span>{item.title}</span><ArrowRight size={13} /></button>) : <DashboardEmpty icon={<Sparkles size={19} />} text="やりたいことを追加してみましょう" />}</div>
      </section>
    </div>
  </div>;
}

function DashboardEmpty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="dashboard-empty"><span>{icon}</span><p>{text}</p></div>;
}

function SettingsPanel({ categories, projects, preferences, completedCount, onPreferencesChange, onCreateCategory, onUpdateCategory, onDeleteCategory, onCreateProject, onUpdateProject, onDeleteProject, onClearCompleted }: {
  categories: Category[];
  projects: Project[];
  preferences: Preferences;
  completedCount: number;
  onPreferencesChange: React.Dispatch<React.SetStateAction<Preferences>>;
  onCreateCategory: (name: string, color: string) => Promise<void>;
  onUpdateCategory: (category: Category) => Promise<void>;
  onDeleteCategory: (category: Category) => Promise<void>;
  onCreateProject: (name: string, color: string) => Promise<void>;
  onUpdateProject: (project: Project) => Promise<void>;
  onDeleteProject: (project: Project) => Promise<void>;
  onClearCompleted: () => Promise<void>;
}) {
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState('#657153');
  const [projectName, setProjectName] = useState('');
  const [projectColor, setProjectColor] = useState('#6f7c64');
  const [notificationPermission, setNotificationPermission] = useState(() => 'Notification' in window ? Notification.permission : 'unsupported');

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

  return (
    <div className="settings-grid">
      <section className="settings-card">
        <div className="settings-card-heading"><span><Palette size={18} /></span><div><h2>表示</h2><p>見た目と起動時の画面</p></div></div>
        <div className="setting-field"><label htmlFor="default-view">最初に開く画面</label><select id="default-view" value={preferences.defaultView} onChange={(event) => onPreferencesChange((current) => ({ ...current, defaultView: event.target.value as Preferences['defaultView'] }))}><option value="dashboard">ダッシュボード</option><option value="today">今日</option><option value="upcoming">今後の予定</option><option value="tasks">すべてのタスク</option><option value="wishes">やりたいこと</option><option value="done">完了済み</option></select></div>
        <div className="setting-field"><span>表示密度</span><div className="setting-segments"><button className={preferences.density === 'comfortable' ? 'active' : ''} onClick={() => onPreferencesChange((current) => ({ ...current, density: 'comfortable' }))}>ゆったり</button><button className={preferences.density === 'compact' ? 'active' : ''} onClick={() => onPreferencesChange((current) => ({ ...current, density: 'compact' }))}>コンパクト</button></div></div>
        <div className="setting-field"><span>アクセントカラー</span><div className="accent-options">{(Object.keys(accentColors) as Accent[]).map((accent) => <button key={accent} className={preferences.accent === accent ? 'active' : ''} style={{ background: accentColors[accent].base }} onClick={() => onPreferencesChange((current) => ({ ...current, accent }))} aria-label={accent} />)}</div></div>
      </section>

      <section className="settings-card">
        <div className="settings-card-heading"><span><Bell size={18} /></span><div><h2>通知</h2><p>期限を忘れないための通知</p></div></div>
        <div className="setting-status"><div><strong>ブラウザ通知</strong><p>{notificationPermission === 'granted' ? '通知が許可されています。' : notificationPermission === 'denied' ? 'ブラウザの設定でブロックされています。' : notificationPermission === 'unsupported' ? 'このブラウザは通知に対応していません。' : '通知はまだ許可されていません。'}</p></div><button disabled={notificationPermission === 'granted' || notificationPermission === 'unsupported'} onClick={requestNotifications}>{notificationPermission === 'granted' ? '許可済み' : '通知を許可'}</button></div>
        <p className="settings-hint">現在の通知は、MyManagerを開いている間に表示されます。</p>
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
        <div className="settings-actions"><a href="/api/export" download><Download size={16} /><span><strong>JSONを書き出す</strong><small>すべてのデータをバックアップ</small></span></a><button className="danger-action" disabled={!completedCount} onClick={onClearCompleted}><Trash2 size={16} /><span><strong>完了済みを削除</strong><small>{completedCount}件の完了データ</small></span></button></div>
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

function ItemRow({ item, onToggle, onRemove, onEdit }: { item: Item; onToggle: (item: Item) => void; onRemove: (item: Item) => void; onEdit: (item: Item) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dueLabel = item.dueDate ? new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric' }).format(new Date(`${item.dueDate}T00:00:00`)) : null;
  const overdue = item.dueDate && item.dueDate < localDate() && item.status === 'open';
  const completedSubtasks = item.subtasks.filter((subtask) => subtask.completed).length;
  return (
    <article className={`item-row ${item.status === 'done' ? 'item-row--done' : ''}`}>
      <button className="check-button" onClick={() => onToggle(item)} aria-label={item.status === 'done' ? '未完了に戻す' : '完了にする'}>{item.status === 'done' && <Check size={15} />}</button>
      <div className="item-body" onDoubleClick={() => onEdit(item)}><h3>{item.title}</h3>{item.note && <p>{item.note}</p>}{item.subtasks.length > 0 && <div className="subtask-progress"><ListChecks size={12} /><span>{completedSubtasks}/{item.subtasks.length}</span><i><b style={{ width: `${(completedSubtasks / item.subtasks.length) * 100}%` }} /></i></div>}<div className="item-meta">{item.projectName && <span className="project-chip"><Folder size={13} style={{ color: item.projectColor ?? '#657153' }} />{item.projectName}</span>}{item.categoryName && <span className="category-chip"><i style={{ background: item.categoryColor ?? '#657153' }} />{item.categoryName}</span>}{dueLabel && <span className={overdue ? 'overdue' : ''}><CalendarDays size={13} />{overdue ? '期限切れ · ' : ''}{dueLabel}</span>}{item.recurrence !== 'none' && <span><Repeat2 size={13} />{item.recurrence === 'daily' ? '毎日' : item.recurrence === 'weekly' ? '毎週' : '毎月'}</span>}{item.reminderAt && <span><Bell size={12} />通知</span>}{item.priority === 'high' && <span className="priority-high">優先</span>}</div></div>
      <div className="item-menu-wrap"><button className="more-button" onClick={() => setMenuOpen((open) => !open)} aria-label="操作"><MoreHorizontal size={19} /></button>{menuOpen && <div className="item-menu"><button className="edit-action" onClick={() => { setMenuOpen(false); onEdit(item); }}><Edit3 size={15} />編集</button><button onClick={() => onRemove(item)}><Trash2 size={15} />削除</button></div>}</div>
    </article>
  );
}

function Composer({ categories, projects, initialItem, defaultKind, defaultDate, onClose, onSubmit, onCreateProject }: { categories: Category[]; projects: Project[]; initialItem: Item | null; defaultKind: ItemKind; defaultDate: string | null; onClose: () => void; onSubmit: (input: ItemInput) => Promise<void>; onCreateProject: (name: string) => Promise<Project> }) {
  const [title, setTitle] = useState(initialItem?.title ?? '');
  const [note, setNote] = useState(initialItem?.note ?? '');
  const [kind, setKind] = useState<ItemKind>(initialItem?.kind ?? defaultKind);
  const [dueDate, setDueDate] = useState(initialItem?.dueDate ?? defaultDate ?? '');
  const [priority, setPriority] = useState<Priority>(initialItem?.priority ?? 'medium');
  const [categoryId, setCategoryId] = useState(initialItem?.categoryId ? String(initialItem.categoryId) : '');
  const [projectId, setProjectId] = useState(initialItem?.projectId ? String(initialItem.projectId) : '');
  const [recurrence, setRecurrence] = useState<Recurrence>(initialItem?.recurrence ?? 'none');
  const [reminderAt, setReminderAt] = useState(initialItem?.reminderAt ?? '');
  const [subtasks, setSubtasks] = useState<SubtaskInput[]>(initialItem?.subtasks.map((subtask) => ({ title: subtask.title, completed: Boolean(subtask.completed) })) ?? []);
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
    await onSubmit({ title, note, kind, dueDate: kind === 'task' ? dueDate || null : null, priority, categoryId: categoryId ? Number(categoryId) : null, projectId: projectId ? Number(projectId) : null, recurrence: kind === 'task' ? recurrence : 'none', reminderAt: kind === 'task' ? reminderAt || null : null, subtasks: kind === 'task' ? subtasks.filter((subtask) => subtask.title.trim()) : [] });
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

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <form className="composer" onSubmit={submit}>
        <div className="composer-header"><div><p className="eyebrow">{initialItem ? 'EDIT ITEM' : 'NEW ITEM'}</p><h2>{initialItem ? '項目を編集' : '新しく追加'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></div>
        <div className="kind-switch"><button type="button" className={kind === 'task' ? 'active' : ''} onClick={() => setKind('task')}><CheckCircle2 size={17} />タスク</button><button type="button" className={kind === 'wish' ? 'active' : ''} onClick={() => setKind('wish')}><Sparkles size={17} />やりたいこと</button></div>
        <label className="field"><span>タイトル</span><input autoFocus={!window.matchMedia('(pointer: coarse)').matches} maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === 'task' ? '何をしますか？' : 'いつか叶えたいことは？'} /></label>
        <label className="field"><span>メモ <small>任意</small></span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="詳細やアイデアを書き留める" /></label>
        {kind === 'task' && <div className="subtask-editor"><div className="subtask-editor-heading"><span><ListChecks size={15} />サブタスク</span><small>{subtasks.filter((subtask) => subtask.completed).length}/{subtasks.length}</small></div><div className="subtask-editor-list">{subtasks.map((subtask, index) => <div key={index}><button type="button" className={subtask.completed ? 'checked' : ''} onClick={() => setSubtasks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, completed: !item.completed } : item))}>{subtask.completed && <Check size={13} />}</button><input value={subtask.title} onChange={(event) => setSubtasks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} placeholder="小さな作業を入力" /><button type="button" className="remove-subtask" onClick={() => setSubtasks((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={14} /></button></div>)}</div><button type="button" className="add-subtask" onClick={() => setSubtasks((current) => [...current, { title: '', completed: false }])}><Plus size={14} />サブタスクを追加</button></div>}
        <div className="field-grid composer-options">
          {kind === 'task' && <div className="field date-field"><label htmlFor="due-date">期限</label><input id="due-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /><span className="date-shortcuts"><button type="button" className={dueDate === localDate() ? 'active' : ''} onClick={() => setDueDate(localDate())}>今日</button><button type="button" className={dueDate === dateAfter(1) ? 'active' : ''} onClick={() => setDueDate(dateAfter(1))}>明日</button><button type="button" className={!dueDate ? 'active' : ''} onClick={() => setDueDate('')}>期限なし</button></span></div>}
          <label className="field"><span>カテゴリ</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">なし</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          <label className="field"><span>優先度</span><select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
          <label className="field"><span>プロジェクト</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">なし</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select><button type="button" className="inline-link" onClick={() => setAddingProject((value) => !value)}>＋ 新しいプロジェクト</button></label>
          {kind === 'task' && <label className="field"><span>繰り返し</span><select value={recurrence} onChange={(event) => setRecurrence(event.target.value as Recurrence)}><option value="none">なし</option><option value="daily">毎日</option><option value="weekly">毎週</option><option value="monthly">毎月</option></select></label>}
        </div>
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
