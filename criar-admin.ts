/**
 * Cria (ou redefine) um usuário administrador.
 *   npm run admin:criar -- email@empresa.com "Nome" "senha"
 * A senha é gravada apenas como hash bcrypt.
 */
import bcrypt from 'bcryptjs';
import { query, pool } from '../src/lib/db';

async function main() {
  const [email, nome, senha, papelBruto] = process.argv.slice(2);
  const papel = (papelBruto ?? 'ADMIN').toUpperCase();
  if (!email || !nome || !senha) {
    console.error('Uso: npm run admin:criar -- <email> <nome> <senha> [ADMIN|ATENDENTE]');
    process.exit(1);
  }
  if (papel !== 'ADMIN' && papel !== 'ATENDENTE') {
    console.error('Perfil precisa ser ADMIN ou ATENDENTE.');
    process.exit(1);
  }
  if (senha.length < 10) {
    console.error('A senha precisa ter pelo menos 10 caracteres.');
    process.exit(1);
  }
  const hash = await bcrypt.hash(senha, 12);
  await query(
    `INSERT INTO admin_usuario (email, nome, senha_hash, papel)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE
        SET nome = $2, senha_hash = $3, ativo = true, papel = $4`,
    [email.toLowerCase().trim(), nome, hash, papel],
  );
  console.log(`Usuário ${email} pronto (${papel}).`);
  await pool().end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
