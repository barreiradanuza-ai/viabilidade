# Publicar na Railway — passo a passo

Dois caminhos. O **A** não depende do GitHub e é o mais curto. O **B** dá
publicação automática a cada alteração no código.

Em qualquer um deles, a ordem importa: **crie o banco e configure as
variáveis ANTES de subir a aplicação**. Se subir antes, o sistema não acha
o banco, se recusa a iniciar e você vê um deploy falhado — nada quebra, mas
assusta à toa.

---

## Antes de começar

Você vai precisar de uma chave aleatória para as sessões de login. Gere
agora e deixe copiada:

```powershell
docker run --rm alpine sh -c "head -c 48 /dev/urandom | base64"
```

Sai uma linha embaralhada de uns 64 caracteres. É o seu `SESSION_SECRET`.

> **Por que isso importa:** na nuvem o disco é apagado a cada publicação. Sem
> uma chave fixa, o sistema gera uma nova toda vez e **todo mundo é
> deslogado** a cada deploy.

---

## Caminho A — direto da sua pasta (sem GitHub)

### 1. Instalar a CLI

Com Node instalado:

```powershell
npm i -g @railway/cli
```

Confira: `railway --version`.

### 2. Entrar

```powershell
railway login
```

Abre o navegador para você autorizar. É a sua sessão normal — sem token.

### 3. Criar o projeto

Dentro da pasta `viabilidade`:

```powershell
railway init
```

Ele pergunta o nome. Pode ser `viabilidade`.

### 4. Criar o banco

```powershell
railway add --database postgres
```

### 5. Configurar as variáveis

Abra o projeto no navegador (`railway open`), clique no **serviço da
aplicação** e vá na aba **Variables**. Adicione:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `SESSION_SECRET` | a chave que você gerou lá em cima |
| `ADMIN_EMAIL` | seu e-mail |
| `ADMIN_NOME` | seu nome |
| `ADMIN_SENHA` | uma senha longa, só para o primeiro acesso |
| `ACESSO_PUBLICO` | `false` |
| `NIO_MODO` | `INDISPONIVEL` (troque para `BASE_LOCAL` quando o sync da NIO estiver rodando) |

O valor `${{Postgres.DATABASE_URL}}` é literal — digite com as chaves. É
assim que a Railway liga um serviço ao outro; se o banco aparecer com outro
nome na tela, use esse nome no lugar de `Postgres`.

### 6. Subir

```powershell
railway up
```

Ele empacota a pasta, monta a imagem pelo `Dockerfile` e publica. A
primeira vez leva alguns minutos. Acompanhe pelos logs — deve aparecer:

```
[preparar] aplicando 001_schema.sql... ok
[preparar] aplicando 002_nio.sql... ok
[preparar] aplicando 003_perfis.sql... ok
[preparar] Administrador pronto: seu@email.com
[preparar] Nenhuma base TIM ativa ainda.
   ▲ Next.js
```

### 7. Gerar o endereço

```powershell
railway domain
```

Sai algo como `viabilidade-production.up.railway.app`. **Esse é o link.**
HTTPS já vem pronto.

### 8. Primeiro acesso

Abra o link, entre com `ADMIN_EMAIL` e `ADMIN_SENHA`, e:

1. **Administração → Usuários** — cadastre os atendentes.
2. **Administração → Base TIM → Importar nova base** — mande os CSVs.
3. **Administração → Regras** — confira a classificação de cada restrição.

### 9. Fechar a porta

Troque a sua senha em **Usuários → Trocar senha** e **apague `ADMIN_SENHA`**
das variáveis da Railway. Ela já cumpriu o papel.

### Atualizar depois

`railway up` de novo, dentro da pasta. O banco não é tocado — é um serviço
separado, os dados ficam.

---

## Caminho B — pelo GitHub (publica sozinho)

1. Suba o código para o repositório (dentro da pasta: `git push -u origin main`).
2. Na Railway: **New Project → Deploy from GitHub repo** → escolha o repositório.
3. **New → Database → Add PostgreSQL**.
4. Variáveis: iguais à tabela do passo 5 acima.
5. **Settings → Networking → Generate Domain**.

A partir daí, cada `git push` publica automaticamente.

---

## Se der errado

| O que aparece | O que é |
| --- | --- |
| Deploy falha logo no início com `DATABASE_URL não definida` | Falta a variável, ou o nome do banco não é `Postgres`. Confira na aba Variables. |
| `Não consegui conectar ao banco depois de 30 tentativas` | O `${{...}}` foi digitado errado, ou o banco ainda está subindo. Tente de novo em um minuto. |
| Healthcheck falhando | A aplicação subiu mas o banco não responde. Veja os logs do serviço do Postgres. |
| Todo mundo deslogado depois de publicar | `SESSION_SECRET` não está definido. |
| Login recusado no primeiro acesso | `ADMIN_EMAIL`/`ADMIN_SENHA` não estavam preenchidos quando o serviço subiu. Preencha e republique. |
| Upload de CSV grande falha pela tela | Use o terminal do serviço na Railway e rode `npm run tim:importar -- caminho/arquivo.csv`. |

Para ver o que está acontecendo a qualquer momento: `railway logs`.

---

## Sobre o custo

A Railway cobra por uso. Este sistema é um serviço pequeno mais um
PostgreSQL. O que pesa é o tamanho da base: os nove CSVs da TIM devem dar
algo entre 500 MB e 1 GB no banco depois dos índices. Confira o plano antes
de importar tudo, para não tomar susto na fatura.
