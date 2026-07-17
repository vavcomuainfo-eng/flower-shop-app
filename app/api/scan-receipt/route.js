// Цей файл виконується на сервері (не в браузері), тому ключ API нікому не видно.
export async function POST(request) {
  try {
    const { image_base64, media_type } = await request.json();

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: 'ANTHROPIC_API_KEY не налаштовано на сервері.' },
        { status: 500 }
      );
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
              {
                type: 'text',
                text: `Це фото чека або накладної від постачальника квітів/товарів. Розпізнай список товарів.

Поверни ЛИШЕ валідний JSON, без markdown-огорожі, без жодного тексту навколо, у такому форматі:
{"supplier_name": "назва постачальника або null", "items": [{"name": "назва товару", "quantity": число, "unit_price": число}]}

Якщо якесь поле нечитабельне — постав null для нього. Числа — без валюти і пробілів. Якщо на чеку вказана лише загальна сума за позицію (без ціни за одиницю) — пораховуй unit_price = сума / кількість.`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return Response.json(
        { error: data?.error?.message || 'Помилка звернення до Claude API.' },
        { status: 500 }
      );
    }

    const text = data.content?.[0]?.text || '{}';
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
