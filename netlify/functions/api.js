require("dotenv").config();

const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const serverless = require("serverless-http");

const app = express();
const port = process.env.PORT || 3001; // Usado para desenvolvimento local
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

app.use(cors());
app.use(express.json());

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
    throw new Error("Resposta inválida ao buscar títulos das abas da planilha.");
  }
  return response.data.sheets.map((sheet) => sheet.properties.title).filter(Boolean);
}

function filterAndSortSheetNames(sheetNames, dateRange) {
  return sheetNames
    .filter((name) => {
      const match = name.match(/^(\d{2})\/(\d{4})$/);
      if (match) {
        const month = parseInt(match[1], 10);
        const year = parseInt(match[2], 10);
        const sheetDate = new Date(year, month - 1, 1);
        return sheetDate >= dateRange.startDate && sheetDate <= dateRange.endDate;
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

function parseSheetData(sheetData) {
  if (!sheetData?.sheets?.[0]?.data?.[0]?.rowData) {
    return [];
  }
  const rows = sheetData.sheets[0].data[0].rowData;
  if (rows.length <= 1) return [];

  const headers = rows[0].values
    ? rows[0].values.map((cell) => cell.formattedValue?.trim() || "").filter(Boolean)
    : [];
  if (headers.length === 0) return [];

  return rows
    .slice(1)
    .map((row) => {
      const obj = {};
      if (row.values) {
        headers.forEach((header, index) => {
          const cleanHeader = header.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
          const cell = row.values[index];
          obj[cleanHeader] = cell?.hyperlink || cell?.formattedValue || "";
        });
      }
      return obj;
    })
    .filter((item) => Object.values(item).some((val) => val && String(val).trim() !== ""));
}

// Rota principal da API de estágios
// Se sua Netlify Function se chamar 'api' (ex: netlify/functions/api.js),
// o frontend chamará '/.netlify/functions/api/estagios'
app.get("/estagios", async (req, res) => {
  if (!GOOGLE_API_KEY) {
    console.error("[API] GOOGLE_API_KEY não definida!");
    return res.status(500).json({ error: "Configuração do servidor: Chave da API Google ausente." });
  }
  if (!SPREADSHEET_ID) {
    console.error("[API] SPREADSHEET_ID não definido!");
    return res.status(500).json({ error: "Configuração do servidor: ID da planilha ausente." });
  }

  try {
    const sheets = google.sheets({ version: "v4", auth: GOOGLE_API_KEY });
    const allSheetNames = await getSheetTitles(sheets);
    const dateRange = getRelevantSheetFilterDates();
    const relevantSheetNames = filterAndSortSheetNames(allSheetNames, dateRange);

    if (relevantSheetNames.length === 0) {
      console.log(`[API] Nenhuma aba relevante encontrada para as datas: ${dateRange.startDate.toLocaleDateString()} - ${dateRange.endDate.toLocaleDateString()}`);
      return res.status(404).json({ message: "Nenhum estágio encontrado nas abas dos últimos 3 meses." });
    }
    console.log(`[API] Abas relevantes: ${relevantSheetNames.join(", ")}`);

    let allEstagios = [];
    for (const sheetName of relevantSheetNames) {
      const range = `${sheetName}!A:Z`;
      console.log(`[API] Buscando dados da aba "${sheetName}"`);
      const response = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        ranges: [range],
        fields: "sheets.data.rowData.values.hyperlink,sheets.data.rowData.values.formattedValue",
      });
      const estagiosFromSheet = parseSheetData(response.data);
      if (estagiosFromSheet.length > 0) {
        console.log(`[API] Processados ${estagiosFromSheet.length} estágios da aba "${sheetName}".`);
        allEstagios = allEstagios.concat(estagiosFromSheet);
      } else {
        console.log(`[API] Nenhum dado válido processado da aba "${sheetName}".`);
      }
    }

    if (allEstagios.length === 0) {
      console.log("[API] Nenhum estágio encontrado após processar todas as abas relevantes.");
      return res.status(404).json({ message: "Nenhum estágio encontrado após processar todas as abas relevantes." });
    }
    console.log(`[API] Total de ${allEstagios.length} estágios. Enviando.`);
    res.json(allEstagios);
  } catch (error) {
    console.error("[API] ERRO:", error.message, error.stack);
    res.status(500).json({ error: "Erro interno ao buscar dados da planilha.", details: error.message });
  }
});

// Middleware de tratamento de erro geral (deve ser o último)
app.use((err, req, res, next) => {
  console.error("[Server] ERRO NÃO TRATADO:", err.message, err.stack);
  if (!res.headersSent) {
    res.status(500).send("Erro Interno no Servidor.");
  }
});

// Para rodar localmente (ex: node server.js)
if (require.main === module && process.env.NODE_ENV !== 'test_netlify_function') {
  app.listen(port, () => {
    console.log(`[Server] Backend para desenvolvimento local rodando em http://localhost:${port}`);
    console.log(`[Server] Endpoint de estágios local: http://localhost:${port}/estagios`);
  });
}

// Exporta o handler para Netlify Functions
module.exports.handler = serverless(app);