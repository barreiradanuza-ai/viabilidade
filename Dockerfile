# Imagem única: além de servir o site, permite rodar a importação por
# linha de comando dentro do container quando a base for muito grande.
FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Dependências primeiro, para aproveitar o cache do Docker.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

# Onde os CSVs enviados ficam enquanto são processados, e onde o segredo
# de sessão é guardado se você não definir um.
RUN mkdir -p /dados && chmod 700 /dados
ENV UPLOAD_DIR=/dados/uploads

EXPOSE 3000
CMD ["npm", "run", "start:docker"]
