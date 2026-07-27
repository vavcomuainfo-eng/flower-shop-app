// Цей файл виконується на сервері (не в браузері), тому ключ API нікому не видно.
// Використовує Google Gemini (безкоштовний тариф, без прив'язки картки).
export async function POST(request) {
  try {
    const { image_base64, media_type } = await request.json();

    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: 'GEMINI_API_KEY не налаштовано на сервері.' },
        { status: 500 }
      );
    }

    const prompt = `Це фото чека або накладної від постачальника квітів/товарів. Розпізнай список товарів.

Поверни ЛИШЕ валідний JSON, без markdown-огорожі, без жодного тексту навколо, у такому форматі:
{"supplier_name": "назва постачальника або null", "items": [{"name": "назва товару", "quantity": число, "unit_price": число}]}

Якщо якесь поле нечитабельне — постав null для нього. Числа — без валюти і пробілів. Якщо на чеку вказана лише загальна сума за позицію (без ціни за одиницю) — пораховуй unit_price = сума / кількість.`;

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: media_type, data: image_base64 } },
                { text: prompt },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return Response.json(
        { error: data?.error?.message || 'Помилка звернення до Gemini API.' },
        { status: 500 }
      );
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleaned = text.replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(cleaned);
      return Response.json(parsed);
    } catch {
      return Response.json({ error: 'Не вдалося розпізнати структуру чека.' }, { status: 500 });
    }
  } catch (err) {
    return Response.json({ error: 'Внутрішня помилка сервера.' }, { status: 500 });
  }
}
