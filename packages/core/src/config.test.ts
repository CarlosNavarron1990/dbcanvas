import { describe, it, expect } from 'vitest';
import { findSolutionRoot, getRegisteredProjects } from './config.js';
import path from 'path';

describe('findSolutionRoot', () => {
  it('finds root via .git directory', () => {
    // Our own repo has .git at the project root
    const root = findSolutionRoot(process.cwd());
    expect(root).toBeTruthy();
    expect(typeof root).toBe('string');
  });

  it('returns a valid path', () => {
    const root = findSolutionRoot(process.cwd());
    expect(path.isAbsolute(root)).toBe(true);
  });

  it('handles non-existent paths gracefully', () => {
    const root = findSolutionRoot('/tmp/nonexistent-path-test-' + Date.now());
    expect(root).toBeTruthy();
  });
});

describe('getRegisteredProjects', () => {
  it('returns an array', () => {
    const projects = getRegisteredProjects();
    expect(Array.isArray(projects)).toBe(true);
  });

  it('contains only strings', () => {
    const projects = getRegisteredProjects();
    projects.forEach(p => {
      expect(typeof p).toBe('string');
    });
  });
});
