// frontend/src/App.js
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import "./App.css";
import { gsap } from "gsap";
import Navbar from "./components/Navbar/Navbar";

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "/.netlify/functions/api";
const API_URL = `${API_BASE_URL}/estagios`;
const REFETCH_INTERVAL_MS = 5 * 60 * 1000;

const parseDateString = (dateString) => {
  if (
    dateString &&
    typeof dateString === "string" &&
    dateString.match(/^\d{2}\/\d{2}\/\d{4}$/)
  ) {
    const parts = dateString.split("/");
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  }
  return new Date(0);
};

function App() {
  const [estagios, setEstagios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filtroDataInclusao, setFiltroDataInclusao] = useState("");
  const [filtroArea, setFiltroArea] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [filtroCidade, setFiltroCidade] = useState("");
  const [filtroTituloVaga, setFiltroTituloVaga] = useState("");
  const [filtroTipoVaga, setFiltroTipoVaga] = useState("");
  const [filtroPlataforma, setFiltroPlataforma] = useState("");

  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const localDarkMode = localStorage.getItem("darkMode");
      return localDarkMode ? JSON.parse(localDarkMode) : false;
    } catch (e) {
      console.error("Erro ao ler darkMode do localStorage:", e);
      return false;
    }
  });

  const appRef = useRef(null);
  const filtersRef = useRef(null);
  const listRef = useRef(null);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prevMode) => {
      const newMode = !prevMode;
      try {
        localStorage.setItem("darkMode", JSON.stringify(newMode));
      } catch (e) {
        console.error("Erro ao salvar darkMode no localStorage:", e);
      }
      return newMode;
    });
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add("dark-mode");
    } else {
      document.body.classList.remove("dark-mode");
    }
  }, [isDarkMode]);

  const fetchEstagios = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP error! status: ${response.status} - ${errorText}`
        );
      }
      const data = await response.json();
      const sortedData = data.sort((a, b) => {
        const dateA = parseDateString(a.Data_de_Incluso);
        const dateB = parseDateString(b.Data_de_Incluso);
        return dateB.getTime() - dateA.getTime();
      });
      setEstagios(sortedData);
    } catch (e) {
      setError(
        `Não foi possível carregar os dados das vagas. Verifique a URL da API (${API_URL}), se o backend/função está rodando e sua conexão. Detalhes: ${e.message}`
      );
      console.error("Erro ao buscar estágios:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const estagiosFiltrados = useMemo(() => {
    return estagios.filter((estagio) => {
      const dataInclusao = String(estagio.Data_de_Incluso || "").toLowerCase();
      const area = String(estagio.Area || "").toLowerCase();
      const empresa = String(estagio.Empresa || "").toLowerCase();
      const cidade = String(estagio.Cidade || "").toLowerCase();
      const tituloVaga = String(estagio.Titulo_da_Vaga || "").toLowerCase();
      const tipoVaga = String(estagio.Tipo_de_Vaga || "").toLowerCase();
      const plataforma = String(estagio.Plataforma || "").toLowerCase();

      const checkFilter = (value, filter) =>
        !filter || value.includes(filter.toLowerCase());

      return (
        checkFilter(dataInclusao, filtroDataInclusao) &&
        checkFilter(area, filtroArea) &&
        checkFilter(empresa, filtroEmpresa) &&
        checkFilter(cidade, filtroCidade) &&
        checkFilter(tituloVaga, filtroTituloVaga) &&
        checkFilter(tipoVaga, filtroTipoVaga) &&
        checkFilter(plataforma, filtroPlataforma)
      );
    });
  }, [
    estagios,
    filtroDataInclusao,
    filtroArea,
    filtroEmpresa,
    filtroCidade,
    filtroTituloVaga,
    filtroTipoVaga,
    filtroPlataforma,
  ]);

  useEffect(() => {
    if (!loading && !error) {
      if (appRef.current) {
        gsap.fromTo(
          appRef.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }
        );
      }
      if (filtersRef.current) {
        gsap.fromTo(
          filtersRef.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", delay: 0.3 }
        );
      }
      if (
        listRef.current?.children.length > 0 &&
        estagiosFiltrados.length > 0
      ) {
        gsap.fromTo(
          listRef.current.children,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.3, ease: "power2.out", stagger: 0.03 }
        );
      }
    }
  }, [loading, error, estagiosFiltrados.length]);

  useEffect(() => {
    fetchEstagios();
    const intervalId = setInterval(fetchEstagios, REFETCH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [fetchEstagios]);

  if (loading && estagios.length === 0) {
    return (
      <>
        <Navbar toggleDarkMode={toggleDarkMode} isDarkMode={isDarkMode} />
        <div className="mensagem-carregando">Carregando vagas...</div>
      </>
    );
  }

  const renderConteudoPrincipal = () => {
    if (error) return <div className="mensagem-erro">{error}</div>;
    if (estagios.length === 0 && !loading) {
      return (
        <div className="mensagem-nenhuma-vaga">
          Nenhuma vaga encontrada no sistema. Verifique a fonte de dados.
        </div>
      );
    }
    if (estagiosFiltrados.length === 0 && estagios.length > 0 && !loading) {
      return (
        <div className="mensagem-nenhuma-vaga">
          Nenhuma vaga corresponde aos filtros aplicados. Tente outros termos.
        </div>
      );
    }
    return (
      <div className="lista-estagios" ref={listRef}>
        {estagiosFiltrados.map((estagio, index) => (
          <div
            key={estagio.Link || `estagio-${index}`}
            className="estagio-card"
          >
            <h2>
              {estagio.Titulo_da_Vaga ||
                estagio.Titulo_da_Vaga_Text ||
                "Título não disponível"}
            </h2>
            <p>
              <strong>Empresa:</strong> {estagio.Empresa || "Não informado"}
            </p>
            <p>
              <strong>Localização:</strong> {estagio.Cidade || "Não informado"}
            </p>
            <p>
              <strong>Área:</strong> {estagio.Area || "Não informado"}
            </p>
            <p>
              <strong>Tipo de Vaga:</strong>{" "}
              {estagio.Tipo_de_Vaga || "Não informado"}
            </p>
            <p>
              <strong>Plataforma:</strong>{" "}
              {estagio.Plataforma || "Não informado"}
            </p>
            <p>
              <strong>Data de Inclusão:</strong>{" "}
              {estagio.Data_de_Incluso || "Não informado"}
            </p>
            {estagio.Link && (
              <button
                type="button"
                className="ver-vaga-button"
                onClick={() =>
                  window.open(estagio.Link, "_blank", "noopener,noreferrer")
                }
              >
                Ver Vaga
              </button>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <Navbar toggleDarkMode={toggleDarkMode} isDarkMode={isDarkMode} />
      <div className="App" ref={appRef}>
        <h1>Oportunidades de Estágio e Trainee em TI</h1>
        <div className="filtros" ref={filtersRef}>
          <input
            type="text"
            placeholder="Data (DD/MM/AAAA)"
            value={filtroDataInclusao}
            onChange={(e) => setFiltroDataInclusao(e.target.value)}
          />
          <input
            type="text"
            placeholder="Área (Ex: Front-end)"
            value={filtroArea}
            onChange={(e) => setFiltroArea(e.target.value)}
          />
          <input
            type="text"
            placeholder="Empresa"
            value={filtroEmpresa}
            onChange={(e) => setFiltroEmpresa(e.target.value)}
          />
          <input
            type="text"
            placeholder="Cidade (Ex: São Paulo)"
            value={filtroCidade}
            onChange={(e) => setFiltroCidade(e.target.value)}
          />
          <input
            type="text"
            placeholder="Título da Vaga"
            value={filtroTituloVaga}
            onChange={(e) => setFiltroTituloVaga(e.target.value)}
          />
          <input
            type="text"
            placeholder="Tipo (Ex: Estágio)"
            value={filtroTipoVaga}
            onChange={(e) => setFiltroTipoVaga(e.target.value)}
          />
          <input
            type="text"
            placeholder="Plataforma"
            value={filtroPlataforma}
            onChange={(e) => setFiltroPlataforma(e.target.value)}
          />
          <button
            type="button"
            onClick={fetchEstagios}
            className="primary-action-button filtros-atualizar-btn"
            disabled={loading && estagios.length > 0}
          >
            {loading && estagios.length > 0
              ? "Atualizando..."
              : "Atualizar Vagas"}
          </button>
        </div>
        {renderConteudoPrincipal()}
      </div>
    </>
  );
}

export default App;
