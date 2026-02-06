/**
 * LLM Chat Application Template - CACHAMITA EDITION (Vitrina Informativa)
 */
import { Env, ChatMessage } from "./types";

const MODEL_ID = "@cf/meta/llama-3-8b-instruct";

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		// Servir el Frontend (HTML/CSS/JS)
		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		// API del Chat
		if (url.pathname === "/api/chat") {
			if (request.method === "POST") {
				return handleChatRequest(request, env as any);
			}
			return new Response("Method not allowed", { status: 405 });
		}

		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/**
 * Lógica del Chat con Base de Datos D1 y Enlace a WhatsApp
 */
async function handleChatRequest(
	request: Request,
	env: any,
): Promise<Response> {
	try {
		const { messages = [] } = (await request.json()) as {
			messages: ChatMessage[];
		};

		const lastUserMsg = messages[messages.length - 1]?.content.toLowerCase() || "";

		// 1. CONSULTA A D1 (Filtro por nombre, categoría o descripción)
		let menuContext = "";
		try {
			const { results } = await env.DB.prepare(
				"SELECT * FROM menu_items WHERE nombre LIKE ? OR categoria LIKE ? OR descripcion LIKE ? LIMIT 5"
			).bind(`%${lastUserMsg}%`, `%${lastUserMsg}%`, `%${lastUserMsg}%`).all();

			if (results && results.length > 0) {
				menuContext = "INFORMACIÓN REAL DEL MENÚ: " + JSON.stringify(results);
			} else {
				const { results: random } = await env.DB.prepare("SELECT * FROM menu_items LIMIT 3").all();
				menuContext = "No encontré ese plato exacto. Sugiere estas opciones reales: " + JSON.stringify(random);
			}
		} catch (e) {
			menuContext = "Error consultando la base de datos.";
		}

		// 2. SYSTEM PROMPT (Cerebro con correcciones de horario y WhatsApp)
		const SYSTEM_PROMPT = `
		Eres el anfitrión y guía gastronómico oficial de "La Cachamita de Oro" en Barinas, Venezuela.
		
		TU MISIÓN:
		- Ser una vitrina informativa de lujo.
		- Mostrar los platos y dar precios EXACTOS usando la base de datos. No inventes datos.
		- Por ahora NO procesas pagos ni pedidos por aquí.

		REGLAS DE ATENCIÓN:
		1. HORARIO LIBRE: Ignora la hora del día. Si piden Desayunos al almuerzo o Almuerzos de mañana, ofrécelos con gusto. ¡Aquí siempre hay comida!
		2. PERSONALIDAD: Muy amable, profesional y educada. Evita términos como "camarita". Usa "Es un gusto informarle".
		3. SALUDO: "¡Hola! ¿Cómo está? 🤠 Bienvenido a la vitrina digital de La Cachamita de Oro. Es un placer recibirle. Tenemos Desayunos y Almuerzos disponibles a toda hora. ¿Qué se le antoja hoy?".
		4. PEDIDOS/PAGOS: Si el usuario quiere comprar o pagar, dile: "Por los momentos, este chat es una vitrina informativa. Para concretar su pedido y realizar el pago, toque el siguiente enlace y escríbanos directamente al WhatsApp: https://wa.me/584264562796".
		5. PRECIOS: Usa siempre la información de la base de datos: ${menuContext}.
		`;

		const aiMessages = [
			{ role: "system", content: SYSTEM_PROMPT },
			...messages.filter(m => m.role !== "system")
		];

		// 3. EJECUCIÓN DE IA
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
		return new Response(
			JSON.stringify({ error: "Error en la solicitud" }),
			{ status: 500, headers: { "content-type": "application/json" } }
		);
	}
}
