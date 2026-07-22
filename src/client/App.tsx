import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Inbox,
  Download,
  Edit3,
  Folder,
  LayoutList,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Repeat2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { Category, Item, ItemInput, ItemKind, ItemUpdateResult, Priority, Project, Recurrence } from '../shared/types';

type View = 'today' | 'upcoming' | 'overdue' | 'tasks' | 'wishes' | 'done';
type Sort = 'smart' | 'due' | 'priority' | 'created';

const views: { id: View; label: string; icon: typeof Circle }[] = [
  { id: 'today', label: '今日', icon: CalendarDays },
  { id: 'upcoming', label: '今後の予定', icon: CalendarDays },
  { id: 'overdue', label: '期限切れ', icon: Bell },
  { id: 'tasks', label: 'すべてのタスク', icon: LayoutList },
  { id: 'wishes', label: 'やりたいこと', icon: Sparkles },
  { id: 'done', label: '完了済み', icon: CheckCircle2 },
];

const viewCopy: Record<View, { title: string; subtitle: string }> = {
  today: { title: '今日', subtitle: '今日やることに、静かに集中しましょう。' },
  upcoming: { title: '今後の予定', subtitle: 'これから一週間の予定を見渡せます。' },
  overdue: { title: '期限切れ', subtitle: '残っていることを整理して、すっきりさせましょう。' },
  tasks: { title: 'すべてのタスク', subtitle: '予定していることをまとめて確認できます。' },
  wishes: { title: 'やりたいこと', subtitle: 'いつか叶えたいことを、忘れない場所へ。' },
  done: { title: '完了済み', subtitle: '積み重ねてきた成果です。' },
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
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [view, setView] = useState<View>('today');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [sort, setSort] = useState<Sort>('smart');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState<number | 'all'>('all');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    today: items.filter((item) => item.status === 'open' && item.kind === 'task' && item.dueDate === localDate()).length,
    upcoming: items.filter((item) => item.status === 'open' && item.kind === 'task' && Boolean(item.dueDate && item.dueDate > localDate() && item.dueDate <= dateAfter(7))).length,
    overdue: items.filter((item) => item.status === 'open' && item.kind === 'task' && Boolean(item.dueDate && item.dueDate < localDate())).length,
    tasks: items.filter((item) => item.status === 'open' && item.kind === 'task').length,
    wishes: items.filter((item) => item.status === 'open' && item.kind === 'wish').length,
    done: items.filter((item) => item.status === 'done').length,
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

  async function createProject(name: string) {
    const project = await request<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) });
    setProjects((current) => [...current, project].sort((a, b) => a.name.localeCompare(b.name, 'ja')));
    return project;
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

  function openNew() {
    setEditingItem(null);
    setComposerOpen(true);
  }

  function openEdit(item: Item) {
    setEditingItem(item);
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
    } catch (reason) {
      setItems((current) => current.map((candidate) => candidate.id === item.id ? item : candidate));
      setError((reason as Error).message);
    }
  }

  async function removeItem(item: Item) {
    const previous = items;
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    try {
      await request<void>(`/api/items/${item.id}`, { method: 'DELETE' });
    } catch (reason) {
      setItems(previous);
      setError((reason as Error).message);
    }
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
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}>
        <div className="brand"><span className="brand-mark"><Check size={18} /></span><span>MyManager</span></div>
        <nav className="nav-list" aria-label="メインメニュー">
          <p className="nav-label">管理</p>
          {views.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${view === id ? 'nav-item--active' : ''}`} onClick={() => navigate(id)}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span><span className="nav-count">{counts[id]}</span>
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
          <div className="search-wrap"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="タスクを検索..." aria-label="検索" />{query && <button onClick={() => setQuery('')} aria-label="検索をクリア"><X size={15} /></button>}</div>
          <div className="top-actions"><a className="export-button" href="/api/export" download title="データを書き出す"><Download size={17} /></a><button className="add-button" onClick={openNew}><Plus size={18} /><span>新しく追加</span></button></div>
        </header>

        <section className="content">
          <div className="page-heading">
            <div><p className="eyebrow">MY MANAGER</p><h1>{viewCopy[view].title}</h1><p>{viewCopy[view].subtitle}</p></div>
            <div className="date-card"><CalendarDays size={18} /><span>{new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</span></div>
          </div>

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
        </section>
      </main>

      <button className="mobile-fab" onClick={openNew} aria-label="新しい項目を追加"><Plus size={24} /></button>
      <nav className="bottom-nav" aria-label="スマートフォン用メニュー">
        {views.filter(({ id }) => id !== 'overdue').map(({ id, label, icon: Icon }) => (
          <button key={id} className={view === id ? 'active' : ''} onClick={() => navigate(id)} aria-current={view === id ? 'page' : undefined}>
            <span className="bottom-nav-icon"><Icon size={20} strokeWidth={1.8} />{counts[id] > 0 && <i>{counts[id] > 99 ? '99+' : counts[id]}</i>}</span>
            <span>{id === 'tasks' ? 'タスク' : id === 'wishes' ? 'やりたい' : id === 'upcoming' ? '予定' : label}</span>
          </button>
        ))}
      </nav>

      {composerOpen && <Composer categories={categories} projects={projects} initialItem={editingItem} defaultKind={view === 'wishes' ? 'wish' : 'task'} defaultToday={view === 'today'} onClose={() => { setComposerOpen(false); setEditingItem(null); }} onSubmit={editingItem ? updateItem : createItem} onCreateProject={createProject} />}
      {error && <div className="toast" role="alert"><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}
    </div>
  );
}

function ItemRow({ item, onToggle, onRemove, onEdit }: { item: Item; onToggle: (item: Item) => void; onRemove: (item: Item) => void; onEdit: (item: Item) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dueLabel = item.dueDate ? new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric' }).format(new Date(`${item.dueDate}T00:00:00`)) : null;
  const overdue = item.dueDate && item.dueDate < localDate() && item.status === 'open';
  return (
    <article className={`item-row ${item.status === 'done' ? 'item-row--done' : ''}`}>
      <button className="check-button" onClick={() => onToggle(item)} aria-label={item.status === 'done' ? '未完了に戻す' : '完了にする'}>{item.status === 'done' && <Check size={15} />}</button>
      <div className="item-body" onDoubleClick={() => onEdit(item)}><h3>{item.title}</h3>{item.note && <p>{item.note}</p>}<div className="item-meta">{item.projectName && <span className="project-chip"><Folder size={13} style={{ color: item.projectColor ?? '#657153' }} />{item.projectName}</span>}{item.categoryName && <span className="category-chip"><i style={{ background: item.categoryColor ?? '#657153' }} />{item.categoryName}</span>}{dueLabel && <span className={overdue ? 'overdue' : ''}><CalendarDays size={13} />{overdue ? '期限切れ · ' : ''}{dueLabel}</span>}{item.recurrence !== 'none' && <span><Repeat2 size={13} />{item.recurrence === 'daily' ? '毎日' : item.recurrence === 'weekly' ? '毎週' : '毎月'}</span>}{item.reminderAt && <span><Bell size={12} />通知</span>}{item.priority === 'high' && <span className="priority-high">優先</span>}</div></div>
      <div className="item-menu-wrap"><button className="more-button" onClick={() => setMenuOpen((open) => !open)} aria-label="操作"><MoreHorizontal size={19} /></button>{menuOpen && <div className="item-menu"><button className="edit-action" onClick={() => { setMenuOpen(false); onEdit(item); }}><Edit3 size={15} />編集</button><button onClick={() => onRemove(item)}><Trash2 size={15} />削除</button></div>}</div>
    </article>
  );
}

function Composer({ categories, projects, initialItem, defaultKind, defaultToday, onClose, onSubmit, onCreateProject }: { categories: Category[]; projects: Project[]; initialItem: Item | null; defaultKind: ItemKind; defaultToday: boolean; onClose: () => void; onSubmit: (input: ItemInput) => Promise<void>; onCreateProject: (name: string) => Promise<Project> }) {
  const [title, setTitle] = useState(initialItem?.title ?? '');
  const [note, setNote] = useState(initialItem?.note ?? '');
  const [kind, setKind] = useState<ItemKind>(initialItem?.kind ?? defaultKind);
  const [dueDate, setDueDate] = useState(initialItem?.dueDate ?? (defaultToday ? localDate() : ''));
  const [priority, setPriority] = useState<Priority>(initialItem?.priority ?? 'medium');
  const [categoryId, setCategoryId] = useState(initialItem?.categoryId ? String(initialItem.categoryId) : '');
  const [projectId, setProjectId] = useState(initialItem?.projectId ? String(initialItem.projectId) : '');
  const [recurrence, setRecurrence] = useState<Recurrence>(initialItem?.recurrence ?? 'none');
  const [reminderAt, setReminderAt] = useState(initialItem?.reminderAt ?? '');
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
    await onSubmit({ title, note, kind, dueDate: kind === 'task' ? dueDate || null : null, priority, categoryId: categoryId ? Number(categoryId) : null, projectId: projectId ? Number(projectId) : null, recurrence: kind === 'task' ? recurrence : 'none', reminderAt: kind === 'task' ? reminderAt || null : null });
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
