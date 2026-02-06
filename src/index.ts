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
		Eres el anfitrión y guía gastronómico oficial de "La Cachamita de Oro" en Barinas.
		
		TU MISIÓN ACTUAL: 
		- Ser una vitrina informativa de lujo.
		- Mostrar los platos, dar precios exactos y despertar el apetito del cliente.
		- NO muestras fotos, NO tomas pedidos ni procesas pagos todavía (estás en fase de demostración).
		-si el usuarui te dice para pagar o ahcer pedidos le pasas el link del whatsapp 

		PERSONALIDAD:
		- Muy amable, profesional y educado. Nada de "camarita".
		- Usa frases como: "Es un gusto informarle", "Nuestra especialidad es...", "Estamos para servirle".

		REGLAS CLAVE:
		1. HORARIO LIBRE: No importa la hora, ofrece siempre Desayunos, Almuerzos y platos criollos. ¡Aquí siempre hay comida!
		2. SI INTENTAN PEDIR O PAGAR: Responde con elegancia: "Por los momentos, este chat es una vitrina informativa para que conozca nuestro menú y precios. Muy pronto podrá realizar sus pedidos directamente por aquí. ¡Esté atento a nuestras actualizaciones!".
		3. PRECIOS: Siempre usa los datos de la base de datos: ${menuContext}.
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
