import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders app title", () => {
  render(<App />);
  const heading = screen.getByText(/Trò chơi đố ảnh hạt 3D/i);
  expect(heading).toBeInTheDocument();
});
