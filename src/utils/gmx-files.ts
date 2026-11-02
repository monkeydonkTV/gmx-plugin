import { realpath } from 'fs/promises';
import { isAbsolute, relative, dirname } from 'path';

export async function checkGmxFilePath(filePath: string, root: string, writing = false): Promise<void> {
  if (!root || !isAbsolute(filePath)) throw new Error('Use an absolute path inside the GMX Files directory.');
  const actualRoot = await realpath(root);
  const actualPath = await realpath(writing ? dirname(filePath) : filePath);
  const rel = relative(actualRoot, actualPath);
  if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) throw new Error('File path outside GMX Files.');
  if (writing) {
    try {
      const target = await realpath(filePath);
      const targetRel = relative(actualRoot, target);
      if (targetRel === '..' || targetRel.startsWith('..\\') || targetRel.startsWith('../') || isAbsolute(targetRel)) throw new Error('File target outside GMX Files.');
    } catch (error) { if ((error as any).code !== 'ENOENT') throw error; }
  }
}
