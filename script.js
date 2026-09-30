// script.js

// --- Константы ---
const BYBIT_PROXY_URL = '/.netlify/functions/bybit-proxy';
const CCI_SHORT_PERIOD = 13;
const CCI_LONG_PERIOD = 200;
const CCI_CONSTANT = 0.015;

// --- Элементы DOM ---
const timeframeSelect = document.getElementById('timeframe');
const minVolumeInput = document.getElementById('min-volume');
const scanBtn = document.getElementById('scan-btn');
const loadingDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error-message');
const resultsTableBody = document.querySelector('#results-table tbody');

// --- Вспомогательные функции ---

/**
 * Рассчитывает простую скользящую среднюю (SMA).
 * @param {number[]} data - Массив чисел.
 * @param {number} period - Период.
 * @returns {number[]} - Массив значений SMA.
 */
function calculateSMA(data, period) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            sma.push(null);
            continue;
        }
        const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        sma.push(sum / period);
    }
    return sma;
}

/**
 * Рассчитывает среднее абсолютное отклонение.
 * @param {number[]} typicalPrices - Массив типичных цен.
 * @param {number[]} sma - Массив значений SMA.
 * @param {number} period - Период.
 * @returns {number[]} - Массив значений отклонения.
 */
function calculateMeanDeviation(typicalPrices, sma, period) {
    const meanDeviation = [];
    for (let i = 0; i < typicalPrices.length; i++) {
        if (i < period - 1 || sma[i] === null) {
            meanDeviation.push(null);
            continue;
        }
        let sumAbsDiff = 0;
        for (let j = i - period + 1; j <= i; j++) {
            sumAbsDiff += Math.abs(typicalPrices[j] - sma[i]);
        }
        meanDeviation.push(sumAbsDiff / period);
    }
    return meanDeviation;
}

/**
 * Рассчитывает индикатор CCI.
 * @param {number[]} high - Массив максимальных цен.
 * @param {number[]} low - Массив минимальных цен.
 * @param {number[]} close - Массив цен закрытия.
 * @param {number} period - Период CCI.
 * @returns {number[]} - Массив значений CCI.
 */
function calculateCCI(high, low, close, period) {
    const typicalPrices = high.map((h, i) => (h + low[i] + close[i]) / 3);
    const sma = calculateSMA(typicalPrices, period);
    const meanDeviation = calculateMeanDeviation(typicalPrices, sma, period);

    const cci = [];
    for (let i = 0; i < typicalPrices.length; i++) {
        if (sma[i] === null || meanDeviation[i] === null || meanDeviation[i] === 0) {
            cci.push(null);
        } else {
            cci.push((typicalPrices[i] - sma[i]) / (CCI_CONSTANT * meanDeviation[i]));
        }
    }
    return cci;
}


// --- Основные функции ---

/**
 * Запрашивает данные с нашего прокси-сервера.
 * @param {string} endpoint - Конечная точка API Bybit (например, 'tickers', 'kline').
 * @param {object} params - Параметры запроса.
 * @returns {Promise<object>} - Промис с JSON-ответом.
 */
async function fetchFromProxy(endpoint, params = {}) {
    const url = new URL(BYBIT_PROXY_URL, window.location.origin);
    url.searchParams.append('endpoint', endpoint);
    for (const key in params) {
        url.searchParams.append(key, params[key]);
    }

    const response = await fetch(url);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ошибка сети: ${response.status} ${errorText}`);
    }
    const data = await response.json();
    if (data.retCode !== 0) {
        throw new Error(`Ошибка API Bybit: ${data.retMsg}`);
    }
    return data;
}

/**
 * Основная функция сканирования.
 */
async function runScan() {
    const timeframe = timeframeSelect.value;
    const minVolume = parseFloat(minVolumeInput.value);

    // Очистка и подготовка UI
    resultsTableBody.innerHTML = '';
    errorDiv.style.display = 'none';
    loadingDiv.style.display = 'block';
    scanBtn.disabled = true;

    try {
        // 1. Получаем список всех тикеров и их объемы
        const tickersData = await fetchFromProxy('tickers', { category: 'spot' });
        const usdtTickers = tickersData.result.list.filter(t => t.symbol.endsWith('USDT'));

        // Фильтруем по объему
        const filteredTickers = usdtTickers.filter(t => parseFloat(t.turnover24h) >= minVolume);

        if (filteredTickers.length === 0) {
            loadingDiv.textContent = 'Нет монет, подходящих по объему.';
            return;
        }
        
        loadingDiv.textContent = `Найдено ${filteredTickers.length} монет. Расчет CCI...`;

        // 2. Для каждой монеты получаем свечи и считаем CCI
        const results = [];
        for (const ticker of filteredTickers) {
            try {
                // Запрашиваем достаточно свечей для расчета CCI(200). Берем с запасом.
                const klineData = await fetchFromProxy('kline', {
                    category: 'spot',
                    symbol: ticker.symbol,
                    interval: timeframe,
                    limit: 300 // 300 свечей хватит для CCI(200)
                });

                // Bybit возвращает свечи в обратном порядке (сначала новые), разворачиваем
                const candles = klineData.result.list.reverse();

                if (candles.length < CCI_LONG_PERIOD) continue; // Пропускаем, если данных мало

                const highs = candles.map(c => parseFloat(c[2]));
                const lows = candles.map(c => parseFloat(c[3]));
                const closes = candles.map(c => parseFloat(c[4]));

                const cciLong = calculateCCI(highs, lows, closes, CCI_LONG_PERIOD);
                const cciShort = calculateCCI(highs, lows, closes, CCI_SHORT_PERIOD);

                const lastCciLong = cciLong[cciLong.length - 1];
                const lastCciShort = cciShort[cciShort.length - 1];

                // Проверяем условия
                let signal = 'Нет';
                if (lastCciLong > 100 && lastCciShort < -100) {
                    signal = 'Лонг';
                } else if (lastCciLong < -100 && lastCciShort > 100) {
                    signal = 'Шорт';
                }

                if (signal !== 'Нет') {
                    results.push({
                        symbol: ticker.symbol,
                        price: parseFloat(ticker.lastPrice),
                        volume: parseFloat(ticker.turnover24h),
                        cciLong: lastCciLong.toFixed(2),
                        cciShort: lastCciShort.toFixed(2),
                        signal: signal
                    });
                }

                // Небольшая задержка, чтобы не превысить лимиты API
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (e) {
                console.warn(`Не удалось обработать ${ticker.symbol}:`, e.message);
                // Продолжаем со следующей монетой
            }
        }

        // 3. Отображаем результаты
        if (results.length === 0) {
            resultsTableBody.innerHTML = '<tr><td colspan="6">Монет, подходящих под условия, не найдено.</td></tr>';
        } else {
            results.forEach(res => {
                const row = document.createElement('tr');
                const signalClass = res.signal === 'Лонг' ? 'signal-long' : 'signal-short';
                row.innerHTML = `
                    <td>${res.symbol}</td>
                    <td>${res.price.toFixed(4)}</td>
                    <td>${res.volume.toLocaleString()}</td>
                    <td>${res.cciLong}</td>
                    <td>${res.cciShort}</td>
                    <td class="${signalClass}">${res.signal}</td>
                `;
                resultsTableBody.appendChild(row);
            });
        }

    } catch (error) {
        console.error('Ошибка сканирования:', error);
        errorDiv.textContent = `Произошла ошибка: ${error.message}`;
        errorDiv.style.display = 'block';
    } finally {
        loadingDiv.style.display = 'none';
        scanBtn.disabled = false;
    }
}

// --- Инициализация ---
scanBtn.addEventListener('click', runScan);