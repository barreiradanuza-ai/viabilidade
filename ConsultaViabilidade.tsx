'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Status =
  | 'VIAVEL'
  | 'SEM_VIABILIDADE'
  | 'ANALISE'
  | 'NAO_ENCONTRADO'
  | 'INDISPONIVEL';

interface Endereco {
  ref: string;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
}

interface Resultado {
  operadora: string;
  status: Status;
  rotulo: string;
  descricao: string;
  endereco: Endereco;
  resumo: Array<{ campo: string; valor: string }>;
  tecnico: Array<{ campo: string; valor: string }>;
  dataBase: string | null;
}

interface Candidato extends Endereco {
  status: Status;
  rotulo: string;
}

type Resposta =
  | { tipo: 'RESULTADO'; resultado: Resultado }
  | { tipo: 'MULTIPLOS'; candidatos: Candidato[]; total: number; aviso?: string }
  | { tipo: 'NAO_ENCONTRADO'; mensagem: string }
  | { tipo: 'INDISPONIVEL'; mensagem: string }
  | { erro: string };

function mascaraCep(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export default function ConsultaViabilidade({
  operadora,
  autocomplete = false,
}: {
  operadora: 'tim' | 'nio';
  autocomplete?: boolean;
}) {
  const [modo, setModo] = useState<'CEP' | 'ENDERECO'>('CEP');
  const [cep, setCep] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resposta, setResposta] = useState<Resposta | null>(null);

  const consultar = useCallback(
    async (params: Record<string, string>) => {
      setCarregando(true);
      setErro(null);
      try {
        const qs = new URLSearchParams(params);
        const r = await fetch(`/api/${operadora}/viabilidade?${qs}`, {
          cache: 'no-store',
        });
        const dados = (await r.json()) as Resposta;
        if ('erro' in dados) {
          setErro(dados.erro);
          setResposta(null);
        } else {
          setResposta(dados);
        }
      } catch {
        setErro('Não foi possível concluir a consulta. Tente novamente.');
        setResposta(null);
      } finally {
        setCarregando(false);
      }
    },
    [operadora],
  );

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (modo === 'CEP') {
      if (cep.replace(/\D/g, '').length !== 8) {
        setErro('Digite um CEP válido.');
        setResposta(null);
        return;
      }
      void consultar({ modo: 'CEP', cep, ...(numero ? { numero } : {}) });
    } else {
      if (!municipio.trim() || !logradouro.trim()) {
        setErro('Informe a cidade e o logradouro.');
        setResposta(null);
        return;
      }
      void consultar({
        modo: 'ENDERECO',
        municipio,
        logradouro,
        ...(numero ? { numero } : {}),
      });
    }
  }

  function limpar() {
    setCep('');
    setMunicipio('');
    setLogradouro('');
    setNumero('');
    setResposta(null);
    setErro(null);
  }

  return (
    <>
      <div className="abas" role="tablist" aria-label="Como deseja consultar?">
        <button
          type="button"
          role="tab"
          className="aba"
          aria-selected={modo === 'CEP'}
          onClick={() => setModo('CEP')}
        >
          Por CEP
        </button>
        <button
          type="button"
          role="tab"
          className="aba"
          aria-selected={modo === 'ENDERECO'}
          onClick={() => setModo('ENDERECO')}
        >
          Por endereço
        </button>
      </div>

      <form className="card" onSubmit={enviar}>
        {modo === 'CEP' ? (
          <div className="form-linha">
            <div className="campo">
              <label htmlFor="cep">CEP</label>
              <input
                id="cep"
                inputMode="numeric"
                autoComplete="off"
                placeholder="89237-780"
                value={cep}
                onChange={(e) => setCep(mascaraCep(e.target.value))}
                autoFocus
              />
            </div>
            <div className="campo curto">
              <label htmlFor="num1">Número (opcional)</label>
              <input
                id="num1"
                inputMode="numeric"
                autoComplete="off"
                placeholder="75"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="form-linha">
            <CampoComSugestoes
              id="cidade"
              rotulo="Cidade"
              placeholder="JOINVILLE"
              valor={municipio}
              aoMudar={setMunicipio}
              ativo={autocomplete}
              buscar={async (q) => {
                const r = await fetch(
                  `/api/tim/autocomplete?tipo=municipio&q=${encodeURIComponent(q)}`,
                );
                const d = (await r.json()) as {
                  itens: Array<{ municipio: string; uf: string }>;
                };
                return d.itens.map((i) => ({
                  texto: i.municipio,
                  detalhe: i.uf,
                }));
              }}
            />
            <CampoComSugestoes
              id="logradouro"
              rotulo="Logradouro"
              placeholder="RUA DOS PORTUGUESES"
              valor={logradouro}
              aoMudar={setLogradouro}
              ativo={autocomplete && municipio.trim().length > 2}
              buscar={async (q) => {
                const r = await fetch(
                  `/api/tim/autocomplete?tipo=logradouro&municipio=${encodeURIComponent(
                    municipio,
                  )}&q=${encodeURIComponent(q)}`,
                );
                const d = (await r.json()) as {
                  itens: Array<{ logradouro: string; bairro: string | null }>;
                };
                return d.itens.map((i) => ({
                  texto: i.logradouro,
                  detalhe: i.bairro ?? '',
                }));
              }}
            />
            <div className="campo curto">
              <label htmlFor="num2">Número</label>
              <input
                id="num2"
                inputMode="numeric"
                autoComplete="off"
                placeholder="75"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="acoes">
          <button className="botao" type="submit" disabled={carregando}>
            {carregando ? <span className="carregando" /> : 'CONSULTAR'}
          </button>
          <button className="botao secundario" type="button" onClick={limpar}>
            Limpar
          </button>
        </div>

        {erro && <div className="aviso erro">{erro}</div>}
      </form>

      {resposta && !('erro' in resposta) && (
        <Saida
          resposta={resposta}
          aoEscolher={(ref) => void consultar({ ref })}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function Saida({
  resposta,
  aoEscolher,
}: {
  resposta: Exclude<Resposta, { erro: string }>;
  aoEscolher: (ref: string) => void;
}) {
  if (resposta.tipo === 'INDISPONIVEL') {
    return <div className="aviso info">{resposta.mensagem}</div>;
  }
  if (resposta.tipo === 'NAO_ENCONTRADO') {
    return <div className="aviso">{resposta.mensagem}</div>;
  }
  if (resposta.tipo === 'MULTIPLOS') {
    return (
      <>
        {resposta.aviso && <div className="aviso">{resposta.aviso}</div>}
        <div className="tabela-caixa">
          <header>
            {resposta.aviso
              ? 'Selecione o endereço correto'
              : 'Encontramos mais de um endereço. Selecione uma opção'}
            {resposta.total > resposta.candidatos.length
              ? ` (mostrando ${resposta.candidatos.length} de ${resposta.total})`
              : ''}
            .
          </header>
        <div className="rolagem">
          <table>
            <thead>
              <tr>
                <th>Logradouro</th>
                <th>Número</th>
                <th>Bairro</th>
                <th>Cidade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {resposta.candidatos.map((c) => (
                <tr
                  key={c.ref}
                  onClick={() => aoEscolher(c.ref)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && aoEscolher(c.ref)}
                >
                  <td>{c.logradouro ?? '—'}</td>
                  <td>{c.numero ?? '—'}</td>
                  <td>{c.bairro ?? '—'}</td>
                  <td>
                    {c.municipio ?? '—'}
                    {c.uf ? ` - ${c.uf}` : ''}
                  </td>
                  <td>
                    <span className={`selo ${c.status}`}>{c.rotulo}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      </>
    );
  }

  const r = resposta.resultado;
  const e = r.endereco;

  // Fontes que respondem só por CEP (caso da NIO) não têm logradouro:
  // aí o próprio CEP vira a linha principal, em vez de exibir um traço.
  const temRua = Boolean(e.logradouro);
  const linha1 = temRua
    ? [e.logradouro, e.numero].filter(Boolean).join(', ')
    : e.cep
      ? `CEP ${e.cep}`
      : '—';
  const linha2 = [
    e.bairro,
    [e.municipio, e.uf].filter(Boolean).join(' - '),
    temRua && e.cep ? `CEP: ${e.cep}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="resultado">
      <div className={`res-faixa v-${r.status}`}>
        <span className="bolha" />
        <div>
          <h3>{r.rotulo}</h3>
          {r.descricao && <p>{r.descricao}</p>}
        </div>
        <span className="op">{r.operadora}</span>
      </div>

      <div className="res-end">
        <div className="rot">Endereço consultado</div>
        <div className="linha1">{linha1}</div>
        {linha2 && <div className="linha2">{linha2}</div>}
      </div>

      <div className="grade">
        {r.resumo.map((i) => (
          <div className="item" key={i.campo}>
            <div className="k">{i.campo}</div>
            <div className="v">{i.valor}</div>
          </div>
        ))}
      </div>

      {r.tecnico.length > 0 && (
        <details className="tecnico">
          <summary>Ver detalhes técnicos</summary>
          <div className="grade">
            {r.tecnico.map((i) => (
              <div className="item" key={i.campo}>
                <div className="k">{i.campo}</div>
                <div className="v">{i.valor}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function CampoComSugestoes({
  id,
  rotulo,
  placeholder,
  valor,
  aoMudar,
  buscar,
  ativo,
}: {
  id: string;
  rotulo: string;
  placeholder: string;
  valor: string;
  aoMudar: (v: string) => void;
  buscar: (q: string) => Promise<Array<{ texto: string; detalhe: string }>>;
  ativo: boolean;
}) {
  const [itens, setItens] = useState<Array<{ texto: string; detalhe: string }>>([]);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const escolhido = useRef(false);

  useEffect(() => {
    if (!ativo || escolhido.current || valor.trim().length < 3) {
      setItens([]);
      escolhido.current = false;
      return;
    }
    const t = setTimeout(() => {
      buscar(valor)
        .then((r) => {
          setItens(r);
          setAberto(true);
        })
        .catch(() => setItens([]));
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, ativo]);

  useEffect(() => {
    function fora(ev: MouseEvent) {
      if (caixa.current && !caixa.current.contains(ev.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  return (
    <div className="campo" ref={caixa}>
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        autoComplete="off"
        placeholder={placeholder}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        onFocus={() => itens.length && setAberto(true)}
      />
      {aberto && itens.length > 0 && (
        <div className="sugestoes">
          {itens.map((i) => (
            <button
              type="button"
              key={`${i.texto}-${i.detalhe}`}
              onClick={() => {
                escolhido.current = true;
                aoMudar(i.texto);
                setAberto(false);
              }}
            >
              {i.texto}
              {i.detalhe && <span className="sec"> — {i.detalhe}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
