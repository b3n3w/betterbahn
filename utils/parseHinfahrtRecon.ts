import zlib from "node:zlib";
import { z } from "zod/v4";
import type { VbidSchema } from "./schemas";
import { fetchAndValidateJson } from "./fetchAndValidateJson";

export const parseHinfahrtRecon = (hinfahrtRecon: string) => {
	/**
	 * This is an attempt to parse the hinfahrtRecon value in contrast to the straight-forward
	 * regex of parseHinfartReconCrude().
	 * hinfahrtRecon is a rather bizarre and non-standard format, with some but not all parts
	 * encoded with base64, gzip, and/or containing a JSON string, and with at least
	 * two different kinds of string separators, only one of which ("¶") this code *should* need.
	 * Parsing hinfahrtRecon like this was successful at least once,
	 * but gunzipping (gzip decompression) failed at other times
	 * which is why this function is not (yet) used.
	 */

	const sections = hinfahrtRecon.split("¶");
	const scIndex = sections.findIndex((s) => s === "SC");

	if (scIndex === -1) {
		throw new Error("Can't process vbid: Couldn't find 'SC' in hinfahrtRecon");
	}

	const scGzipBase64WithPrefix = sections[scIndex + 1];

	if (!scGzipBase64WithPrefix.startsWith("1_")) {
		throw new Error(
			"Can't process vbid: hinfahrtRecon 'SC' unexpectedly doesn't start with '1_'"
		);
	}

	const scGzipBase64 = scGzipBase64WithPrefix.slice("1_".length);
	const scGzipBuffer = Buffer.from(scGzipBase64, "base64");

	let scJsonString = "";

	try {
		scJsonString = zlib.gunzipSync(scGzipBuffer).toString("utf-8");
	} catch {
		throw new Error(
			"Can't process vbid: hinfahrtRecon 'SC' failed to get gunzipped"
		);
	}

	let scUnvalidatedJson = "";

	try {
		scUnvalidatedJson = JSON.parse(scJsonString);
	} catch {
		throw new Error(
			"Can't process vbid: hinfahrtRecon 'SC' JSON parsing failed (invalid JSON)"
		);
	}

	const scJsonSchema = z.object({
		req: z.object({
			arrLoc: z
				.array(
					z.object({
						lid: z.string(),
					})
				)
				.min(1),
			depLoc: z
				.array(
					z.object({
						lid: z.string(),
					})
				)
				.min(1),
		}),
	});

	const scValidatedJsonResult = scJsonSchema.safeParse(scUnvalidatedJson);

	if (!scValidatedJsonResult.success) {
		throw new Error(
			"Can't process vbid: hinfahrtRecon 'SC' JSON doesn't match schema"
		);
	}

	return {
		arrLid: scValidatedJsonResult.data.req.arrLoc[0].lid,
		departLid: scValidatedJsonResult.data.req.depLoc[0].lid,
	};
};

const reconLegSchema = z.object({
	halte: z
		.array(
			z.object({
				id: z.string(),
			})
		)
		.min(0), // Allow empty arrays for walking segments or transfers
});

const reconResponseSchema = z.object({
	verbindungen: z
		.array(
			z.object({
				verbindungsAbschnitte: z.array(reconLegSchema).min(1),
			})
		)
		.min(1),
});

export const parseHinfahrtReconWithAPI = async (
	vbidResponse: VbidSchema,
	cookies: string[]
) => {
	return await fetchAndValidateJson({
		url: "https://www.bahn.de/web/api/angebote/recon",
		schema: reconResponseSchema,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Cookie": "E6BF64FE40122658A5BA3C6BFF03B042~YAAQEhczF2PYpeOZAQAAGLGV7B32YWCNcLBeGKZA3acb6t9OYXCFDaVmT8n+Pep9lwz+8x+ELCG/DflXr8JIjlUo/wHnomP8JB0d5dW7sDD1nhawsGRsdzTlcBp88Pv7rBzVx76AEekK7fxREUTQDW1HAta1PZX/kibZ56T6SkmSKN3TAsivJZFNqRySJ7zVa1s0L2pR2gQ1y7Rg/nX7Uz180n2O7df/JfeAI/kaDB9lMBNePQ5cNQUDnv5UpFBp0Sj+X4fKlQUnaiaXoTovvqR/MrSt5hg9vwJnCgJ8RvGLZyeBu4luCOtX5TIHWseCb3KJJpU0UInd6GtFal5ANUoUFvPvKI28RMaEVKyqwcVtCuq9ukTAK5STFtXHnK8W5p9bR8F1T351yDdL1zNtqBE=~3227969~4274229",
		},
		body: {
			klasse: "KLASSE_2",
			reisende: [
				{
					typ: "ERWACHSENER",
					ermaessigungen: [
						{
							art: "KEINE_ERMAESSIGUNG",
							klasse: "KLASSENLOS",
						},
					],
					anzahl: 1,
					alter: [],
				},
			],
			anfrageZeitpunkt: vbidResponse.hinfahrtDatum,
			ctxRecon: vbidResponse.hinfahrtRecon,
			reservierungsKontingenteVorhanden: false,
			nurDeutschlandTicketVerbindungen: false,
			deutschlandTicketVorhanden: false,
			sitzplatzOnly: false,
		},
	});
};
