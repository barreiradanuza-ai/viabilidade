/**
 * Leitura centralizada da configuração. Nada de segredo em código:
 * tudo vem de variáveis de ambiente (.env local, secret manager em produção).
 */
function req(nome: string): string {
  const v = process.env[nome];
  if (!v || v.trim() === '') {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${nome}. Veja .env.example.`,
    );
  }
  return v;
}

function opt(nome: string, padrao: string): string {
  const v = process.env[nome];
  return v && v.trim() !== '' ? v : padrao;
}

export const env = {
  get databaseUrl() {
    return req('DATABASE_URL');
  },
  get sessionSecret() {
    const s = req('SESSION_SECRET');
    if (s.length < 32) {
      throw new Error('SESSION_SECRET precisa ter pelo menos 32 caracteres.');
    }
    return s;
  },
  get uploadDir() {
    return opt('UPLOAD_DIR', '/var/lib/viabilidade/uploads');
  },
  get uploadMaxBytes() {
    return Number(opt('UPLOAD_MAX_BYTES', String(512 * 1024 * 1024)));
  },
  /** Configuração da fonte NIO — ver src/providers/nio.ts e o README. */
  nio: {
    get modo() {
      return opt('NIO_MODO', 'BASE_LOCAL') as
        | 'INDISPONIVEL'
        | 'API'
        | 'BASE_LOCAL';
    },
    get apiUrl() {
      return process.env.NIO_API_URL ?? '';
    },
    get apiToken() {
      return process.env.NIO_API_TOKEN ?? '';
    },
    get timeoutMs() {
      return Number(opt('NIO_TIMEOUT_MS', '8000'));
    },
    /** Acima disso, a base sincronizada é sinalizada como desatualizada. */
    get maxIdadeHoras() {
      return Number(opt('NIO_MAX_IDADE_HORAS', '48'));
    },
  },
  /**
   * Consulta aberta a quem tiver o link. Padrão: false.
   * A base de cobertura é dado comercial — abrir significa que concorrente,
   * robô e qualquer pessoa que receba o link encaminhado também consultam.
   */
  get acessoPublico() {
    return (process.env.ACESSO_PUBLICO ?? '').toLowerCase() === 'true';
  },
  get isProd() {
    return process.env.NODE_ENV === 'production';
  },
};
