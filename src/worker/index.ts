import { Hono } from 'hono';
import type { ItemInput, ItemStatus, NoteInput, Recurrence, SubtaskInput, TaskProgress } from '../shared/types';

type Bindings = { mymanager_db: D1Database; VAPID_PRIVATE_JWK?: string; VAPID_SUBJECT?: string };
type ItemRow = Record<string, unknown>;
const api = new Hono<{ Bindings: Bindings }>().basePath('/api');

function base64Url(bytes: Uint8Array) {
  let value = '';
  bytes.forEach((byte) => { value += String.fromCharCode(byte); });
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

function vapidPublicKey(jwkText: string) {
  const jwk = JSON.parse(jwkText) as JsonWebKey;
  if (!jwk.x || !jwk.y) throw new Error('VAPID key is incomplete');
  return base64Url(new Uint8Array([4, ...decodeBase64Url(jwk.x), ...decodeBase64Url(jwk.y)]));
}

async function sendPush(endpoint: string, env: Bindings) {
  if (!env.VAPID_PRIVATE_JWK) return 0;
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK) as JsonWebKey;
  const audience = new URL(endpoint).origin;
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 43_200, sub: env.VAPID_SUBJECT ?? 'mailto:admin@example.com' })));
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${payload}`));
  const token = `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `vapid t=${token}, k=${vapidPublicKey(env.VAPID_PRIVATE_JWK)}`, TTL: '300', Urgency: 'high' } });
  return response.status;
}

const itemSelect = `
  SELECT i.id, i.title, i.note, i.kind, i.status, i.progress, i.priority,
    i.due_date AS dueDate, i.all_day AS allDay, i.start_time AS startTime, i.end_time AS endTime, i.category_id AS categoryId,
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
  const subtasks = await db.prepare('SELECT id, item_id AS itemId, title, completed, sort_order AS sortOrder, due_date AS dueDate FROM subtasks WHERE item_id = ? ORDER BY sort_order, id').bind(id).all();
  return { ...item, subtasks: subtasks.results };
}

async function replaceSubtasks(db: D1Database, itemId: number, subtasks: SubtaskInput[]) {
  const statements = [db.prepare('DELETE FROM subtasks WHERE item_id = ?').bind(itemId)];
  subtasks.filter((subtask) => subtask.title.trim()).forEach((subtask, index) => {
    statements.push(db.prepare('INSERT INTO subtasks (item_id, title, completed, sort_order, due_date) VALUES (?, ?, ?, ?, ?)').bind(itemId, subtask.title.trim(), subtask.completed ? 1 : 0, index, subtask.dueDate || null));
  });
  await db.batch(statements);
}

async function getItems(db: D1Database, deleted: boolean) {
  const result = await db.prepare(
    `${itemSelect} WHERE i.deleted_at IS ${deleted ? 'NOT ' : ''}NULL ORDER BY i.status ASC, i.sort_order ASC, i.due_date IS NULL, i.due_date ASC, i.created_at DESC`,
  ).all();
  const subtaskResult = await db.prepare('SELECT id, item_id AS itemId, title, completed, sort_order AS sortOrder, due_date AS dueDate FROM subtasks ORDER BY sort_order, id').all();
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
  const progress = ['not_started', 'in_progress', 'done'].includes(body.progress ?? '') ? body.progress! : 'not_started';
  const status = progress === 'done' ? 'done' : 'open';
  const allDay = body.allDay ?? true;
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  const startTime = !allDay && timePattern.test(body.startTime ?? '') ? body.startTime! : null;
  const endTime = !allDay && timePattern.test(body.endTime ?? '') ? body.endTime! : null;
  const result = await c.env.mymanager_db.prepare(
    `INSERT INTO items (title, note, kind, status, progress, priority, due_date, all_day, start_time, end_time, category_id, project_id, recurrence, reminder_at, sort_order, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) RETURNING id`,
  ).bind(
    title, body.note?.trim() ?? '', body.kind, status, progress, body.priority ?? 'medium', body.dueDate || null,
    allDay ? 1 : 0, startTime, endTime, body.categoryId || null, body.projectId || null, body.recurrence ?? 'none', body.reminderAt || null,
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

  let status = (body.status ?? current.status) as ItemStatus;
  let progress = (body.progress ?? current.progress ?? (status === 'done' ? 'done' : 'not_started')) as TaskProgress;
  if (!['not_started', 'in_progress', 'done'].includes(progress)) progress = status === 'done' ? 'done' : 'not_started';
  if (body.status === 'done' && body.progress === undefined) progress = 'done';
  if (body.status === 'open' && body.progress === undefined && progress === 'done') progress = 'not_started';
  if (body.progress !== undefined) status = progress === 'done' ? 'done' : 'open';
  const title = body.title === undefined ? String(current.title) : body.title.trim();
  if (!title) return c.json({ error: 'タイトルは必須です。' }, 400);
  const recurrence = (body.recurrence ?? current.recurrence) as Recurrence;
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  const allDay = body.allDay === undefined ? Boolean(current.all_day ?? 1) : body.allDay;
  const rawStartTime = body.startTime === undefined ? current.start_time : body.startTime;
  const rawEndTime = body.endTime === undefined ? current.end_time : body.endTime;
  const startTime = !allDay && timePattern.test(String(rawStartTime ?? '')) ? String(rawStartTime) : null;
  const endTime = !allDay && timePattern.test(String(rawEndTime ?? '')) ? String(rawEndTime) : null;

  await db.prepare(
    `UPDATE items SET title = ?, note = ?, kind = ?, status = ?, progress = ?, priority = ?, due_date = ?,
      all_day = ?, start_time = ?, end_time = ?, category_id = ?,
      project_id = ?, recurrence = ?, reminder_at = ?, sort_order = ?, updated_at = datetime('now'),
      completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END
     WHERE id = ?`,
  ).bind(
    title, body.note ?? current.note, body.kind ?? current.kind, status, progress, body.priority ?? current.priority,
    body.dueDate === undefined ? current.due_date : body.dueDate || null,
    allDay ? 1 : 0, startTime, endTime,
    body.categoryId === undefined ? current.category_id : body.categoryId || null,
    body.projectId === undefined ? current.project_id : body.projectId || null,
    recurrence,
    body.reminderAt === undefined ? current.reminder_at : body.reminderAt || null,
    body.sortOrder ?? current.sort_order,
    status, id,
  ).run();
  if (body.reminderAt !== undefined) await db.prepare('UPDATE items SET notification_sent_at = NULL WHERE id = ?').bind(id).run();
  if (body.subtasks !== undefined) await replaceSubtasks(db, id, body.subtasks);

  let nextItem = null;
  if (status === 'done' && current.status === 'open' && recurrence !== 'none') {
    const dueDate = nextDate(body.dueDate === undefined ? current.due_date : body.dueDate, recurrence);
    const inserted = await db.prepare(
      `INSERT INTO items (title, note, kind, progress, priority, due_date, all_day, start_time, end_time, category_id, project_id, recurrence, reminder_at, sort_order, updated_at)
       VALUES (?, ?, ?, 'not_started', ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, datetime('now')) RETURNING id`,
    ).bind(
      title, body.note ?? current.note, body.kind ?? current.kind, body.priority ?? current.priority, dueDate,
      allDay ? 1 : 0, startTime, endTime,
      body.categoryId === undefined ? current.category_id : body.categoryId || null,
      body.projectId === undefined ? current.project_id : body.projectId || null,
      recurrence, body.sortOrder ?? current.sort_order,
    ).first<{ id: number }>();
    const sourceSubtasks = body.subtasks ?? (await db.prepare('SELECT title, completed, due_date AS dueDate FROM subtasks WHERE item_id = ? ORDER BY sort_order, id').bind(id).all()).results.map((subtask) => ({ title: String((subtask as Record<string, unknown>).title), dueDate: (subtask as Record<string, unknown>).dueDate as string | null, completed: false }));
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

api.patch('/reorder/items', async (c) => {
  const body = await c.req.json<{ ids?: number[] }>();
  if (!Array.isArray(body.ids) || body.ids.length > 5_000 || !body.ids.every(Number.isInteger)) return c.json({ error: '並び順が正しくありません。' }, 400);
  const db = c.env.mymanager_db;
  if (body.ids.length) await db.batch(body.ids.map((id, index) => db.prepare("UPDATE items SET sort_order = ?, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").bind(index, id)));
  return c.json({ reordered: body.ids.length });
});

api.get('/notes', async (c) => {
  const result = await c.env.mymanager_db.prepare('SELECT id, title, content, color, pinned, created_at AS createdAt, updated_at AS updatedAt FROM notes ORDER BY pinned DESC, updated_at DESC').all();
  return c.json(result.results);
});

api.post('/notes', async (c) => {
  const body = await c.req.json<NoteInput>();
  const title = body.title?.trim();
  const color = ['sage', 'blue', 'amber', 'rose'].includes(body.color ?? '') ? body.color : 'sage';
  if (!title || title.length > 200) return c.json({ error: 'メモのタイトルを入力してください。' }, 400);
  const note = await c.env.mymanager_db.prepare(`INSERT INTO notes (title, content, color, pinned) VALUES (?, ?, ?, ?)
    RETURNING id, title, content, color, pinned, created_at AS createdAt, updated_at AS updatedAt`).bind(title, body.content?.trim() ?? '', color, body.pinned ? 1 : 0).first();
  return c.json(note, 201);
});

api.patch('/notes/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<Partial<NoteInput>>();
  const current = await c.env.mymanager_db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<ItemRow>();
  if (!Number.isInteger(id) || !current) return c.json({ error: 'メモが見つかりません。' }, 404);
  const title = body.title === undefined ? String(current.title) : body.title.trim();
  const color = body.color && ['sage', 'blue', 'amber', 'rose'].includes(body.color) ? body.color : String(current.color);
  if (!title || title.length > 200) return c.json({ error: 'メモのタイトルを入力してください。' }, 400);
  const note = await c.env.mymanager_db.prepare(`UPDATE notes SET title = ?, content = ?, color = ?, pinned = ?, updated_at = datetime('now') WHERE id = ?
    RETURNING id, title, content, color, pinned, created_at AS createdAt, updated_at AS updatedAt`).bind(title, body.content === undefined ? current.content : body.content.trim(), color, body.pinned === undefined ? current.pinned : body.pinned ? 1 : 0, id).first();
  return c.json(note);
});

api.delete('/notes/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: '不正なIDです。' }, 400);
  await c.env.mymanager_db.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
  return c.body(null, 204);
});

api.get('/push/config', (c) => {
  if (!c.env.VAPID_PRIVATE_JWK) return c.json({ configured: false, publicKey: null });
  try { return c.json({ configured: true, publicKey: vapidPublicKey(c.env.VAPID_PRIVATE_JWK) }); }
  catch { return c.json({ configured: false, publicKey: null }); }
});

api.post('/push/subscriptions', async (c) => {
  const body = await c.req.json<{ endpoint?: string; keys?: { p256dh?: string; auth?: string }; timezoneOffset?: number }>();
  if (!body.endpoint?.startsWith('https://') || body.endpoint.length > 2_000) return c.json({ error: '通知購読の形式が正しくありません。' }, 400);
  await c.env.mymanager_db.prepare(`INSERT INTO push_subscriptions (endpoint, p256dh, auth, timezone_offset) VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, timezone_offset = excluded.timezone_offset`)
    .bind(body.endpoint, body.keys?.p256dh ?? '', body.keys?.auth ?? '', Math.max(-840, Math.min(840, Number(body.timezoneOffset) || 0))).run();
  return c.json({ subscribed: true }, 201);
});

api.delete('/push/subscriptions', async (c) => {
  const body = await c.req.json<{ endpoint?: string }>();
  if (!body.endpoint) return c.json({ error: '通知購読が見つかりません。' }, 400);
  await c.env.mymanager_db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(body.endpoint).run();
  return c.body(null, 204);
});

api.get('/push/preferences', async (c) => {
  const endpoint = c.req.query('endpoint');
  if (!endpoint) return c.json({ error: '通知購読が見つかりません。' }, 400);
  const preferences = await c.env.mymanager_db.prepare(`SELECT due_enabled AS dueEnabled, daily_enabled AS dailyEnabled,
    daily_time AS dailyTime, quiet_start AS quietStart, quiet_end AS quietEnd, quiet_enabled AS quietEnabled FROM push_subscriptions WHERE endpoint = ?`).bind(endpoint).first();
  if (!preferences) return c.json({ error: '通知購読が見つかりません。' }, 404);
  return c.json(preferences);
});

api.patch('/push/preferences', async (c) => {
  const body = await c.req.json<{ endpoint?: string; dueEnabled?: boolean; dailyEnabled?: boolean; dailyTime?: string; quietStart?: string; quietEnd?: string; quietEnabled?: boolean }>();
  if (!body.endpoint) return c.json({ error: '通知購読が見つかりません。' }, 400);
  const time = (value: unknown, fallback: string) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
  const current = await c.env.mymanager_db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').bind(body.endpoint).first<ItemRow>();
  if (!current) return c.json({ error: '通知購読が見つかりません。' }, 404);
  await c.env.mymanager_db.prepare(`UPDATE push_subscriptions SET due_enabled = ?, daily_enabled = ?, daily_time = ?, quiet_start = ?, quiet_end = ?, quiet_enabled = ? WHERE endpoint = ?`).bind(
    body.dueEnabled === undefined ? current.due_enabled : body.dueEnabled ? 1 : 0,
    body.dailyEnabled === undefined ? current.daily_enabled : body.dailyEnabled ? 1 : 0,
    time(body.dailyTime, String(current.daily_time)), time(body.quietStart, String(current.quiet_start)), time(body.quietEnd, String(current.quiet_end)),
    body.quietEnabled === undefined ? current.quiet_enabled : body.quietEnabled ? 1 : 0, body.endpoint,
  ).run();
  return c.json({ updated: true });
});

api.get('/daily-plans/:date', async (c) => {
  const date = c.req.param('date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'Invalid date' }, 400);
  const plan = await c.env.mymanager_db.prepare('SELECT date, content, updated_at AS updatedAt FROM daily_plans WHERE date = ?').bind(date).first();
  return c.json(plan ?? { date, content: '', updatedAt: '' });
});

api.put('/daily-plans/:date', async (c) => {
  const date = c.req.param('date');
  const body = await c.req.json<{ content?: string }>();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'Invalid date' }, 400);
  const content = String(body.content ?? '').slice(0, 5000);
  await c.env.mymanager_db.prepare(`INSERT INTO daily_plans (date, content, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(date) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`).bind(date, content).run();
  const plan = await c.env.mymanager_db.prepare('SELECT date, content, updated_at AS updatedAt FROM daily_plans WHERE date = ?').bind(date).first();
  return c.json(plan);
});

api.get('/export', async (c) => {
  const db = c.env.mymanager_db;
  const [items, categories, projects, subtasks, notes, dailyPlans] = await Promise.all([
    db.prepare('SELECT * FROM items ORDER BY id').all(),
    db.prepare('SELECT * FROM categories ORDER BY id').all(),
    db.prepare('SELECT * FROM projects ORDER BY id').all(),
    db.prepare('SELECT * FROM subtasks ORDER BY id').all(),
    db.prepare('SELECT * FROM notes ORDER BY id').all(),
    db.prepare('SELECT * FROM daily_plans ORDER BY date').all(),
  ]);
  c.header('Content-Disposition', `attachment; filename="mymanager-${new Date().toISOString().slice(0, 10)}.json"`);
  return c.json({ version: 4, exportedAt: new Date().toISOString(), items: items.results, categories: categories.results, projects: projects.results, subtasks: subtasks.results, notes: notes.results, dailyPlans: dailyPlans.results });
});

api.post('/import', async (c) => {
  const backup = await c.req.json<Record<string, unknown>>().catch(() => null);
  const arrays = backup && ['items', 'categories', 'projects'].every((key) => Array.isArray(backup[key])) && (backup.subtasks === undefined || Array.isArray(backup.subtasks));
  if (!arrays) return c.json({ error: 'MyManagerのバックアップJSONを選択してください。' }, 400);
  const items = backup!.items as ItemRow[];
  const categories = backup!.categories as ItemRow[];
  const projects = backup!.projects as ItemRow[];
  const subtasks = (backup!.subtasks ?? []) as ItemRow[];
  const notes = (backup!.notes ?? []) as ItemRow[];
  const dailyPlans = (backup!.dailyPlans ?? []) as ItemRow[];
  if (items.length > 5_000 || categories.length > 1_000 || projects.length > 1_000 || subtasks.length > 25_000 || notes.length > 5_000 || dailyPlans.length > 3_000) {
    return c.json({ error: 'バックアップの件数が上限を超えています。' }, 413);
  }
  if (![...items, ...categories, ...projects, ...subtasks, ...notes].every((row) => row && typeof row === 'object' && Number.isInteger(Number(row.id)))) {
    return c.json({ error: 'バックアップのデータ形式が正しくありません。' }, 400);
  }
  if (!items.every((row) => typeof row.title === 'string' && row.title.length > 0 && row.title.length <= 200 && ['task', 'wish'].includes(String(row.kind)))) {
    return c.json({ error: 'バックアップ内の項目データが正しくありません。' }, 400);
  }

  const db = c.env.mymanager_db;
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM subtasks'), db.prepare('DELETE FROM items'), db.prepare('DELETE FROM categories'), db.prepare('DELETE FROM projects'), db.prepare('DELETE FROM notes'), db.prepare('DELETE FROM daily_plans'),
  ];
  categories.forEach((row) => statements.push(db.prepare('INSERT INTO categories (id, name, color, created_at) VALUES (?, ?, ?, ?)').bind(Number(row.id), String(row.name), String(row.color), String(row.created_at ?? new Date().toISOString()))));
  projects.forEach((row) => statements.push(db.prepare('INSERT INTO projects (id, name, color, archived, created_at) VALUES (?, ?, ?, ?, ?)').bind(Number(row.id), String(row.name), String(row.color), Number(row.archived ?? 0), String(row.created_at ?? new Date().toISOString()))));
  items.forEach((row) => statements.push(db.prepare(`INSERT INTO items
    (id, title, note, kind, status, progress, priority, due_date, all_day, start_time, end_time, category_id, created_at, completed_at, project_id, recurrence, reminder_at, sort_order, updated_at, deleted_at, notification_sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    Number(row.id), String(row.title), String(row.note ?? ''), String(row.kind), String(row.status ?? 'open'), String(row.progress ?? (row.status === 'done' ? 'done' : 'not_started')), String(row.priority ?? 'medium'),
    row.due_date ?? null, Number(row.all_day ?? 1), row.start_time ?? null, row.end_time ?? null, row.category_id ?? null, String(row.created_at ?? new Date().toISOString()), row.completed_at ?? null,
    row.project_id ?? null, String(row.recurrence ?? 'none'), row.reminder_at ?? null, Number(row.sort_order ?? 0), row.updated_at ?? null, row.deleted_at ?? null, row.notification_sent_at ?? null,
  )));
  subtasks.forEach((row) => statements.push(db.prepare('INSERT INTO subtasks (id, item_id, title, completed, sort_order, created_at, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(Number(row.id), Number(row.item_id), String(row.title), Number(row.completed ?? 0), Number(row.sort_order ?? 0), String(row.created_at ?? new Date().toISOString()), row.due_date ?? null)));
  notes.forEach((row) => statements.push(db.prepare('INSERT INTO notes (id, title, content, color, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(Number(row.id), String(row.title), String(row.content ?? ''), String(row.color ?? 'sage'), Number(row.pinned ?? 0), String(row.created_at ?? new Date().toISOString()), String(row.updated_at ?? new Date().toISOString()))));
  dailyPlans.forEach((row) => statements.push(db.prepare('INSERT INTO daily_plans (date, content, updated_at) VALUES (?, ?, ?)').bind(String(row.date), String(row.content ?? ''), String(row.updated_at ?? new Date().toISOString()))));
  await db.batch(statements);
  return c.json({ imported: { items: items.length, categories: categories.length, projects: projects.length, subtasks: subtasks.length, notes: notes.length, dailyPlans: dailyPlans.length } });
});

api.onError((error, c) => {
  console.error(error);
  return c.json({ error: 'サーバーでエラーが発生しました。' }, 500);
});

async function processScheduledNotifications(env: Bindings) {
  if (!env.VAPID_PRIVATE_JWK) return;
  const subscriptionResult = await env.mymanager_db.prepare(`SELECT id, endpoint, timezone_offset AS timezoneOffset, due_enabled AS dueEnabled,
    daily_enabled AS dailyEnabled, daily_time AS dailyTime, quiet_start AS quietStart, quiet_end AS quietEnd, quiet_enabled AS quietEnabled, last_daily_date AS lastDailyDate
    FROM push_subscriptions ORDER BY id`).all<Record<string, unknown>>();
  if (!subscriptionResult.results.length) return;
  const statuses = await Promise.all(subscriptionResult.results.map(async (subscription) => {
    const timezoneOffset = Number(subscription.timezoneOffset ?? 0);
    const localNow = new Date(Date.now() - timezoneOffset * 60_000);
    const localTime = `${String(localNow.getUTCHours()).padStart(2, '0')}:${String(localNow.getUTCMinutes()).padStart(2, '0')}`;
    const localDate = localNow.toISOString().slice(0, 10);
    const quietStart = String(subscription.quietStart ?? '22:00');
    const quietEnd = String(subscription.quietEnd ?? '07:00');
    const quiet = Number(subscription.quietEnabled) && quietStart !== quietEnd && (quietStart < quietEnd ? localTime >= quietStart && localTime < quietEnd : localTime >= quietStart || localTime < quietEnd);
    if (quiet) return { id: Number(subscription.id), status: 0, dueIds: [] as number[], dailyDate: null as string | null };
    const due = Number(subscription.dueEnabled) ? await env.mymanager_db.prepare(`SELECT id FROM items WHERE status = 'open' AND deleted_at IS NULL AND reminder_at IS NOT NULL
      AND notification_sent_at IS NULL AND datetime(reminder_at, printf('%+d minutes', ?)) <= datetime('now') LIMIT 50`).bind(timezoneOffset).all<{ id: number }>() : { results: [] };
    const daily = Number(subscription.dailyEnabled) && localTime >= String(subscription.dailyTime ?? '09:00') && subscription.lastDailyDate !== localDate;
    if (!due.results.length && !daily) return { id: Number(subscription.id), status: 0, dueIds: [] as number[], dailyDate: null as string | null };
    return { id: Number(subscription.id), status: await sendPush(String(subscription.endpoint), env).catch(() => 0), dueIds: due.results.map(({ id }) => id), dailyDate: daily ? localDate : null };
  }));
  const expired = statuses.filter(({ status }) => status === 404 || status === 410);
  if (expired.length) await env.mymanager_db.batch(expired.map(({ id }) => env.mymanager_db.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(id)));
  const successful = statuses.filter(({ status }) => status >= 200 && status < 300);
  const dueIds = [...new Set(successful.flatMap(({ dueIds }) => dueIds))];
  const updates = dueIds.map((id) => env.mymanager_db.prepare("UPDATE items SET notification_sent_at = datetime('now') WHERE id = ?").bind(id));
  successful.filter(({ dailyDate }) => dailyDate).forEach(({ id, dailyDate }) => updates.push(env.mymanager_db.prepare('UPDATE push_subscriptions SET last_daily_date = ? WHERE id = ?').bind(dailyDate, id)));
  if (updates.length) await env.mymanager_db.batch(updates);
}

export default {
  fetch: api.fetch,
  scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(processScheduledNotifications(env));
  },
} satisfies ExportedHandler<Bindings>;
