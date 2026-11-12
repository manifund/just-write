// OpenRouter image generation, shared by generate.ts and compare.ts.
const API = "https://openrouter.ai/api/v1";

function headers() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export type ImageModel = {
  id: string;
  name: string;
  created: number;
  architecture?: { output_modalities?: string[] };
};

// Every model on OpenRouter that outputs images, newest first.
export async function imageModels(): Promise<ImageModel[]> {
  const res = await fetch(`${API}/models?output_modalities=image`, {
    headers: headers(),
  });
  const { data } = (await res.json()) as { data: ImageModel[] };
  return data
    .filter((m) => m.architecture?.output_modalities?.includes("image"))
    .sort((a, b) => b.created - a.created);
}

export async function render(
  model: string,
  prompt: string,
  opts: { aspect?: string; refUrl?: string | null } = {},
): Promise<{ png: Buffer; secs: number; cost: number | null }> {
  const content = opts.refUrl
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: opts.refUrl } },
      ]
    : prompt;
  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    const res = await fetch(`${API}/chat/completions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model,
        modalities: ["image", "text"],
        ...(opts.aspect
          ? { image_config: { aspect_ratio: opts.aspect, image_size: "2K" } }
          : {}),
        messages: [{ role: "user", content }],
        usage: { include: true },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message: string };
      usage?: { cost?: number };
      choices?: { message: { images?: { image_url: { url: string } }[] } }[];
    };
    const url = body.choices?.[0]?.message.images?.[0]?.image_url.url;
    if (url) {
      const png = url.startsWith("data:")
        ? Buffer.from(url.slice(url.indexOf(",") + 1), "base64")
        : Buffer.from(await (await fetch(url)).arrayBuffer());
      const secs = Math.round((Date.now() - started) / 1000);
      return { png, secs, cost: body.usage?.cost ?? null };
    }
    const why = body.error?.message ?? `no image (HTTP ${res.status})`;
    if (attempt >= 3) throw new Error(why);
    console.warn(`  retrying: ${why}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}
