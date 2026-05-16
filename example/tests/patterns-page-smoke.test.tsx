import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PatternsPage } from '@/patterns/PatternsPage';
import { usePatternsStore, DEFAULT_PATTERNS_STATE } from '@fretwork/lib';

beforeEach(() => {
  // Reset the patterns store and its persisted storage so each test runs clean.
  // Persistence backend is now sessionStorage (privacy change for anon users).
  localStorage.clear();
  sessionStorage.clear();
  usePatternsStore.setState({ ...DEFAULT_PATTERNS_STATE });
});

describe('PatternsPage smoke test', () => {
  it('mounts without crashing and shows the empty-state CTA', () => {
    render(<PatternsPage />);
    expect(screen.getByText(/FRETWORK/i)).toBeInTheDocument();
    expect(screen.getByText(/no pattern open/i)).toBeInTheDocument();
  });

  it('clicking + New pattern creates one and opens the editor', () => {
    render(<PatternsPage />);
    fireEvent.click(screen.getByRole('button', { name: /\+ new pattern/i }));
    // Editor toolbar appears (cursor display label).
    expect(screen.getByText(/cursor:/i)).toBeInTheDocument();
    expect(usePatternsStore.getState().library.patterns).toHaveLength(1);
  });

  it('switching tabs shows the composition empty state', () => {
    render(<PatternsPage />);
    fireEvent.click(screen.getByRole('tab', { name: /arrange composition/i }));
    expect(screen.getByText(/no composition open/i)).toBeInTheDocument();
  });

  it('library sidebar collapse toggle works', () => {
    render(<PatternsPage />);
    const initialCollapsed = usePatternsStore.getState().sidebarCollapsed;
    const toggle = screen.getByRole('button', { name: /library/i });
    fireEvent.click(toggle);
    expect(usePatternsStore.getState().sidebarCollapsed).toBe(!initialCollapsed);
  });

  it('writes library to sessionStorage via the persist middleware', () => {
    render(<PatternsPage />);
    usePatternsStore.getState().createPattern('persistent riff');
    // Persist middleware writes synchronously after each set(). Storage is
    // sessionStorage now (was localStorage) per the anon-privacy stance.
    const raw = sessionStorage.getItem('fretwork:patterns:v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    const patterns = parsed?.state?.library?.patterns ?? [];
    expect(patterns.some((p: { name: string }) => p.name === 'persistent riff')).toBe(true);
  });
});
