# Consulta de Viabilidade — TIM e NIO

Central de consulta de viabilidade de internet residencial. O atendente
escolhe a operadora, informa **CEP** ou **cidade + logradouro + número** e
recebe o resultado. Sem cadastro de cliente, sem venda, sem CRM.


---

## Publicar na web (Railway)

Você já tem conta na Railway e já roda o `mcc-back` lá. Este projeto sobe do
mesmo jeito, por Docker, e pode dividir o banco com o sync da NIO.

### Antes de tudo: quem vai poder consultar

Em `localhost`, deixar a consulta aberta não tem problema. **Num endereço
público, tem.** A base de cobertura da TIM é dado comercial: com a consulta
aberta, qualquer pessoa que receba o link — inclusive concorrente — pode
varrer sua cobertura.

Por isso o padrão agora é **login obrigatório**, inclusive para consultar.
Há dois perfis:

| Perfil | Pode |
| --- | --- |
| **Atendente** | consultar TIM e NIO |
| **Administrador** | tudo isso, mais importar base, ajustar regras e gerenciar usuários |

Você cria os atendentes em **Administração → Usuários**, sem linha de comando.
Cada consulta passa a registrar quem consultou.

Se quiser mesmo deixar aberto, ponha `ACESSO_PUBLICO=true` — mas leia o
parágrafo acima antes.

### Passo a passo

**1. Suba o código para um repositório privado no GitHub.**
Pode ser um repositório novo, só deste projeto. Confira que o `.env` **não**
foi junto (ele está no `.gitignore`).

**2. Na Railway: New Project → Deploy from GitHub repo** e escolha esse
repositório. Ela vai detectar o `Dockerfile` sozinha (o `railway.json` já
diz isso e configura o healthcheck).

**3. Adicione o banco:** dentro do projeto, **New → Database → Add
PostgreSQL**. A Railway cria e gerencia.

**4. Configure as variáveis** no serviço da aplicação (aba *Variables*):

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — referência ao banco que você acabou de criar |
| `SESSION_SECRET` | uma chave aleatória longa (veja abaixo) |
| `ADMIN_EMAIL` | seu e-mail |
| `ADMIN_NOME` | seu nome |
| `ADMIN_SENHA` | uma senha longa, só para o primeiro acesso |
| `ACESSO_PUBLICO` | `false` |
| `NIO_MODO` | `BASE_LOCAL` se for usar a NIO, senão `INDISPONIVEL` |

Para gerar o `SESSION_SECRET`, no seu computador:

```powershell
docker run --rm alpine sh -c "head -c 48 /dev/urandom | base64"
```

> **`SESSION_SECRET` é obrigatório na nuvem.** Sem ele, o sistema gera um
> segredo novo a cada publicação e todo mundo é deslogado. Na sua máquina
> isso não acontece porque o segredo fica salvo no volume.

**5. Gere o endereço:** aba *Settings* → *Networking* → **Generate Domain**.
Sai algo como `viabilidade-production.up.railway.app`. Esse é o link.

**6. Entre** nesse endereço, faça login com `ADMIN_EMAIL`/`ADMIN_SENHA`, vá
em **Administração → Usuários** e crie os atendentes. Depois em **Base TIM →
Importar nova base** e mande os CSVs.

**7. Troque a sua senha** em Usuários → Trocar senha, e **apague
`ADMIN_SENHA`** das variáveis da Railway. Ela já cumpriu o papel.

### Depois de publicado

- HTTPS já vem pronto, com certificado da própria Railway.
- Cada `git push` publica de novo. O schema é reaplicado sozinho e **os
  dados não são perdidos** — o banco é um serviço separado.
- Para importar bases grandes sem passar pelo navegador, use o terminal da
  Railway no serviço da aplicação.
- O sync da NIO (`sync_nio_ceps.py`, no `mcc-back`) deve apontar o
  `DATABASE_URL` para o **mesmo** banco, e aí alimenta os dois sistemas.

### Se preferir outro serviço

Render e Fly.io funcionam igual: são o mesmo `Dockerfile` e as mesmas
variáveis. Só o healthcheck muda de nome — aponte para `/api/saude`.

---

## Rodar no seu computador (3 passos)

Você precisa do **Docker Desktop** instalado ([download](https://www.docker.com/products/docker-desktop/)).
Nada mais: banco de dados, aplicação e schema sobem juntos.

**1.** Descompacte o projeto e, dentro da pasta, copie o arquivo de
configuração:

```powershell
copy .env.example .env
```

**2.** Abra o `.env` no Bloco de Notas e preencha só estas três linhas:

```
ADMIN_EMAIL=voce@empresa.com
ADMIN_NOME=Seu Nome
ADMIN_SENHA=uma-senha-com-pelo-menos-10-caracteres
```

**3.** No terminal, dentro da pasta:

```powershell
docker compose up -d --build
```

A primeira vez leva alguns minutos (ele baixa e monta tudo). Depois abra:

**http://localhost:3000**

Clique em **Administração**, entre com o e-mail e a senha que você colocou
no `.env`, vá em **Base TIM → Importar nova base** e selecione **todos** os
CSVs de uma vez.

### Comandos do dia a dia

```powershell
docker compose logs -f app     # ver o que está acontecendo
docker compose restart app     # reiniciar a aplicação
docker compose down            # desligar (os dados ficam salvos)
docker compose up -d           # ligar de novo
```

Os dados ficam em volumes do Docker e sobrevivem a `down`/`up` e a
reinícios do computador. Só `docker compose down -v` apaga tudo.

### Se algo não funcionar

| Sintoma | O que fazer |
| --- | --- |
| `docker: command not found` | O Docker Desktop não está instalado ou não está aberto. |
| A porta 3000 já está em uso | Mude `PORTA=3001` no `.env` e rode `docker compose up -d` de novo. |
| "nenhum administrador cadastrado" nos logs | `ADMIN_EMAIL`/`ADMIN_SENHA` estão vazios no `.env`. Preencha e suba de novo. |
| Esqueceu a senha do admin | `docker compose exec app npm run admin:criar -- voce@empresa.com "Seu Nome" "nova-senha"` |
| Base muito grande travando pela tela | Copie os CSVs para a pasta `bases` ao lado do `docker-compose.yml` e rode `docker compose exec app npm run tim:importar -- /bases/*.csv` |

### Sem Docker

Precisa de Node 20+ e PostgreSQL 14+ rodando. Veja "Instalação" mais
abaixo.

---

## O que está pronto

| Item | Situação |
| --- | --- |
| Consulta TIM por CEP e por endereço | funcionando |
| Importação de vários arquivos como uma base só | funcionando |
| Layout real (RESTRICAO_FTTH) e layout antigo (VIABILIDADE) | funcionando |
| Agrupamento de vários lotes no mesmo endereço | funcionando |
| Tratamento de imóveis sem número (S/N) | funcionando |
| Busca tolerante a acento, caixa, espaços e abreviações | funcionando |
| Autocomplete de cidade e logradouro | funcionando |
| Lista quando há vários endereços, com escolha do correto | funcionando |
| Interpretação configurável de `VIABILIDADE` / `MOTIVO` | funcionando |
| Importação de CSV com versionamento e rollback | funcionando |
| Área administrativa com login | funcionando |
| Histórico de consultas e logs | funcionando |
| Tela para ajustar as regras de viabilidade sem SQL | funcionando |
| Subida completa com `docker compose up` | funcionando |
| Login obrigatório com perfis de atendente e administrador | funcionando |
| Cadastro de usuários pela tela | funcionando |
| Publicação na Railway com HTTPS | pronto para você subir |
| Consulta NIO por CEP, via base sincronizada | funcionando |
| Consulta NIO por endereço (traduz para CEP pela base TIM) | funcionando |
| Aviso de base da NIO desatualizada ou de sync que falhou | funcionando |

---

## Como a NIO funciona aqui

O link fornecido é um relatório **Power BI "Publicar na web"**. O parâmetro
`r=` da URL é apenas base64 de:

```json
{"k":"8a9db8f9-7cf1-4db5-90d2-5259ad149eba","t":"85b28421-d45a-4b07-889d-24b528c7f250"}
```

`k` é a *resource key* pública do relatório e `t` o tenant da NIO. Ou seja:
o relatório é **anônimo**, não existe autenticação de usuário, e **não há
API oficial** — a Power BI REST API exigiria app registrado e licença no
tenant dono do relatório, que é o da NIO.

**A saída não é consultar o relatório na hora. É sincronizar.**

Um job (`sync_nio_ceps.py`, no repositório `mcc-back`) abre o relatório uma
vez por dia, percorre a lista de CEPs do slicer e grava tudo na tabela
`ceps_nio`. A consulta do atendente vira um `SELECT` indexado: responde em
milissegundos, sem abrir navegador nenhum. Se o sync falhar, as consultas
continuam usando a base do dia anterior.

### O que a fonte da NIO entrega — e o que não entrega

O slicer expõe **apenas o CEP**. Não há número, logradouro, motivo nem
tecnologia. Portanto a resposta da NIO é binária: com ou sem cobertura. A
tela `/nio` diz isso ao atendente com todas as letras, em vez de fingir o
mesmo detalhamento da TIM.

Consultar a NIO por endereço funciona assim: o sistema traduz
"cidade + logradouro + número" em CEP usando a base da TIM como diretório
de endereços (`src/lib/cep-por-endereco.ts`) e então consulta a `ceps_nio`.
Endereço que não esteja na base da TIM não é traduzido — nesse caso a tela
pede o CEP, em vez de responder "sem cobertura".

### Três estados, nunca dois

Isto é deliberado e importa para o faturamento:

| Situação | Resposta |
| --- | --- |
| CEP na tabela | 🟢 Viável |
| CEP fora da tabela | 🔴 Sem viabilidade |
| Banco fora do ar, sync nunca rodou, tabela vazia | ⚪ **Não foi possível consultar** |

Uma falha de infraestrutura **nunca** vira "sem cobertura". O contrário
custa venda: o atendente dispensa um cliente que tinha viabilidade.

### Frescor da base

`nio_cache_meta` guarda `updated_at` (último sync **bem-sucedido**) e
`tentado_em` (última **tentativa**). A distinção é o que permite ao painel
dizer "a base é de anteontem e o sync de hoje falhou". Passando de
`NIO_MAX_IDADE_HORAS` (padrão 48), a tela e o painel avisam, mas o sistema
continua respondendo com o que tem.

### Agendando o sync

No servidor onde o `mcc-back` roda, uma vez por dia:

```cron
0 4 * * *  cd /app && DATABASE_URL=... python sync_nio_ceps.py >> /var/log/nio-sync.log 2>&1
```

Aponte o `DATABASE_URL` do job para o **mesmo banco** deste sistema e o
sync alimenta os dois de uma vez.

### Quando a NIO liberar um endpoint

Peça a eles, nesta ordem de preferência: um endpoint HTTP de consulta; um
export periódico da base em CSV; acesso somente-leitura à base. Quando
vier, configure `NIO_MODO=API` com `NIO_API_URL` e `NIO_API_TOKEN`. O
contrato esperado está em `src/providers/nio.ts`. **Nenhuma outra parte do
sistema muda.**

## Instalação sem Docker

Requisitos: **Node 20+** e **PostgreSQL 14+**.

```bash
git clone <seu-repositorio> viabilidade && cd viabilidade
npm install
cp .env.example .env      # preencha DATABASE_URL e SESSION_SECRET
```

Gere um segredo de sessão:

```bash
openssl rand -base64 48
```

Crie o banco e o schema (extensões, tabelas, índices e regras de
interpretação — tudo em um arquivo):

```bash
createdb viabilidade
npm run db:schema
```

Se for usar a NIO, aplique também o schema de cobertura dela (compatível
com o que o `mcc-back` já usa, para os dois apontarem ao mesmo banco):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/002_nio.sql
```

> As extensões `unaccent`, `pg_trgm` e `btree_gin` são criadas pelo script e
> exigem um usuário com permissão para isso na primeira execução.

Crie o primeiro administrador:

```bash
npm run admin:criar -- voce@empresa.com "Seu Nome" "uma-senha-longa"
```

Ou, para fazer schema e administrador de uma vez (é o que o container roda
a cada subida, e pode rodar quantas vezes quiser):

```bash
ADMIN_EMAIL=voce@empresa.com ADMIN_SENHA=uma-senha-longa npm run preparar
```

Suba a aplicação:

```bash
npm run dev          # desenvolvimento, http://localhost:3000
npm run build && npm start   # produção
```

---

## Como atualizar a base da TIM

Duas formas. As duas fazem exatamente o mesmo processo.

### Pela tela

`/admin` → **Base TIM** → **IMPORTAR NOVA BASE**.

Selecione **todos** os CSVs de uma vez. Eles são enviados por streaming (não
passam pela memória do navegador nem do servidor de uma vez) e o sistema
executa, nesta ordem:

1. upload  2. validação  3. processamento  4. importação
5. indexação  6. teste de integridade  7. pronta para ativação

Ao final aparece o relatório: registros encontrados, válidos, com
problemas, duplicados e municípios. **A base nova só entra no ar quando
você clica em ATIVAR.** Antes disso — e em qualquer falha — a base anterior
continua atendendo normalmente.

### Pela linha de comando

Recomendado para arquivos muito grandes ou para rodar por `cron`:

```bash
# todos os arquivos formam UMA base
npm run tim:importar -- bases/*.csv            # importa, não ativa
npm run tim:importar -- bases/*.csv --ativar   # importa e já ativa
```

### Voltar para uma base anterior

Em `/admin/tim`, no histórico, use **Voltar para esta**. A troca é uma
transação: não existe instante em que o sistema fica sem base.

---

## Como o arquivo é lido

A base da TIM chega em **vários arquivos** — um CSV por parceiro/estado
(`IHSsc`, `V.talrs`, `V.talpr`, `IHSmg`…). Juntos eles formam **uma** base:
importe todos de uma vez.

### Dois layouts, detectados pelo nome das colunas

O layout atual é o de rede, com 42 colunas:

```
CEP_NUM;ID_LOTE;UF;CIDADE;ZONEAMENTO;BAIRRO;NUMERO;CEP;LOGRADOURO;INDICADOR;HH;
PREDIO_FTTC;PREDIO_FTTH;DATA_CABEAMENTO;RESTRICAO_FTTC;DESCRICAO_RESTRICA_FTTC;
RESTRICAO_FTTH;DESCRICAO_RESTRICA_FTTH;MSAN_FTTC;...;OLT_FTTH;...;TOPOLOGIA;...
```

**Não existe coluna `VIABILIDADE` nem `MOTIVO` neste layout.** O que existe é
`RESTRICAO_FTTH` (Sim/Não) e, quando "Sim", a descrição do impedimento.
Estar na base já significa que há rede no endereço — ver "Interpretação"
abaixo.

O layout antigo (`MUNICIPIO`, `NUM_LOGRADOURO`, `VIABILIDADE`, `MOTIVO`,
`QTD_HH`) continua aceito. As colunas são detectadas pelo **nome**, nunca
pela posição, então os dois convivem sem configuração.

Obrigatórias: `CIDADE` (ou `MUNICIPIO`), `CEP` e `LOGRADOURO` — sem elas não
dá para localizar o endereço. Além disso, o arquivo precisa ter **pelo menos
uma** entre `RESTRICAO_FTTH`, `RESTRICAO_FTTC` e `VIABILIDADE`: sem nenhuma
delas o arquivo não diz nada sobre viabilidade, e importar deixaria a base
muda. Nos dois casos a importação é recusada antes de tocar no banco.

### O que o importador tolera

- BOM no início do arquivo (`﻿CEP_NUM`) — presente no arquivo real;
- encoding UTF-8 ou Latin-1/Windows-1252, detectado automaticamente;
- delimitador `;`, `,`, tabulação ou `|`, detectado pelo cabeçalho;
- acento no cabeçalho (`DESCRICAO_RESTRICA_FTTH` e variantes);
- colunas ausentes que não sejam obrigatórias;
- **colunas desconhecidas**: em vez de descartadas em silêncio, vão para a
  coluna `extras` (jsonb) e são listadas no relatório da importação.

Para testar sem o arquivo real:

```bash
npx tsx scripts/gerar-csv-teste.ts /tmp/teste.csv 300000
npm run tim:importar -- /tmp/teste.csv --ativar
```

---

## Interpretação do resultado

Esta é a parte que exige atenção, porque a base **não diz** se um endereço é
viável. Ela diz se há restrição.

A distinção que mais importa é entre **impedimento técnico** (não há como
instalar) e **pendência administrativa** (há rede, falta resolver algo).
Tratar as duas como "sem viabilidade" jogaria venda fora.

O caso mais gritante é `Lote S/N`: o imóvel **tem rede**, só está cadastrado
sem número. No arquivo analisado são 1.989 lotes — 77% de todas as restrições.
Marcá-los como "sem viabilidade" seria dispensar quase dois mil endereços
atendíveis. Por isso vão para **análise**, com a orientação de confirmar o
endereço com o cliente.

As regras têm tela própria em **/admin/regras**: cada situação aparece com
quantos lotes da base ativa ela atinge e um seletor para mudar o resultado.
A alteração vale para a consulta seguinte, sem reimportar nada.

Para quem prefere SQL, elas vivem na tabela `viabilidade_regra`:

```sql
SELECT prioridade, sinal_padrao, motivo_padrao, status, rotulo
  FROM viabilidade_regra WHERE operadora = 'TIM' ORDER BY prioridade;
```

| Restrição na base | Resultado | Por quê |
| --- | --- | --- |
| `RESTRICAO_FTTH = Não` | 🟢 Viável | rede disponível, sem impedimento |
| `Lote S/N` | 🟡 Análise | tem rede; falta o número do imóvel |
| `Pendência Adequação - FTTH` | 🟡 Análise | adequação de rede pendente |
| `Prolongamento de Rede` | 🟡 Análise | precisa estender a rede |
| `Ofensor Churn Invol` | 🟡 Análise | bloqueio **comercial**, não técnico |
| `BLOQUEIO LOTE TIM` | 🟡 Análise | bloqueio administrativo da TIM |
| `Sem Facilidades` | 🔴 Sem viabilidade | impedimento técnico |
| `CDO Bloqueada` | 🔴 Sem viabilidade | impedimento técnico |
| `Fora da Distância Técnica` | 🔴 Sem viabilidade | impedimento técnico |
| `Cabeamento Não Autorizado` | 🔴 Sem viabilidade | impedimento técnico |
| restrição desconhecida | 🟡 Análise | nunca vira "viável" nem "sem viabilidade" |
| endereço ausente da base | 🔴 Sem viabilidade | não há rede |

A regra de menor `prioridade` que casar decide. `sinal_padrao` e
`motivo_padrao` são expressões regulares aplicadas ao valor **normalizado**
(maiúsculas, sem acento). A última regra é um catch-all: uma restrição nova
que a TIM inventar amanhã cai em "necessita de análise" com o valor bruto
visível nos detalhes técnicos, em vez de virar um "viável" falso.

O relatório da importação mostra a distribuição por status **antes** de você
ativar a base — se uma mudança de layout da TIM fizer 40% da base virar
"análise", você vê isso antes de ir para produção.

### Um endereço, vários lotes

A base é por lote, não por endereço. No arquivo analisado, **10.403
endereços têm mais de um lote** e em 89 deles os lotes **divergem** no
status. Devolver "o primeiro que apareceu" seria sorteio.

O sistema agrupa os lotes do mesmo endereço e o status **mais favorável**
prevalece: se existe um lote sem restrição no endereço, há como instalar. A
tela mostra `Lotes no endereço: 16 (8 sem restrição)` para o atendente saber
que houve divergência, e os valores brutos aparecem nos detalhes técnicos.

### Imóveis sem número

2.313 registros do arquivo têm `NUMERO = SN`. Quando o atendente busca um
número que não está na base, o sistema não responde "não encontrado": ele
lista os lotes S/N daquele logradouro com um aviso explicando o caso.

## Desempenho

A base é **particionada por versão**: cada importação vira uma partição
própria, indexada antes de ser anexada. Descartar uma base antiga é um
`DROP` instantâneo, não um `DELETE` de milhões de linhas.

Índices por partição:

| Índice | Serve para |
| --- | --- |
| `(cep_norm, num_norm)` | consulta por CEP |
| `(cidade_norm, logradouro_norm, num_norm)` | consulta por endereço |
| GIN `(cidade_norm, logradouro_norm gin_trgm_ops)` | autocomplete e busca tolerante a erro de digitação |
| `tim_municipio` (agregado) | autocomplete de cidade |

Medido com o arquivo real (`Parceiro IHSsc`, 74.996 lotes, 15 MB):
importação completa — parse, carga, índices e testes de integridade — em
**4 segundos**; consultas respondendo entre **5 ms e 13 ms**. Em escala
proporcional, os nove arquivos de parceiros devem importar em torno de um
minuto. O CSV nunca é lido durante uma consulta e nunca chega ao navegador.

---

## Segurança

- Senhas de administrador guardadas só como hash **bcrypt** (custo 12).
- Sessão em cookie **httpOnly**, `sameSite=lax`, `secure` em produção,
  assinada com `SESSION_SECRET`.
- `/admin/*` é barrado no servidor, a cada requisição, antes de renderizar.
- Toda consulta ao banco usa **parâmetros** — nada de SQL montado por
  concatenação.
- Upload aceita apenas `.csv`/`.txt`, com limite de tamanho configurável, e
  é gravado fora da pasta pública com permissão `0600`; o arquivo é
  apagado ao final do processamento.
- **Rate limiting**: 60 consultas/min e 120 autocompletes/min por origem;
  8 tentativas de login a cada 10 min.
- O banco nunca é exposto ao navegador: tudo passa por rotas de API.
- Logs guardam apenas um **hash** do IP, nunca o IP em claro.
- Erros técnicos nunca chegam ao atendente — a mensagem é sempre amigável.
- Nenhum segredo em código-fonte. Antes de publicar em repositório
  confirme que `.env` está no `.gitignore` (está).

### Ainda a fazer antes de expor à internet

- HTTPS: a Railway já fornece. Em servidor próprio, ponha um proxy reverso
  com certificado.
- Definir a origem permitida de CORS se o front for servido de outro
  domínio — hoje as rotas são consumidas pelo próprio app, mesma origem.
- Se rodar em mais de uma instância, trocar o rate limit em memória
  (`src/lib/limite.ts`) por Redis. A assinatura da função já está pronta
  para isso.

---

## Rotas

| Rota | O que é |
| --- | --- |
| `/` | escolha da operadora |
| `/tim` | consulta TIM |
| `/nio` | consulta NIO |
| `/login` | acesso do administrador |
| `/admin` | painel |
| `/admin/tim` | base ativa e histórico |
| `/admin/tim/importar` | importação de nova base |
| `/login` | entrada (atendentes e administradores) |
| `/admin/regras` | classificação de cada restrição da base |
| `/admin/usuarios` | cadastro de atendentes e administradores |
| `/admin/logs` | consultas e eventos |

### API

```
GET /api/tim/viabilidade?modo=CEP&cep=89237780&numero=75
GET /api/tim/viabilidade?modo=ENDERECO&municipio=JOINVILLE&logradouro=RUA DOS PORTUGUESES&numero=75
GET /api/tim/viabilidade?ref=2:99001            # detalhe de um endereço da lista
GET /api/nio/viabilidade?...                    # mesmos parâmetros
GET /api/tim/autocomplete?tipo=municipio&q=JOIN
GET /api/tim/autocomplete?tipo=logradouro&municipio=JOINVILLE&q=RUA DOS PORT
```

Resposta sempre em um destes formatos:

```jsonc
{ "tipo": "RESULTADO",      "resultado": { … } }
{ "tipo": "MULTIPLOS",      "candidatos": [ … ], "total": 12 }
{ "tipo": "NAO_ENCONTRADO", "mensagem": "Nenhum endereço encontrado…" }
{ "tipo": "INDISPONIVEL",   "mensagem": "…" }
```

---

## Acrescentar uma operadora

1. Crie `src/providers/claro.ts` implementando `OperatorProvider`
   (`src/providers/types.ts`).
2. Registre em `src/providers/index.ts`.
3. Crie `src/app/api/claro/viabilidade/route.ts` com duas linhas
   (`export const GET = rotaConsulta('claro')`).
4. Crie `src/app/claro/page.tsx` reaproveitando `<ConsultaViabilidade />`.

Nada mais muda. A UI, o log, o rate limit e o tratamento de erro já são
compartilhados.

---

## Produção

Qualquer host que rode Node e alcance o PostgreSQL serve. Um roteiro
mínimo:

```bash
npm ci
npm run build
NODE_ENV=production npm start        # atrás de um proxy reverso com TLS
```

Pontos de atenção:

- `UPLOAD_DIR` precisa existir e ser gravável pelo usuário da aplicação.
- O proxy reverso precisa permitir corpo de requisição grande
  (`client_max_body_size 512m` no nginx) para a importação pela tela.
- O timeout do proxy deve ser maior que o tempo de importação
  (`proxy_read_timeout 600s`), ou use o importador por linha de comando.
- Faça backup do PostgreSQL: é onde vive toda a base.

---

## Estrutura

```
docker-compose.yml             sobe banco + aplicação com um comando
railway.json                   configuração de deploy na Railway
Dockerfile                     imagem da aplicação
scripts/preparar.ts            espera o banco, aplica o schema, cria o admin
prisma/sql/001_schema.sql      schema, índices e regras de interpretação
prisma/sql/002_nio.sql         tabelas de cobertura da NIO (ceps_nio, meta do sync)
scripts/importar-tim.ts        importador por linha de comando
scripts/criar-admin.ts         cria/redefine administrador
scripts/gerar-csv-teste.ts     gera CSV sintético para teste
scripts/teste-consulta.ts      exercita as consultas contra a base ativa
src/lib/importador.ts          leitura do CSV, validação, carga e versionamento
src/lib/normalize.ts           normalização (espelha as funções do banco)
src/lib/viabilidade.ts         camada configurável de interpretação
src/lib/rota-consulta.ts       handler compartilhado das rotas de consulta
src/lib/cep-por-endereco.ts    traduz endereço em CEP usando a base da TIM
src/providers/                 TimProvider, NioProvider e o contrato comum
src/app/                       páginas e APIs
src/components/                UI de consulta, importação e ações de base
```
