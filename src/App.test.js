import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders app title on menu screen", () => {
  render(<App />);
  const heading = screen.getByText(/Trò chơi đố ảnh hạt 3D/i);
  expect(heading).toBeInTheDocument();
});

test("displays start button on menu screen", () => {
  render(<App />);
  const button = screen.getByText(/Bắt đầu chơi/i);
  expect(button).toBeInTheDocument();
});

test("displays list of Vietnamese leaders", () => {
  render(<App />);
  const leaderName = screen.getByText(/Hồ Chí Minh/i);
  expect(leaderName).toBeInTheDocument();
});
