import { render, screen } from "@testing-library/react";
import App from "./App";

test("exibe a mensagem de carregamento inicialmente", () => {
  render(<App />);
  const loadingMessageElement = screen.getByText(/Carregando vagas.../i);
  expect(loadingMessageElement).toBeInTheDocument();
});
