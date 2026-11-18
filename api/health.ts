interface ApiRequest {
  method?: string;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
}

export default function handler(_req: ApiRequest, res: ApiResponse) {
  const hasPython = Boolean(process.env.PYTHON_API_URL?.trim());
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const hasGemini = Boolean(geminiKey && geminiKey !== 'MY_GEMINI_API_KEY');

  res.status(200).json({
    status: 'ok',
    runtime: 'vercel',
    serverClassifierReady: hasPython || hasGemini,
  });
}
