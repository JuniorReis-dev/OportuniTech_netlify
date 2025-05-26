require("dotenv").config();

const express = require("express");
const { google } = require("googleapis");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const serverless = require("serverless-http"); // Necessário para Netlify Functions

const app = express();
const port = process.env.PORT || 3001;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

app.use(cors());
app.use(express.json());

const frontendBuildPath = path.resolve(__dirname, "../../frontend/build"); // Caminho relativo à função
let frontendAvailable = false;

if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
  frontendAvailable = true;
  console.log(`[Server] Servindo arquivos estáticos de: ${frontendBuildPath}`);
} else {
  console.warn(`[Server] AVISO: Pasta de build do frontend NÃO ENCONTRADA em ${frontendBuildPath}.`);
}

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

app.get("/api/estagios", async (req, res) => {
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
      return res.status(404).json({ message: "Nenhum estágio nas abas dos últimos 3 meses." });
    }
    console.log(`[API] Abas relevantes: ${relevantSheetNames.join(", ")}`);

    let allEstagios = [];
    for (const sheetName of relevantSheetNames) {
      const range = `${sheetName}!A:Z`;
      const response = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        ranges: [range],
        fields: "sheets.data.rowData.values.hyperlink,sheets.data.rowData.values.formattedValue",
      });
      const estagiosFromSheet = parseSheetData(response.data);
      allEstagios = allEstagios.concat(estagiosFromSheet);
    }

    if (allEstagios.length === 0) {
      return res.status(404).json({ message: "Nenhum estágio encontrado após processar abas." });
    }
    res.json(allEstagios);
  } catch (error) {
    console.error("[API] ERRO:", error.message, error.stack);
    res.status(500).json({ error: "Erro interno ao buscar dados.", details: error.message });
  }
});

if (frontendAvailable) {
  app.get("*", (req, res) => {
    const indexPath = path.join(frontendBuildPath, "index.html");
    fs.access(indexPath, fs.constants.F_OK, (errAccess) => {
      if (errAccess) {
        return res.status(404).send("Arquivo principal não encontrado.");
      }
      res.sendFile(indexPath, (errSendFile) => {
        if (errSendFile && !res.headersSent) {
          res.status(500).send("Erro ao enviar arquivo principal.");
        }
      });
    });
  });
}

app.use((err, req, res, next) => {
  console.error("[Server] ERRO NÃO TRATADO:", err.message, err.stack);
  if (!res.headersSent) {
    res.status(500).send("Erro Interno no Servidor.");
  }
});


if (require.main === module && process.env.NODE_ENV !== 'test_netlify_function') {
  app.listen(port, () => {
    console.log(`[Server] Backend rodando em http://localhost:${port}`);
  });
}

module.exports.handler = serverless(app);