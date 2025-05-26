require("dotenv").config();

const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const serverless = require("serverless-http");

const app = express();
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

app.use(cors());
app.use(express.json());

// Middleware para Logar Detalhes da Requisição
app.use((req, res, next) => {
  console.log("--- INÍCIO DA REQUISIÇÃO NA FUNÇÃO API ---");
  console.log("[API Function Log] Timestamp:", new Date().toISOString());
  console.log("[API Function Log] Método da Requisição:", req.method);
  console.log("[API Function Log] req.path:", req.path);
  console.log("[API Function Log] req.originalUrl:", req.originalUrl);
  console.log("[API Function Log] req.baseUrl:", req.baseUrl);
  console.log("[API Function Log] req.query:", req.query);
  console.log("--- FIM DO LOG DA REQUISIÇÃO ---");
  next();
});

function getRelevantSheetFilterDates() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const startDate = new Date(currentYear, currentMonth - 2, 1);
  const endDate = new Date(currentYear, currentMonth + 1, 0);
  return { startDate, endDate };
}

async function getSheetTitles(sheetsApi) {
  const response = await sheetsApi.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets.properties.title",
  });
  if (!response?.data?.sheets) {
    throw new Error(
      "Resposta inválida ao buscar títulos das abas da planilha."
    );
  }
  return response.data.sheets
    .map((sheet) => sheet.properties.title)
    .filter(Boolean);
}

function filterAndSortSheetNames(sheetNames, dateRange) {
  return sheetNames
    .filter((name) => {
      const match = name.match(/^(\d{2})\/(\d{4})$/);
      if (match) {
        const month = parseInt(match[1], 10);
        const year = parseInt(match[2], 10);
        const sheetDate = new Date(year, month - 1, 1);
        return (
          sheetDate >= dateRange.startDate && sheetDate <= dateRange.endDate
        );
      }
      return false;
    })
    .sort((a, b) => {
      const [monthA, yearA] = a.split("/").map(Number);
      const [monthB, yearB] = b.split("/").map(Number);
      if (yearA !== yearB) return yearB - yearA;
      return monthB - monthA;
    });
}

function parseSheetData(sheetDataFromSingleRange) {
  // Ajustado para receber o objeto 'data' de um único range/aba do resultado do batchGet
  // A estrutura esperada é sheetDataFromSingleRange = { data: [ { rowData: ... } ] }
  if (!sheetDataFromSingleRange?.data?.[0]?.rowData) {
    return [];
  }
  const rows = sheetDataFromSingleRange.data[0].rowData;
  if (rows.length <= 1) return [];

  const headers = rows[0].values
    ? rows[0].values
        .map((cell) => cell.formattedValue?.trim() || "")
        .filter(Boolean)
    : [];
  if (headers.length === 0) return [];

  return rows
    .slice(1)
    .map((row) => {
      const obj = {};
      if (row.values) {
        headers.forEach((header, index) => {
          const cleanHeader = header
            .toLowerCase()
            .replace(/\s+/g, "_")
            .replace(/[^a-z0-9_]/g, "");
          const cell = row.values[index];
          obj[cleanHeader] = cell?.hyperlink || cell?.formattedValue || "";
        });
      }
      return obj;
    })
    .filter((item) =>
      Object.values(item).some((val) => val && String(val).trim() !== "")
    );
}

// Rota principal da API de estágios
// O frontend chamará '/.netlify/functions/api/estagios'
// E o req.path aqui dentro será '/.netlify/functions/api/estagios' (baseado nos seus logs)
app.get("/.netlify/functions/api/estagios", async (req, res) => {
  console.log("[API Function /estagios] Rota acessada com caminho completo.");
  if (!GOOGLE_API_KEY) {
    console.error("[API Function /estagios] GOOGLE_API_KEY não definida!");
    return res
      .status(500)
      .json({
        error: "Configuração do servidor: Chave da API Google ausente.",
      });
  }
  if (!SPREADSHEET_ID) {
    console.error("[API Function /estagios] SPREADSHEET_ID não definido!");
    return res
      .status(500)
      .json({ error: "Configuração do servidor: ID da planilha ausente." });
  }

  try {
    const sheets = google.sheets({ version: "v4", auth: GOOGLE_API_KEY });
    const allSheetNames = await getSheetTitles(sheets);
    const dateRange = getRelevantSheetFilterDates();
    const relevantSheetNames = filterAndSortSheetNames(
      allSheetNames,
      dateRange
    );

    if (relevantSheetNames.length === 0) {
      console.log(`[API Function /estagios] Nenhuma aba relevante encontrada.`);
      return res
        .status(404)
        .json({
          message: "Nenhum estágio encontrado nas abas dos últimos 3 meses.",
        });
    }
    console.log(
      `[API Function /estagios] Abas relevantes para buscar: ${relevantSheetNames.join(
        ", "
      )}`
    );

    // OTIMIZAÇÃO: Define o range de colunas aqui (ex: A:G se só precisar até a coluna G)
    const columnRange = "A:j"; // AJUSTE CONFORME NECESSÁRIO (A:Z é o máximo)
    const rangesToFetch = relevantSheetNames.map(
      (sheetName) => `${sheetName}!${columnRange}`
    );
    let allEstagios = [];

    if (rangesToFetch.length > 0) {
      console.log(
        `[API Function /estagios] Buscando dados para ${rangesToFetch.length} abas em uma chamada.`
      );

      const batchGetResponse = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        ranges: rangesToFetch,
        fields:
          "sheets.data.rowData.values.hyperlink,sheets.data.rowData.values.formattedValue,sheets.properties.title", // Adicionado title para log
      });

      if (batchGetResponse.data && batchGetResponse.data.sheets) {
        for (const singleSheetResult of batchGetResponse.data.sheets) {
          // O 'singleSheetResult' já tem a estrutura { properties: { title: ... }, data: [ { rowData: ... } ] }
          // A função parseSheetData foi ajustada para esperar apenas a parte 'data' de uma aba.
          const sheetTitle =
            singleSheetResult.properties?.title || "Aba Desconhecida";
          const estagiosFromSheet = parseSheetData(singleSheetResult); // Passa o resultado direto da aba

          if (estagiosFromSheet.length > 0) {
            console.log(
              `[API Function /estagios] Processados ${estagiosFromSheet.length} estágios da aba "${sheetTitle}".`
            );
            allEstagios = allEstagios.concat(estagiosFromSheet);
          } else {
            console.log(
              `[API Function /estagios] Nenhum dado válido processado da aba "${sheetTitle}".`
            );
          }
        }
      }
    }

    if (allEstagios.length === 0) {
      console.log(
        "[API Function /estagios] Nenhum estágio encontrado após processar todas as abas relevantes."
      );
      return res
        .status(404)
        .json({
          message:
            "Nenhum estágio encontrado após processar todas as abas relevantes.",
        });
    }

    console.log(
      `[API Function /estagios] Total de ${allEstagios.length} estágios. Enviando.`
    );
    res.json(allEstagios);
  } catch (error) {
    console.error(
      "[API Function /estagios] ERRO:",
      error.message,
      error.stack ? error.stack.split("\n") : "Sem stack trace"
    );
    res
      .status(500)
      .json({
        error: "Erro interno ao buscar dados da planilha.",
        details: error.message,
      });
  }
});

// Middleware de tratamento de erro geral (deve ser o último)
app.use((err, req, res, next) => {
  console.error(
    "[API Function] ERRO NÃO TRATADO:",
    err.message,
    err.stack ? err.stack.split("\n") : "Sem stack trace"
  );
  if (!res.headersSent) {
    res.status(500).send("Erro Interno no Servidor da Função.");
  }
});

// Exporta o handler para Netlify Functions
module.exports.handler = serverless(app);
