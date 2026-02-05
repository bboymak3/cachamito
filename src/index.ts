import { Ai } from '@cloudflare/ai';

export interface Env {
  AI: any;
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Si la ruta es /api/chat, manejamos la IA
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      const { messages } = await request.json();
      const lastMsg = messages[messages.length - 1].content.toLowerCase();

      // Consulta a D1
      const { results } = await env.DB.prepare(
        "SELECT * FROM menu_items WHERE nombre LIKE ? OR categoria LIKE ?"
      ).bind(`%${lastMsg}%`, `%${lastMsg}%`).all();

      const ai = new Ai(env.AI);
      const systemPrompt = `Eres el mesero de "La Cachamita de Oro" en Barinas. 
      Habla como llanero (Epa, camarita, ¡claro que sí!). 
      Si el usuario saluda, ofrece Desayunos o Almuerzos. 
      Si recomiendas algo, usa el formato: **Nombre** - Precio. 
      E incluye la foto: ![foto](https://cachamito.estilosgrado33.workers.dev/fotos/ID.png)
      Menú: ${JSON.stringify(results)}`;

      const response = await ai.run('@cf/meta/llama-3-8b-instruct', {
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        stream: true,
      });

      return new Response(response, { headers: { 'Content-Type': 'text/event-stream' } });
    }

    // 2. Si es cualquier otra ruta, servimos el HTML del Chat
    return new Response(html, {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  },
};

// El HTML embebido para que el Worker lo entregue directamente
const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>La Cachamita de Oro</title>
    <style>
        body { font-family: sans-serif; margin: 0; background: #f0f2f5; display: flex; flex-direction: column; height: 100vh; }
        header { background: #2e7d32; color: white; padding: 15px; text-align: center; font-size: 1.2em; border-bottom: 4px solid #ffd600; }
        #chat { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
        .msg { padding: 10px; border-radius: 10px; max-width: 80%; line-height: 1.4; }
        .user { align-self: flex-end; background: #2e7d32; color: white; }
        .bot { align-self: flex-start; background: white; border: 1px solid #ddd; }
        .bot img { width: 100%; border-radius: 8px; margin-top: 5px; }
        #form { display: flex; padding: 10px; background: white; border-top: 1px solid #ddd; }
        input { flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 5px; outline: none; }
        button { background: #2e7d32; color: white; border: none; padding: 10px 20px; margin-left: 5px; border-radius: 5px; cursor: pointer; }
    </style>
</head>
<body>
    <header>🐟 La Cachamita de Oro - Mesero Virtual</header>
    <div id="chat">
        <div class="msg bot">¡Epa camarita! Bienvenido. ¿Qué le provoca hoy? ¿Le enseño los <b>Desayunos</b> o nuestros <b>Almuerzos Criollos</b>?</div>
    </div>
    <form id="form">
        <input type="text" id="input" placeholder="Pregunta por un plato..." required>
        <button type="submit">Enviar</button>
    </form>
    <script>
        const form = document.getElementById('form');
        const chat = document.getElementById('chat');
        const history = [];

        form.onsubmit = async (e) => {
            e.preventDefault();
            const text = document.getElementById('input').value;
            document.getElementById('input').value = '';
            
            chat.innerHTML += '<div class="msg user">' + text + '</div>';
            history.push({ role: "user", content: text });
            chat.scrollTop = chat.scrollHeight;

            const res = await fetch('/api/chat', {
                method: 'POST',
                body: JSON.stringify({ messages: history })
            });

            const botDiv = document.createElement('div');
            botDiv.className = 'msg bot';
            chat.appendChild(botDiv);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullText = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                fullText += chunk;
                // Simple reemplazo de markdown para imágenes
                botDiv.innerHTML = fullText.replace(/!\\[foto\\]\\((.*?)\\)/g, '<img src="$1">').replace(/\\n/g, '<br>');
                chat.scrollTop = chat.scrollHeight;
            }
            history.push({ role: "assistant", content: fullText });
        };
    </script>
</body>
</html>
`;
