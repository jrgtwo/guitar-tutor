import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '@/App';

describe('App smoke test', () => {
  it('mounts without crashing', () => {
    render(<App />);
    expect(screen.getByText('FRETWORK')).toBeInTheDocument();
  });

  it('renders the fretboard SVG with the expected aria-label', () => {
    render(<App />);
    const svg = screen.getByRole('img', { name: /fretboard/i });
    expect(svg).toBeInTheDocument();
    // Default state is A major in standard tuning.
    expect(svg.getAttribute('aria-label')).toMatch(/A.*major/i);
  });

  it('renders the info card with the title', () => {
    render(<App />);
    // Title is split into "A" + " MAJOR SCALE". Check the uppercase scale text appears.
    expect(screen.getByText(/MAJOR SCALE/i)).toBeInTheDocument();
  });

  it('renders the four legend items', () => {
    render(<App />);
    expect(screen.getByText('Root')).toBeInTheDocument();
    expect(screen.getByText('Major 3rd')).toBeInTheDocument();
    expect(screen.getByText('Perfect 5th')).toBeInTheDocument();
    expect(screen.getByText('Scale tone')).toBeInTheDocument();
  });

  it('exposes the setup ribbon with Musical section label', () => {
    render(<App />);
    // The Setup ribbon replaces the old chip-popover. Smoke-check that the
    // "Musical" section label is rendered in the ribbon.
    expect(screen.getByText('Musical')).toBeInTheDocument();
  });
});
