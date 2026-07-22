import { Hono } from 'hono';
import type { ItemInput, ItemStatus, Recurrence, SubtaskInput } from '../shared/types';

type Bindings = { mymanager_db: D1Database };
type ItemRow = Record<string, unknown>;
const api = new Hono<{ Bindings: Bindings }>().basePath('/api');

const itemSelect = `
  SELECT i.id, i.title, i.note, i.kind, i.status, i.priority,
    i.due_date AS dueDate, i.category_id AS categoryId,
    c.name AS categoryName, c.color AS categoryColor,
    i.project_id AS projectId, p.name AS projectName, p.color AS projectColor,
    i.recurrence, i.reminder_at AS reminderAt, i.sort_order AS sortOrder,
    i.created_at AS createdAt, i.completed_at AS completedAt, i.deleted_at AS deletedAt
  FROM items i
  LEFT JOIN categories c ON c.id = i.category_id
  LEFT JOIN projects p ON p.id = i.project_id`;

function nextDate(value: unknown, recurrence: Recurrence) {
  if (!value || recurrence === 'none') return null;
  const date = new Date(`${String(value)}T00:00:00Z`);
  if (recurrence === 'daily') date.setUTCDate(date.getUTCDate() + 1);
  if (recurrence === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
  if (recurrence === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

async function getItem(db: D1Database, id: number) {
  const item = await db.prepare(`${itemSelect} WHERE i.id = ?`).bind(id).first<Record<string, unknown>>();
  if (!item) return null;
  const subtasks = await db.prepare('SELECT id, item_id AS itemId, title, completed, sort_order AS sortOrder FROM subtasks WHERE item_id = ? ORDER BY sort_order, id').bind(id).all();
  return { ...item, subtasks: subtasks.results };
}

async function replaceSubtasks(db: D1Database, itemId: number, subtasks: SubtaskInput[]) {
  const statements = [db.prepare('DELETE FROM subtasks WHERE item_id = ?').bind(itemId)];
  subtasks.filter((subtask) => subtask.title.trim()).forEach((subtask, index) => {
    statements.push(db.prepare('INSERT INTO subtasks (item_id, title, completed, sort_order) VALUES (?, ?, ?, ?)').bind(itemId, subtask.title.trim(), subtask.completed ? 1 : 0, index));
  });
  await db.batch(statements);
}

async function getItems(db: D1Database, deleted: boolean) {
  const result = await db.prepare(
    `${itemSelect} WHERE i.deleted_at IS ${deleted ? 'NOT ' : ''}NULL ORDER BY i.status ASC, i.sort_order ASC, i.due_date IS NULL, i.due_date ASC, i.created_at DESC`,
  ).all();
  const subtaskResult = await db.prepare('SELECT id, item_id AS itemId, title, completed, sort_order AS sortOrder FROM subtasks ORDER BY sort_order, id').all();
  const subtasksByItem = new Map<number, unknown[]>();
  subtaskResult.results.forEach((subtask) => {
    const itemId = Number((subtask as Record<string, unknown>).itemId);
    subtasksByItem.set(itemId, [...(subtasksByItem.get(itemId) ?? []), subtask]);
  });
  return result.results.map((item) => ({ ...item, subtasks: subtasksByItem.get(Number((item as Record<string, unknown>).id)) ?? [] }));
}

api.get('/items', async (c) => {
  const db = c.env.mymanager_db;
  return c.json(await getItems(db, false));
});

api.get('/trash', async (c) => c.json(await getItems(c.env.mymanager_db, true)));

api.post('/items', async (c) => {
  const body = await c.req.json<ItemInput>();
  const title = body.title?.trim();
  if (!title || title.length > 200 || !['task', 'wish'].includes(body.kind)) {
    return c.json({ error: '入力内容を確認してください。' }, 400);
  }
  const result = await c.env.mymanager_db.prepare(
    `INSERT INTO items (title, note, kind, priority, due_date, category_id, project_id, recurrence, reminder_at, sort_order, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) RETURNING id`,
  ).bind(
    title, body.note?.trim() ?? '', body.kind, body.priority ?? 'medium', body.dueDate || null,
    body.categoryId || null, body.projectId || null, body.recurrence ?? 'none', body.reminderAt || null,
    body.sortOrder ?? 0,
  ).first<{ id: number }>();
  if (body.subtasks?.length) await replaceSubtasks(c.env.mymanager_db, result!.id, body.subtasks);
  return c.json(await getItem(c.env.mymanager_db, result!.id), 201);
});

api.patch('/items/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<Partial<ItemInput> & { status?: ItemStatus }>();
  if (!Number.isInteger(id)) return c.json({ error: '不正なIDです。' }, 400);
  const db = c.env.mymanager_db;
  const current = await db.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<ItemRow>();
  if (!current) return c.json({ error: '項目が見つかりません。' }, 404);

  const status = body.status ?? current.status;
  const title = body.title === undefined ? String(current.title) : body.title.trim();
  if (!title) return c.json({ error: 'タイトルは必須です。' }, 400);
  const recurrence = (body.recurrence ?? current.recurrence) as Recurrence;

  await db.prepare(
    `UPDATE items SET title = ?, note = ?, kind = ?, status = ?, priority = ?, due_date = ?, category_id = ?,
      project_id = ?, recurrence = ?, reminder_at = ?, sort_order = ?, updated_at = datetime('now'),
      completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END
     WHERE id = ?`,
  ).bind(
    title, body.note ?? current.note, body.kind ?? current.kind, status, body.priority ?? current.priority,
    body.dueDate === undefined ? current.due_date : body.dueDate || null,
    body.categoryId === undefined ? current.category_id : body.categoryId || null,
    body.projectId === undefined ? current.project_id : body.projectId || null,
    recurrence,
    body.reminderAt === undefined ? current.reminder_at : body.reminderAt || null,
    body.sortOrder ?? current.sort_order,
    status, id,
  ).run();
  if (body.subtasks !== undefined) await replaceSubtasks(db, id, body.subtasks);

  let nextItem = null;
  if (status === 'done' && current.status === 'open' && recurrence !== 'none') {
    const dueDate = nextDate(body.dueDate === undefined ? current.due_date : body.dueDate, recurrence);
    const inserted = await db.prepare(
      `INSERT INTO items (title, note, kind, priority, due_date, category_id, project_id, recurrence, reminder_at, sort_order, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, datetime('now')) RETURNING id`,
    ).bind(
      title, body.note ?? current.note, body.kind ?? current.kind, body.priority ?? current.priority, dueDate,
      body.categoryId === undefined ? current.category_id : body.categoryId || null,
      body.projectId === undefined ? current.project_id : body.projectId || null,
      recurrence, body.sortOrder ?? current.sort_order,
    ).first<{ id: number }>();
    const sourceSubtasks = body.subtasks ?? (await db.prepare('SELECT title, completed FROM subtasks WHERE item_id = ? ORDER BY sort_order, id').bind(id).all()).results.map((subtask) => ({ title: String((subtask as Record<string, unknown>).title), completed: false }));
    if (sourceSubtasks.length) await replaceSubtasks(db, inserted!.id, sourceSubtasks.map((subtask) => ({ ...subtask, completed: false })));
    nextItem = await getItem(db, inserted!.id);
  }
  return c.json({ item: await getItem(db, id), nextItem });
});

api.delete('/items/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: '不正なIDです。' }, 400);
  const db = c.env.mymanager_db;
  if (c.req.query('permanent') === 'true') {
    await db.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
    return c.body(null, 204);
  }
  await db.prepare("UPDATE items SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").bind(id).run();
  const item = await getItem(db, id);
  if (!item) return c.json({ error: '項目が見つかりません。' }, 404);
  return c.json(item);
});

api.post('/items/:id/restore', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: '不正なIDです。' }, 400);
  const db = c.env.mymanager_db;
  await db.prepare("UPDATE items SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NOT NULL").bind(id).run();
  const item = await getItem(db, id);
  if (!item) return c.json({ error: '項目が見つかりません。' }, 404);
  return c.json(item);
});

api.delete('/trash', async (c) => {
  const result = await c.env.mymanager_db.prepare('DELETE FROM items WHERE deleted_at IS NOT NULL').run();
  return c.json({ deleted: result.meta.changes });
});

api.delete('/items', async (c) => {
  if (c.req.query('status') !== 'done') return c.json({ error: '削除対象を指定してください。' }, 400);
  const result = await c.env.mymanager_db.prepare("UPDATE items SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE status = 'done' AND deleted_at IS NULL").run();
  return c.json({ deleted: result.meta.changes });
});

api.get('/categories', async (c) => {
  const result = await c.env.mymanager_db.prepare('SELECT id, name, color FROM categories ORDER BY name').all();
  return c.json(result.results);
});

api.post('/categories', async (c) => {
  const body = await c.req.json<{ name?: string; color?: string }>();
  const name = body.name?.trim();
  const color = /^#[0-9a-f]{6}$/i.test(body.color ?? '') ? body.color! : '#657153';
  if (!name || name.length > 40) return c.json({ error: 'カテゴリ名を入力してください。' }, 400);
  try {
    const result = await c.env.mymanager_db.prepare('INSERT INTO categories (name, color) VALUES (?, ?) RETURNING id, name, color').bind(name, color).first();
    return c.json(result, 201);
  } catch {
    return c.json({ error: '同じ名前のカテゴリがあります。' }, 409);
  }
});

api.patch('/categories/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ name?: string; color?: string }>();
  const name = body.name?.trim();
  const color = /^#[0-9a-f]{6}$/i.test(body.color ?? '') ? body.color! : null;
  if (!Number.isInteger(id) || !name || !color || name.length > 40) return c.json({ error: 'カテゴリの入力内容を確認してください。' }, 400);
  try {
    const result = await c.env.mymanager_db.prepare('UPDATE categories SET name = ?, color = ? WHERE id = ? RETURNING id, name, color').bind(name, color, id).first();
    if (!result) return c.json({ error: 'カテゴリが見つかりません。' }, 404);
    return c.json(result);
  } catch {
    return c.json({ error: '同じ名前のカテゴリがあります。' }, 409);
  }
});

api.delete('/categories/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: '不正なIDです。' }, 400);
  await c.env.mymanager_db.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
  return c.body(null, 204);
});

api.get('/projects', async (c) => {
  const result = await c.env.mymanager_db.prepare('SELECT id, name, color, archived FROM projects WHERE archived = 0 ORDER BY name').all();
  return c.json(result.results);
});

api.post('/projects', async (c) => {
  const body = await c.req.json<{ name?: string; color?: string }>();
  const name = body.name?.trim();
  const color = /^#[0-9a-f]{6}$/i.test(body.color ?? '') ? body.color! : '#6f7c64';
  if (!name || name.length > 60) return c.json({ error: 'プロジェクト名を入力してください。' }, 400);
  try {
    const result = await c.env.mymanager_db.prepare('INSERT INTO projects (name, color) VALUES (?, ?) RETURNING id, name, color, archived').bind(name, color).first();
    return c.json(result, 201);
  } catch {
    return c.json({ error: '同じ名前のプロジェクトがあります。' }, 409);
  }
});

api.patch('/projects/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ name?: string; color?: string; archived?: boolean }>();
  const current = await c.env.mymanager_db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!Number.isInteger(id) || !current) return c.json({ error: 'プロジェクトが見つかりません。' }, 404);
  const name = body.name?.trim() || String(current.name);
  const color = /^#[0-9a-f]{6}$/i.test(body.color ?? '') ? body.color! : String(current.color);
  try {
    const result = await c.env.mymanager_db.prepare('UPDATE projects SET name = ?, color = ?, archived = ? WHERE id = ? RETURNING id, name, color, archived').bind(name, color, body.archived === undefined ? current.archived : body.archived ? 1 : 0, id).first();
    return c.json(result);
  } catch {
    return c.json({ error: '同じ名前のプロジェクトがあります。' }, 409);
  }
});

api.delete('/projects/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: '不正なIDです。' }, 400);
  await c.env.mymanager_db.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
  return c.body(null, 204);
});

api.get('/export', async (c) => {
  const db = c.env.mymanager_db;
  const [items, categories, projects, subtasks] = await Promise.all([
    db.prepare('SELECT * FROM items ORDER BY id').all(),
    db.prepare('SELECT * FROM categories ORDER BY id').all(),
    db.prepare('SELECT * FROM projects ORDER BY id').all(),
    db.prepare('SELECT * FROM subtasks ORDER BY id').all(),
  ]);
  c.header('Content-Disposition', `attachment; filename="mymanager-${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json({ version: 2, exportedAt: new Date().toISOString(), items: items.results, categories: categories.results, projects: projects.results, subtasks: subtasks.results });
});

api.post('/import', async (c) => {
  const backup = await c.req.json<Record<string, unknown>>().catch(() => null);
  const arrays = backup && ['items', 'categories', 'projects'].every((key) => Array.isArray(backup[key])) && (backup.subtasks === undefined || Array.isArray(backup.subtasks));
  if (!arrays) return c.json({ error: 'MyManagerのバックアップJSONを選択してください。' }, 400);
  const items = backup!.items as ItemRow[];
  const categories = backup!.categories as ItemRow[];
  const projects = backup!.projects as ItemRow[];
  const subtasks = (backup!.subtasks ?? []) as ItemRow[];
  if (items.length > 5_000 || categories.length > 1_000 || projects.length > 1_000 || subtasks.length > 25_000) {
    return c.json({ error: 'バックアップの件数が上限を超えています。' }, 413);
  }
  if (![...items, ...categories, ...projects, ...subtasks].every((row) => row && typeof row === 'object' && Number.isInteger(Number(row.id)))) {
    return c.json({ error: 'バックアップのデータ形式が正しくありません。' }, 400);
  }
  if (!items.every((row) => typeof row.title === 'string' && row.title.length > 0 && row.title.length <= 200 && ['task', 'wish'].includes(String(row.kind)))) {
    return c.json({ error: 'バックアップ内の項目データが正しくありません。' }, 400);
  }

  const db = c.env.mymanager_db;
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM subtasks'), db.prepare('DELETE FROM items'), db.prepare('DELETE FROM categories'), db.prepare('DELETE FROM projects'),
  ];
  categories.forEach((row) => statements.push(db.prepare('INSERT INTO categories (id, name, color, created_at) VALUES (?, ?, ?, ?)').bind(Number(row.id), String(row.name), String(row.color), String(row.created_at ?? new Date().toISOString()))));
  projects.forEach((row) => statements.push(db.prepare('INSERT INTO projects (id, name, color, archived, created_at) VALUES (?, ?, ?, ?, ?)').bind(Number(row.id), String(row.name), String(row.color), Number(row.archived ?? 0), String(row.created_at ?? new Date().toISOString()))));
  items.forEach((row) => statements.push(db.prepare(`INSERT INTO items
    (id, title, note, kind, status, priority, due_date, category_id, created_at, completed_at, project_id, recurrence, reminder_at, sort_order, updated_at, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    Number(row.id), String(row.title), String(row.note ?? ''), String(row.kind), String(row.status ?? 'open'), String(row.priority ?? 'medium'),
    row.due_date ?? null, row.category_id ?? null, String(row.created_at ?? new Date().toISOString()), row.completed_at ?? null,
    row.project_id ?? null, String(row.recurrence ?? 'none'), row.reminder_at ?? null, Number(row.sort_order ?? 0), row.updated_at ?? null, row.deleted_at ?? null,
  )));
  subtasks.forEach((row) => statements.push(db.prepare('INSERT INTO subtasks (id, item_id, title, completed, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(Number(row.id), Number(row.item_id), String(row.title), Number(row.completed ?? 0), Number(row.sort_order ?? 0), String(row.created_at ?? new Date().toISOString()))));
  await db.batch(statements);
  return c.json({ imported: { items: items.length, categories: categories.length, projects: projects.length, subtasks: subtasks.length } });
});

api.onError((error, c) => {
  console.error(error);
  return c.json({ error: 'サーバーでエラーが発生しました。' }, 500);
});

export default api;
