const postgres = require("postgres");

async function check() {
  const sql = postgres("postgres://storytelly:storytelly@localhost:5432/storytelly");
  const res = await sql`SELECT openrouter_api_key FROM settings LIMIT 1`;
  const key = res[0]?.openrouter_api_key;
  
  if (!key) {
    console.log("no key");
    process.exit(1);
  }

  const endpoint = "https://openrouter.ai/api/v1/chat/completions";
  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [{role: "user", content: "A red apple"}],
      modalities: ["image", "text"],
      image_config: { aspect_ratio: "1:1" }
    })
  });
  
  const data = await r.json();
  console.log(JSON.stringify(data, null, 2));

  await sql.end();
}

check();
