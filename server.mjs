import express from 'express';
import { Pool } from 'pg';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const localDataPath = path.join(__dirname, 'data', 'state.json');
const defaultState = () => ({ activeMonth: currentMonthKey(), months: {} });

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    })
  : null;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

app.get('/api/health', async (_request, response) => {
  try {
    if (pool) await pool.query('select 1');
    response.json({ ok: true, storage: pool ? 'postgres' : 'local-file' });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/state', async (_request, response) => {
  response.json({ state: await readState() });
});

app.put('/api/state', async (request, response) => {
  const nextState = normalizeState(request.body?.state);
  await writeState(nextState);
  response.json({ ok: true, state: nextState });
});

app.get('*', (_request, response) => {
  response.sendFile(path.join(__dirname, 'index.html'));
});

await initializeStorage();
app.listen(port, () => {
  console.log(`Contas da Casa rodando na porta ${port}`);
});

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeState(value) {
  if (!value || typeof value !== 'object' || !value.months || typeof value.months !== 'object') {
    return defaultState();
  }

  return {
    activeMonth: typeof value.activeMonth === 'string' ? value.activeMonth : currentMonthKey(),
    months: value.months,
  };
}

async function initializeStorage() {
  if (!pool) {
    await mkdir(path.dirname(localDataPath), { recursive: true });
    if (!existsSync(localDataPath)) {
      await writeFile(localDataPath, JSON.stringify(defaultState(), null, 2), 'utf8');
    }
    return;
  }

  await pool.query(`
    create table if not exists app_state (
      id integer primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);

  await pool.query(
    `
      insert into app_state (id, data)
      values (1, $1::jsonb)
      on conflict (id) do nothing
    `,
    [JSON.stringify(defaultState())],
  );
}

async function readState() {
  if (!pool) {
    const raw = await readFile(localDataPath, 'utf8');
    return normalizeState(JSON.parse(raw));
  }

  const result = await pool.query('select data from app_state where id = 1');
  return normalizeState(result.rows[0]?.data);
}

async function writeState(nextState) {
  if (!pool) {
    await writeFile(localDataPath, JSON.stringify(nextState, null, 2), 'utf8');
    return;
  }

  await pool.query(
    `
      update app_state
      set data = $1::jsonb,
          updated_at = now()
      where id = 1
    `,
    [JSON.stringify(nextState)],
  );
}
