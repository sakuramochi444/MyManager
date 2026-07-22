import { Hono } from 'hono';
import type { ItemInput, ItemStatus } from '../shared/types';

type Bindings = { DB: D1Database };
const api = new Hono<{ Bindings: Bindings }>().basePath('/api');

const itemSelect = `
  SELECT i.id, i.title, i.note, i.kind, i.status, i.priority,
    i.due_date AS dueDate, i.category_id AS categoryId,
    c.name AS categoryName, c.color AS categoryColor,
    i.created_at AS createdAt, i.completed_at AS completedAt
  FROM items i LEFT JOIN categories c ON c.id = i.category_id`;

api.get('/items', async (c) => {
  const result = await c.env.DB.prepare(`${itemSelect} ORDER BY i.status ASC, i.due_date IS NULL, i.due_date ASC, i.created_at DESC`).all();
  return c.json(result.results);
});

api.post('/items', async (c) => {
  const body = await c.req.json<ItemInput>();
  const title = body.title?.trim();
  if (!title || title.length > 200 || !['task', 'wish'].includes(body.kind)) {
    return c.json({ error: '入力内容を確認してください。' }, 400);
  }
  const result = await c.env.DB.prepare(
    `INSERT INTO items (title, note, kind, priority, due_date, category_id)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(title, body.note?.trim() ?? '', body.kind, body.priority ?? 'medium', body.dueDate || null, body.categoryId || null).first<{ id: number }>();
  const item = await c.env.DB.prepare(`${itemSelect} WHERE i.id = ?`).bind(result?.id).first();
  return c.json(item, 201);
});

api.patch('/items/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<Partial<ItemInput> & { status?: ItemStatus }>();
  if (!Number.isInteger(id)) return c.json({ error: '不正なIDです。' }, 400);

  const current = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!current) return c.json({ error: '項目が見つかりません。' }, 404);

  const status = body.status ?? current.status;
  const title = body.title === undefined ? current.title : body.title.trim();
  if (!title) return c.json({ error: 'タイトルは必須です。' }, 400);

  await c.env.DB.prepare(
    `UPDATE items SET title = ?, note = ?, kind = ?, status = ?, priority = ?, due_date = ?, category_id = ?,
      completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END
     WHERE id = ?`,
  ).bind(
    title,
    body.note ?? current.note,
    body.kind ?? current.kind,
    status,
    body.priority ?? current.priority,
    body.dueDate === undefined ? current.due_date : body.dueDate || null,
    body.categoryId === undefined ? current.category_id : body.categoryId || null,
    status,
    id,
  ).run();
  const item = await c.env.DB.prepare(`${itemSelect} WHERE i.id = ?`).bind(id).first();
  return c.json(item);
});

api.delete('/items/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: '不正なIDです。' }, 400);
  await c.env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
  return c.body(null, 204);
});

api.get('/categories', async (c) => {
  const result = await c.env.DB.prepare('SELECT id, name, color FROM categories ORDER BY name').all();
  return c.json(result.results);
});

api.post('/categories', async (c) => {
  const body = await c.req.json<{ name?: string; color?: string }>();
  const name = body.name?.trim();
  const color = /^#[0-9a-f]{6}$/i.test(body.color ?? '') ? body.color! : '#657153';
  if (!name || name.length > 40) return c.json({ error: 'カテゴリ名を入力してください。' }, 400);
  try {
    const result = await c.env.DB.prepare('INSERT INTO categories (name, color) VALUES (?, ?) RETURNING id, name, color').bind(name, color).first();
    return c.json(result, 201);
  } catch {
    return c.json({ error: '同じ名前のカテゴリがあります。' }, 409);
  }
});

api.onError((error, c) => {
  console.error(error);
  return c.json({ error: 'サーバーでエラーが発生しました。' }, 500);
});

export default api;
