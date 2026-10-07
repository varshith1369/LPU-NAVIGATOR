import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { connectDatabase } from "../backend/src/db.mjs";
const prompt = createInterface({ input: stdin, output: stdout });
const email = (
  await prompt.question("Email of the existing registered account to promote: ")
)
  .trim()
  .toLowerCase();
prompt.close();
const db = await connectDatabase();
try {
  const user = await db.transaction(async (tx) => {
    const before = (
      await tx.query("SELECT id,role FROM users WHERE lower(email)=$1", [email])
    ).rows[0];
    if (!before) throw new Error("Register the account first.");
    const row = (
      await tx.query(
        "UPDATE users SET role='ADMIN' WHERE id=$1 RETURNING id,email,role",
        [before.id],
      )
    ).rows[0];
    await tx.query(
      "INSERT INTO audit_logs(action,entity_type,entity_id,before_value,after_value) VALUES('BOOTSTRAP_ADMIN','users',$1,$2,$3)",
      [String(row.id), JSON.stringify(before), JSON.stringify(row)],
    );
    return row;
  });
  console.log(`Promoted ${user.email}. No default admin credentials created.`);
} finally {
  await db.close();
}
