/**
 * LLM Chat Application Template - CACHAMITA EDITION
 */
import { Env, ChatMessage } from "./types";

// Usamos el modelo Llama 3 que es rápido y bueno hablando español
const MODEL_ID = "@cf/meta/llama-3-8b-instruct";

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		// ESTA ES LA LÍNEA CLAVE QUE FALTABA:
		// Sirve los archivos estáticos (HTML, CSS) del frontend
		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		// API del Chat
		if (url.pathname === "/api/chat") {
			if (request.method === "POST") {
				// Pasamos el env como 'any' para evitar errores de tipo con la DB
				return handleChatRequest(request, env as any);
			}
			return new Response("Method not allowed", { status: 405 });
		}

		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/**
 * Lógica del Chat con Base de Datos D1
 */
async function handleChatRequest(
	request: Request,
	env: any, // Usamos 'any' para que no te de error de Typescript con la DB
): Promise<Response> {
	try {
		const { messages = [] } = (await request.json()) as {
			messages: ChatMessage[];
		};

		// 1. OBTENER EL ÚLTIMO MENSAJE DEL USUARIO
		const lastUserMsg = messages[messages.length - 1]?.content.toLowerCase() || "";

		// 2. CONSULTAR LA BASE DE DATOS (D1)
		let menuContext = "";
		try {
			// Buscamos platos que coincidan con lo que escribe el usuario
			const { results } = await env.DB.prepare(
				"SELECT * FROM menu_items WHERE nombre LIKE ? OR categoria LIKE ? OR descripcion LIKE ? LIMIT 5"
			).bind(`%${lastUserMsg}%`, `%${lastUserMsg}%`, `%${lastUserMsg}%`).all();

			if (results && results.length > 0) {
				menuContext = "INFORMACIÓN DEL MENÚ ENCONTRADA: " + JSON.stringify(results);
			} else {
				// Si no busca nada específico, traemos 3 platos al azar para sugerir
				const { results: random } = await env.DB.prepare("SELECT * FROM menu_items LIMIT 3").all();
				menuContext = "No hay coincidencia exacta. Sugiere estos platos: " + JSON.stringify(random);
			}
		} catch (e) {
			console.error("Error conectando a DB:", e);
			menuContext = "Error consultando precios. Ofrece el menú general.";
		}

		// 3. DEFINIR EL CEREBRO DEL BOT (SYSTEM PROMPT)
		const SYSTEM_PROMPT = `
		Eres el mesero virtual de "La Cachamita de Oro" en Barinas, Venezuela.
		
		TU PERSONALIDAD:
		- Muy amable, llanero (usa "Epa", "Camarita", "A la orden").
		- Tu objetivo es vender.

		DATOS DEL MENÚ (Usa esto para responder precios y descripciones):
		${menuContext}

		REGLAS PARA RESPONDER:
		1. Si el usuario saluda, di: "¡Hola como estas ! 🤠 Bienvenido a La Cachamita de Oro. ¿Le provoco unos Desayunos o prefiere ver los Almuerzos?".
		2. Cuando des un precio, sé exacto según los DATOS DEL MENÚ.
		3. Si recomiendas un plato, incluye su FOTO si el uusario te la pide  usando este formato exacto al final de la línea:
		   ![foto](https://cachamachat.estilosgrado33.workers.dev/fotos/ID.png)
		   (Reemplaza ID por el id que viene en la base de datos, ej: 01, 20).
		4. no importa la hora del dia si elusuario pide desayuno o almuerzos selos le das las opcines que ofrecemos.
		`;

		// Agregamos el prompt al inicio de la conversación
		const aiMessages = [
			{ role: "system", content: SYSTEM_PROMPT },
			...messages.filter(m => m.role !== "system") // Evitamos duplicar systems antiguos
		];

		// 4. LLAMAR A LA INTELIGENCIA ARTIFICIAL
		const stream = await env.AI.run(
			MODEL_ID,
			{
				messages: aiMessages,
				max_tokens: 1024,
				stream: true,
			},
		);

		return new Response(stream, {
			headers: {
				"content-type": "text/event-stream; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
			},
		});

	} catch (error) {
		console.error("Error processing chat request:", error);
		return new Response(
			JSON.stringify({ error: "Failed to process request" }),
			{
				status: 500,
				headers: { "content-type": "application/json" },
			},
		);
	}
}
