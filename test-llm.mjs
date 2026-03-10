import { config } from 'dotenv';
config();

const apiUrl = process.env.BUILT_IN_FORGE_API_URL || 'https://forge.manus.im';
const apiKey = process.env.BUILT_IN_FORGE_API_KEY;

console.log('API URL:', apiUrl);
console.log('API Key exists:', !!apiKey);

const payload = {
  model: 'gemini-2.5-flash',
  messages: [
    { role: 'system', content: 'Você é um especialista em RH. Responda APENAS em JSON válido.' },
    { role: 'user', content: 'Gere 3 perguntas para uma avaliação de desempenho sobre o tema: "Avaliação Geral". Retorne JSON: {"perguntas": [{"texto": "...", "tipo": "nota", "obrigatoria": true}]}' },
  ],
  max_tokens: 32768,
  thinking: { budget_tokens: 128 },
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'survey_questions',
      strict: true,
      schema: {
        type: 'object',
        properties: {
          perguntas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                texto: { type: 'string' },
                tipo: { type: 'string', enum: ['nota', 'texto', 'sim_nao'] },
                obrigatoria: { type: 'boolean' },
              },
              required: ['texto', 'tipo', 'obrigatoria'],
              additionalProperties: false,
            },
          },
        },
        required: ['perguntas'],
        additionalProperties: false,
      },
    },
  },
};

try {
  const url = `${apiUrl.replace(/\/$/, '')}/v1/chat/completions`;
  console.log('Calling:', url);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  
  console.log('Status:', response.status, response.statusText);
  const text = await response.text();
  console.log('Response:', text.substring(0, 2000));
  
  if (response.ok) {
    const json = JSON.parse(text);
    const content = json.choices?.[0]?.message?.content;
    console.log('\nContent:', content);
    if (content) {
      const parsed = JSON.parse(content);
      console.log('\nParsed perguntas:', JSON.stringify(parsed.perguntas, null, 2));
    }
  }
} catch (e) {
  console.error('Error:', e);
}

// Test without thinking and response_format
console.log('\n\n=== Test 2: Without thinking ===');
const payload2 = { ...payload };
delete payload2.thinking;

try {
  const url = `${apiUrl.replace(/\/$/, '')}/v1/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload2),
  });
  
  console.log('Status:', response.status, response.statusText);
  const text = await response.text();
  console.log('Response:', text.substring(0, 2000));
  
  if (response.ok) {
    const json = JSON.parse(text);
    const content = json.choices?.[0]?.message?.content;
    console.log('\nContent:', content);
    if (content) {
      const parsed = JSON.parse(content);
      console.log('\nParsed perguntas:', JSON.stringify(parsed.perguntas, null, 2));
    }
  }
} catch (e) {
  console.error('Error:', e);
}
