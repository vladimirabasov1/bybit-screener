// netlify/functions/bybit-proxy.js

exports.handler = async (event, context) => {
    // Получаем параметры из запроса
    const { endpoint, ...params } = event.queryStringParameters || {};
    
    if (!endpoint) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing "endpoint" parameter' }),
        };
    }

    // Строим URL для Bybit API
    const baseUrl = 'https://api.bybit.com/v5/market';
    const url = new URL(`${baseUrl}/${endpoint}`);
    
    // Добавляем все остальные параметры
    for (const key in params) {
        url.searchParams.append(key, params[key]);
    }

    console.log('Fetching from Bybit:', url.toString());

    try {
        // Используем встроенный fetch (доступен в Node.js 18+)
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Bybit API error:', response.status, errorText);
            return {
                statusCode: response.status,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ 
                    error: `Bybit API returned ${response.status}`,
                    details: errorText 
                }),
            };
        }

        const data = await response.json();

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify(data),
        };
    } catch (error) {
        console.error('Proxy error:', error.message, error.stack);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ 
                error: 'Failed to fetch from Bybit API',
                details: error.message 
            }),
        };
    }
};