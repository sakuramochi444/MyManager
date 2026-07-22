import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Inbox,
  LayoutList,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { Category, Item, ItemInput, ItemKind, Priority } from '../shared/types';

type View = 'today' | 'tasks' | 'wishes' | 'done';

const views: { id: View; label: string; icon: typeof Circle }[] = [
  { id: 'today', label: '今日', icon: CalendarDays },
  { id: 'tasks', label: 'すべてのタスク', icon: LayoutList },
  { id: 'wishes', label: 'やりたいこと', icon: Sparkles },
  { id: 'done', label: '完了済み', icon: CheckCircle2 },
];

const viewCopy: Record<View, { title: string; subtitle: string }> = {
  today: { title: '今日', subtitle: '今日やることに、静かに集中しましょう。' },
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
  const [view, setView] = useState<View>('today');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([request<Item[]>('/api/items'), request<Category[]>('/api/categories')])
      .then(([nextItems, nextCategories]) => {
        setItems(nextItems);
        setCategories(nextCategories);
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
    return items.filter((item) => {
      const matchesView =
        view === 'today' ? item.status === 'open' && item.kind === 'task' && item.dueDate === today
          : view === 'tasks' ? item.status === 'open' && item.kind === 'task'
            : view === 'wishes' ? item.status === 'open' && item.kind === 'wish'
              : item.status === 'done';
      const needle = query.trim().toLocaleLowerCase('ja');
      return matchesView && (!needle || `${item.title} ${item.note} ${item.categoryName ?? ''}`.toLocaleLowerCase('ja').includes(needle));
    });
  }, [items, query, view]);

  const counts = useMemo(() => ({
    today: items.filter((item) => item.status === 'open' && item.kind === 'task' && item.dueDate === localDate()).length,
    tasks: items.filter((item) => item.status === 'open' && item.kind === 'task').length,
    wishes: items.filter((item) => item.status === 'open' && item.kind === 'wish').length,
    done: items.filter((item) => item.status === 'done').length,
  }), [items]);

  async function createItem(input: ItemInput) {
    try {
      const item = await request<Item>('/api/items', { method: 'POST', body: JSON.stringify(input) });
      setItems((current) => [item, ...current]);
      setComposerOpen(false);
      setView(item.kind === 'wish' ? 'wishes' : input.dueDate === localDate() ? 'today' : 'tasks');
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function toggleItem(item: Item) {
    const status = item.status === 'done' ? 'open' : 'done';
    setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, status } : candidate));
    try {
      const updated = await request<Item>(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setItems((current) => current.map((candidate) => candidate.id === item.id ? updated : candidate));
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
          <button className="add-button" onClick={() => setComposerOpen(true)}><Plus size={18} /><span>新しく追加</span></button>
        </header>

        <section className="content">
          <div className="page-heading">
            <div><p className="eyebrow">MY MANAGER</p><h1>{viewCopy[view].title}</h1><p>{viewCopy[view].subtitle}</p></div>
            <div className="date-card"><CalendarDays size={18} /><span>{new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</span></div>
          </div>

          <div className="list-card">
            <div className="list-header"><span>{visibleItems.length}件</span><button><span>並び順</span><ChevronDown size={15} /></button></div>
            {loading ? <LoadingRows /> : visibleItems.length ? (
              <div className="item-list">
                {visibleItems.map((item) => <ItemRow key={item.id} item={item} onToggle={toggleItem} onRemove={removeItem} />)}
              </div>
            ) : <EmptyState view={view} hasQuery={Boolean(query)} onAdd={() => setComposerOpen(true)} />}
          </div>
        </section>
      </main>

      <button className="mobile-fab" onClick={() => setComposerOpen(true)} aria-label="新しい項目を追加"><Plus size={24} /></button>
      <nav className="bottom-nav" aria-label="スマートフォン用メニュー">
        {views.map(({ id, label, icon: Icon }) => (
          <button key={id} className={view === id ? 'active' : ''} onClick={() => navigate(id)} aria-current={view === id ? 'page' : undefined}>
            <span className="bottom-nav-icon"><Icon size={20} strokeWidth={1.8} />{counts[id] > 0 && <i>{counts[id] > 99 ? '99+' : counts[id]}</i>}</span>
            <span>{id === 'tasks' ? 'タスク' : id === 'wishes' ? 'やりたい' : label}</span>
          </button>
        ))}
      </nav>

      {composerOpen && <Composer categories={categories} defaultKind={view === 'wishes' ? 'wish' : 'task'} defaultToday={view === 'today'} onClose={() => setComposerOpen(false)} onSubmit={createItem} />}
      {error && <div className="toast" role="alert"><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}
    </div>
  );
}

function ItemRow({ item, onToggle, onRemove }: { item: Item; onToggle: (item: Item) => void; onRemove: (item: Item) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dueLabel = item.dueDate ? new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric' }).format(new Date(`${item.dueDate}T00:00:00`)) : null;
  const overdue = item.dueDate && item.dueDate < localDate() && item.status === 'open';
  return (
    <article className={`item-row ${item.status === 'done' ? 'item-row--done' : ''}`}>
      <button className="check-button" onClick={() => onToggle(item)} aria-label={item.status === 'done' ? '未完了に戻す' : '完了にする'}>{item.status === 'done' && <Check size={15} />}</button>
      <div className="item-body"><h3>{item.title}</h3>{item.note && <p>{item.note}</p>}<div className="item-meta">{item.categoryName && <span className="category-chip"><i style={{ background: item.categoryColor ?? '#657153' }} />{item.categoryName}</span>}{dueLabel && <span className={overdue ? 'overdue' : ''}><CalendarDays size={13} />{overdue ? '期限切れ · ' : ''}{dueLabel}</span>}{item.priority === 'high' && <span className="priority-high">優先</span>}</div></div>
      <div className="item-menu-wrap"><button className="more-button" onClick={() => setMenuOpen((open) => !open)} aria-label="操作"><MoreHorizontal size={19} /></button>{menuOpen && <div className="item-menu"><button onClick={() => onRemove(item)}><Trash2 size={15} />削除</button></div>}</div>
    </article>
  );
}

function Composer({ categories, defaultKind, defaultToday, onClose, onSubmit }: { categories: Category[]; defaultKind: ItemKind; defaultToday: boolean; onClose: () => void; onSubmit: (input: ItemInput) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<ItemKind>(defaultKind);
  const [dueDate, setDueDate] = useState(defaultToday ? localDate() : '');
  const [priority, setPriority] = useState<Priority>('medium');
  const [categoryId, setCategoryId] = useState('');
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
    await onSubmit({ title, note, kind, dueDate: kind === 'task' ? dueDate || null : null, priority, categoryId: categoryId ? Number(categoryId) : null });
    setSaving(false);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <form className="composer" onSubmit={submit}>
        <div className="composer-header"><div><p className="eyebrow">NEW ITEM</p><h2>新しく追加</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20} /></button></div>
        <div className="kind-switch"><button type="button" className={kind === 'task' ? 'active' : ''} onClick={() => setKind('task')}><CheckCircle2 size={17} />タスク</button><button type="button" className={kind === 'wish' ? 'active' : ''} onClick={() => setKind('wish')}><Sparkles size={17} />やりたいこと</button></div>
        <label className="field"><span>タイトル</span><input autoFocus maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === 'task' ? '何をしますか？' : 'いつか叶えたいことは？'} /></label>
        <label className="field"><span>メモ <small>任意</small></span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="詳細やアイデアを書き留める" /></label>
        <div className="field-grid">
          {kind === 'task' && <div className="field date-field"><label htmlFor="due-date">期限</label><input id="due-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /><span className="date-shortcuts"><button type="button" className={dueDate === localDate() ? 'active' : ''} onClick={() => setDueDate(localDate())}>今日</button><button type="button" className={dueDate === dateAfter(1) ? 'active' : ''} onClick={() => setDueDate(dateAfter(1))}>明日</button><button type="button" className={!dueDate ? 'active' : ''} onClick={() => setDueDate('')}>期限なし</button></span></div>}
          <label className="field"><span>カテゴリ</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">なし</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
          <label className="field"><span>優先度</span><select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
        </div>
        <div className="composer-actions"><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button className="primary-button" disabled={!title.trim() || saving}>{saving ? '追加中...' : '追加する'}</button></div>
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
