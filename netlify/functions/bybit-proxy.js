// netlify/functions/bybit-proxy.js

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // Получаем параметры из запроса
    const { endpoint, ...params } = event.queryStringParameters;
    
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

    try {
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        });

        const data = await response.json();

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*', // Разрешаем CORS для нашего сайта
            },
            body: JSON.stringify(data),
        };
    } catch (error) {
        console.error('Proxy error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch from Bybit API' }),
        };
    }
};