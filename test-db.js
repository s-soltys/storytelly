const postgres = require("postgres");

async function check() {
  const sql = postgres("postgres://storytelly:storytelly@localhost:5432/storytelly");
  const res = await sql`SELECT response FROM ai_calls WHERE task LIKE 'generate_%_image' ORDER BY created_at DESC LIMIT 1`;
  console.log(res[0]?.response);
  await sql.end();
}

check();
