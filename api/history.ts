import fs from 'node:fs';
import path from 'node:path';

interface ApiRequest {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
}

const HISTORY_FILE = path.join('/tmp', 'ecosort-history.json');

function readHistory(): unknown[] {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: unknown[]) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries.slice(0, 60)), 'utf8');
  } catch {
    // Ignore ephemeral filesystem errors
  }
}

export default function handler(req: ApiRequest, res: ApiResponse) {
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'GET') {
    res.status(200).json(readHistory());
    return;
  }

  if (method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (body && typeof body === 'object') {
        const updated = [body, ...readHistory()].slice(0, 60);
        writeHistory(updated);
        res.status(200).json(body);
        return;
      }
      res.status(400).json({ error: 'Invalid history entry.' });
      return;
    } catch {
      res.status(400).json({ error: 'Invalid JSON payload.' });
      return;
    }
  }

  if (method === 'DELETE') {
    const idParam =
      typeof req.query?.id === 'string'
        ? req.query.id
        : Array.isArray(req.query?.id)
          ? req.query.id[0]
          : undefined;

    if (idParam) {
      const updated = readHistory().filter(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          'id' in item &&
          (item as { id: string }).id !== idParam
      );
      writeHistory(updated);
      res.status(200).json(updated);
      return;
    }

    writeHistory([]);
    res.status(200).json([]);
    return;
  }

  res.status(405).json({ error: `Method ${method} not allowed` });
}
