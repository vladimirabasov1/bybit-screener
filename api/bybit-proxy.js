// api/bybit-proxy.js

export default async function handler(req, res) {
  // 1. Настраиваем CORS-заголовки, чтобы ваш сайт на Netlify мог делать запросы
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 2. Обрабатываем предварительные CORS-запросы (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. Получаем параметры из URL-запроса
  const { endpoint, ...params } = req.query;

  if (!endpoint) {
    return res.status(400).json({ error: 'Missing "endpoint" parameter' });
  }

  // 4. Собираем URL для API Bybit
  const baseUrl = 'https://api.bybit.com/v5/market';
  const url = new URL(`${baseUrl}/${endpoint}`);
  for (const key in params) {
    url.searchParams.append(key, params[key]);
  }

  console.log('Fetching from Bybit:', url.toString());

  // 5. Делаем запрос к Bybit и возвращаем ответ
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: `Bybit API returned ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Proxy error:', error.message);
    return res.status(500).json({
      error: 'Failed to fetch from Bybit API',
      details: error.message
    });
  }
}