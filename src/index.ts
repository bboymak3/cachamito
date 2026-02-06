import { Ai } from '@cloudflare/ai';

export interface Env {
  AI: any;
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. Ruta para la IA y búsqueda en Menú
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      try {
        const { messages } = await request.json();
        const lastMsg = messages[messages.length - 1].content.toLowerCase();

        // Consulta segura a D1
        let menuContext = "";
        try {
          const { results } = await env.DB.prepare(
            "SELECT * FROM menu_items WHERE nombre LIKE ? OR categoria LIKE ? OR descripcion LIKE ?"
          ).bind(`%${lastMsg}%`, `%${lastMsg}%`, `%${lastMsg}%`).all();
          
          if (results && results.length > 0) {
            menuContext = "Menú disponible: " + JSON.stringify(results);
          }
        } catch (dbError) {
          menuContext = "Error al conectar con la base de datos, usa información general.";
        }

        const ai = new Ai(env.AI);
        const systemPrompt = `Eres el mesero virtual de La Cachamita de Oro en Barinas. 
        Habla de forma amable y criolla. Si el usuario te saluda, ofrece Desayunos o Almuerzos.
        Si recomiendas un plato, usa el formato: **Nombre** - Precio.
        Usa fotos así: ![foto](https://cachamito.estilosgrado33.workers.dev/fotos/ID.png)
        Información del menú: ${menuContext}`;

        const response = await ai.run('@cf/meta/llama-3-8b-instruct', {
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          stream: true,
        });

        return new Response(response, { headers: { 'Content-Type': 'text/event-stream' } });
      } catch (err) {
        return new Response("Error procesando la solicitud", { status: 500 });
      }
    }

    // 2. Servir el HTML del Chat
    return new Response(chatHTML, {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  },
};

// HTML incluido directamente para evitar errores de archivos externos
const chatHTML = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>La Cachamita de Oro</title>
    <style>
        body { font-family: sans-serif; margin: 0; background: #f4f4f4; display: flex; flex-direction: column; height: 100vh; }
        header { background: #2e7d32; color: white; padding: 15px; text-align: center; border-bottom: 4px solid #ffd600; }
        #chat { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
        .msg { padding: 10px; border-radius: 10px; max-width: 85%; }
        .user { align-self: flex-end; background: #2e7d32; color: white; }
        .bot { align-self: flex-start; background: white; border: 1px solid #ccc; }
        .bot img { width: 100%; border-radius: 5px; margin-top: 5px; }
        form { display: flex; padding: 10px; background: white; }
        input { flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
        button { background: #2e7d32; color: white; border: none; padding: 10px; margin-left: 5px; border-radius: 5px; }
    </style>
</head>
<body>
    <header>🐟 LA CACHAMITA DE ORO</header>
    <div id="chat"><div class="msg bot">¡Epa! ¿Qué le provoca comer hoy en Barinas?</div></div>
    <form id="f"><input type="text" id="i" placeholder="Escribe aquí..." required><button>Enviar</button></form>
    <script>
        const f=document.getElementById('f'), c=document.getElementById('chat'), h=[];
        f.onsubmit = async (e) => {
            e.preventDefault();
            const v=document.getElementById('i').value;
            document.getElementById('i').value='';
            c.innerHTML += '<div class="msg user">'+v+'</div>';
            h.push({role:"user", content:v});
            const res = await fetch('/api/chat', {method:'POST', body:JSON.stringify({messages:h})});
            const b=document.createElement('div'); b.className='msg bot'; c.appendChild(b);
            const r=res.body.getReader(), d=new TextDecoder();
            let t="";
            while(true){
                const {done, value}=await r.read();
                if(done) break;
                t+=d.decode(value);
                b.innerHTML = t.replace(/!\\[foto\\]\\((.*?)\\)/g, '<img src="$1">').replace(/\\n/g, '<br>');
                c.scrollTop = c.scrollHeight;
            }
            h.push({role:"assistant", content:t});
        }
    </script>
</body>
</html>
`;