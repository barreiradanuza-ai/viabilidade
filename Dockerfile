# O codigo do sistema vai dentro de projeto.zip, ao lado deste arquivo.
# Foi feito assim porque o envio de pastas pelo navegador do GitHub
# achatava a estrutura de diretorios. Um zip e um arquivo so: sobe intacto.
FROM node:20-slim

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends unzip \
 && rm -rf /var/lib/apt/lists/*

# Descompacta o projeto direto em /app, preservando src/, prisma/ e scripts/
COPY projeto.zip /tmp/projeto.zip
RUN unzip -q /tmp/projeto.zip -d /app && rm /tmp/projeto.zip

RUN npm ci --include=dev
RUN npm run build

# Onde os CSVs enviados ficam enquanto sao processados
RUN mkdir -p /dados && chmod 700 /dados
ENV UPLOAD_DIR=/dados/uploads

EXPOSE 3000
CMD ["npm", "run", "start:docker"]
