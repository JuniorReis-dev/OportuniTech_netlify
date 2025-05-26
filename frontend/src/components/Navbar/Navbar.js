import React from "react";
import PropTypes from "prop-types";
import "./Navbar.css";

function Navbar({ toggleDarkMode, isDarkMode }) {
  return (
    <nav className="app-navbar">
      <div className="navbar-content">
        <a
          href="/"
          className="logo-container"
          aria-label="Página inicial OportuniTech"
        >
          <svg
            width="36"
            height="36"
            viewBox="0 0 100 100"
            className="logo-svg-icon"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
          >
            <circle
              cx="40"
              cy="50"
              r="20"
              className="logo-svg-circle"
              strokeWidth="10"
              fill="none"
            />
            <line
              x1="60"
              y1="30"
              x2="60"
              y2="70"
              className="logo-svg-line"
              strokeWidth="10"
              strokeLinecap="round"
            />
            <line
              x1="45"
              y1="30"
              x2="75"
              y2="30"
              className="logo-svg-line"
              strokeWidth="10"
              strokeLinecap="round"
            />
          </svg>
          <span className="logo-text">OportuniTech</span>
        </a>
        <div className="nav-links">
          {/* Links de navegação podem ser adicionados aqui */}
        </div>
        <div className="dark-mode-toggle">
          <button
            type="button"
            onClick={toggleDarkMode}
            aria-label={isDarkMode ? "Ativar modo claro" : "Ativar modo escuro"}
          >
            {isDarkMode ? "☀️" : "🌙"}
          </button>
        </div>
      </div>
    </nav>
  );
}

Navbar.propTypes = {
  toggleDarkMode: PropTypes.func.isRequired,
  isDarkMode: PropTypes.bool.isRequired,
};

export default React.memo(Navbar);
