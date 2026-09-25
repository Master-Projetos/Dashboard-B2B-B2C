import { defineConfig } from "vite";

// As funções da Vercel usam `response.status(...).json(...)`, mas o servidor do
// Vite entrega a resposta crua do Node. Estes dois atalhos fazem a ponte.
function adaptarResposta(resposta) {
  resposta.status = (codigo) => {
    resposta.statusCode = codigo;
    return resposta;
  };

  resposta.json = (dados) => {
    resposta.setHeader("Content-Type", "application/json; charset=utf-8");
    resposta.end(JSON.stringify(dados));
  };

  return resposta;
}

// Em desenvolvimento as rotas /api são atendidas pelos mesmos arquivos que
// viram funções serverless na Vercel. Assim `npm run dev` roda o painel
// completo — incluindo o proxy da API, sem o qual o navegador bloquearia as
// chamadas por falta de CORS.
function rotasDaApiEmDesenvolvimento() {
  return {
    name: "rotas-da-api-em-desenvolvimento",
    configureServer(servidor) {
      servidor.middlewares.use(async (requisicao, resposta, proximo) => {
        const rota = requisicao.url.split("?")[0];
        if (!rota.startsWith("/api/")) return proximo();

        try {
          const modulo = await servidor.ssrLoadModule(`${rota}.js`);
          await modulo.default(requisicao, adaptarResposta(resposta));
        } catch (erro) {
          resposta.statusCode = 500;
          resposta.setHeader("Content-Type", "application/json; charset=utf-8");
          resposta.end(JSON.stringify({ erro: erro.message }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [rotasDaApiEmDesenvolvimento()],
  server: {
    port: 3000,
    open: true, // abre o navegador sozinho
  },
  build: {
    target: "es2020",
    // Duas páginas: o painel e a de dívidas, que só abre pelo endereço.
    rollupOptions: {
      input: { painel: "index.html", dividas: "dividas.html" },
    },
  },
});
