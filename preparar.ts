/**
 * Preparação executada a cada subida do container, antes do site abrir:
 *
 *   1. espera o banco aceitar conexão;
 *   2. aplica os arquivos de schema (são idempotentes — rodar de novo
 *      não estraga nada nem apaga dado);
 *   3. cria ou atualiza o administrador, se ADMIN_EMAIL/ADMIN_SENHA vierem
 *      no ambiente;
 *   4. avisa, em português claro, o que falta fazer.
 *
 * Com --iniciar, sobe o site em seguida COMO PROCESSO FILHO. Isso importa:
 * se o segredo de sessão foi gerado aqui, ele só chega ao servidor porque
 * é herdado deste processo — encadear com "&&" perderia a variável.
 *
 * Rodar sozinho:  npx tsx scripts/preparar.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';

const DIR_SQL = path.join(process.cwd(), 'prisma', 'sql');

/** Sem SESSION_SECRET a aplicação não sobe. Se não vier um, geramos e
 *  guardamos — assim ninguém fica travado, e a sessão sobrevive a
 *  reinícios porque o arquivo está no volume. */
function garantirSegredo(): string {
  const doAmbiente = process.env.SESSION_SECRET;
  if (doAmbiente && doAmbiente.length >= 32) return doAmbiente;

  const dir = process.env.SEGREDO_DIR ?? '/dados';
  const arquivo = path.join(dir, 'session-secret');
  try {
    if (fs.existsSync(arquivo)) {
      const s = fs.readFileSync(arquivo, 'utf8').trim();
      if (s.length >= 32) return s;
    }
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const novo = crypto.randomBytes(48).toString('base64url');
    fs.writeFileSync(arquivo, novo, { mode: 0o600 });
    console.log(
      '\n[preparar] ATENÇÃO: SESSION_SECRET não veio no ambiente.\n' +
        `           Gerei um e guardei em ${arquivo}.\n` +
        '           Isso serve para rodar na sua máquina. Em hospedagem na nuvem\n' +
        '           (Railway, Render, Fly) o disco é apagado a cada deploy: sem\n' +
        '           SESSION_SECRET fixo, TODO MUNDO É DESLOGADO a cada publicação.\n' +
        '           Defina a variável no painel do serviço.\n',
    );
    return novo;
  } catch {
    console.warn('[preparar] Não consegui guardar o segredo em disco; usando um temporário.');
    return crypto.randomBytes(48).toString('base64url');
  }
}

async function esperarBanco(url: string, tentativas = 30): Promise<void> {
  for (let i = 1; i <= tentativas; i++) {
    const c = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
    try {
      await c.connect();
      await c.query('SELECT 1');
      await c.end();
      return;
    } catch (e) {
      await c.end().catch(() => undefined);
      if (i === tentativas) {
        throw new Error(
          `Não consegui conectar ao banco depois de ${tentativas} tentativas. ` +
            `Verifique DATABASE_URL. Detalhe: ${e instanceof Error ? e.message : e}`,
        );
      }
      if (i === 1) console.log('[preparar] Esperando o banco ficar pronto...');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[preparar] DATABASE_URL não definida. Veja o .env.example.');
    process.exit(1);
  }

  process.env.SESSION_SECRET = garantirSegredo();

  await esperarBanco(url);

  const c = new Client({ connectionString: url });
  await c.connect();

  // ---- schema ------------------------------------------------------
  const arquivos = fs.readdirSync(DIR_SQL).filter((f) => f.endsWith('.sql')).sort();
  for (const f of arquivos) {
    process.stdout.write(`[preparar] aplicando ${f}... `);
    await c.query(fs.readFileSync(path.join(DIR_SQL, f), 'utf8'));
    console.log('ok');
  }

  // ---- administrador ----------------------------------------------
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const senha = process.env.ADMIN_SENHA ?? '';
  const nome = process.env.ADMIN_NOME || 'Administrador';

  if (email && senha) {
    if (senha.length < 10) {
      console.error('[preparar] ADMIN_SENHA precisa ter pelo menos 10 caracteres.');
      process.exit(1);
    }
    const hash = await bcrypt.hash(senha, 12);
    await c.query(
      `INSERT INTO admin_usuario (email, nome, senha_hash, papel)
       VALUES ($1, $2, $3, 'ADMIN')
       ON CONFLICT (email) DO UPDATE
          SET nome = $2, senha_hash = $3, ativo = true, papel = 'ADMIN'`,
      [email, nome, hash],
    );
    console.log(`[preparar] Administrador pronto: ${email}`);
  } else {
    const { rows } = await c.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM admin_usuario WHERE ativo AND papel = 'ADMIN'`,
    );
    if (Number(rows[0].n) === 0) {
      console.log(
        '\n[preparar] ATENÇÃO: nenhum administrador cadastrado.\n' +
          '           Preencha ADMIN_EMAIL e ADMIN_SENHA no .env e rode\n' +
          '           docker compose up -d novamente, ou crie pela linha de comando:\n' +
          '           docker compose exec app npm run admin:criar -- voce@empresa.com "Seu Nome" "sua-senha"\n',
      );
    }
  }

  // ---- estado atual -------------------------------------------------
  const base = await c.query<{ id: string; registros_validos: string; dt_ref: string | null }>(
    `SELECT id, registros_validos, dt_ref FROM base_versao
      WHERE operadora = 'TIM' AND status = 'ATIVA' LIMIT 1`,
  );
  console.log(
    base.rows.length
      ? `[preparar] Base TIM ativa: #${base.rows[0].id} — ` +
          `${Number(base.rows[0].registros_validos).toLocaleString('pt-BR')} lotes` +
          (base.rows[0].dt_ref ? ` (${base.rows[0].dt_ref})` : '')
      : '[preparar] Nenhuma base TIM ativa ainda. Importe em /admin/tim depois de entrar.',
  );

  await c.end();
  console.log('[preparar] Pronto.\n');

  if (process.argv.includes('--iniciar')) {
    const filho = spawn('npx', ['next', 'start'], {
      stdio: 'inherit',
      env: process.env, // leva junto o SESSION_SECRET resolvido acima
    });
    // Ctrl+C e "docker compose stop" precisam chegar ao servidor.
    for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(sinal, () => filho.kill(sinal));
    }
    filho.on('exit', (codigo) => process.exit(codigo ?? 0));
  }
}

main().catch((e) => {
  console.error('[preparar] Falhou:', e instanceof Error ? e.message : e);
  process.exit(1);
});
