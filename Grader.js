import fs from 'fs/promises';
import path from 'path';
import { spawn, execSync } from 'child_process';

/**
 * Do not instantiate this class. Extend it and implement
 * the testCases() method.
 */
export default class Grader {
  constructor(assignmentConfig) {
    this.assignmentConfig = assignmentConfig || {};
    this.hadModules = false;
    this.directory = 'current_submission';
    this.author = 'NO AUTHOR';
    this.module = true;
    this.start = 'npm start';
    this.subprocess = null;
    this.score = 100;
    this.comments = [];
  }

  /**
   * Deduct points from the student's grade.
   * @param {number} points Points to deduct
   * @param {string} reason Reason for deduction
   * @param {string} error Optional associated error message
   */
  deductPoints(points, reason, error = null) {
    this.score -= points;
    if (score < 0) score = 0;
    this.comments.push(`-${points}; ${reason}${error ? '\n' + error.toString() : ''}`);
  }

  async importFile(file) {
    return await import(path.join(this.directory, file));
  }

  async runStartScript() {
    const cmd = this.start.split(' ');
    if (!cmd[0] || cmd[0] !== 'node')
      throw new Error('Possibly unsafe start script encountered: ' + this.start);
    this.subprocess = spawn(cmd[0], cmd.slice(1), {
      cwd: this.directory
    });
  }
  
  async checks() {
    let package = null;
    const requiredFiles = Object.fromEntries(
      (this.assignmentConfig.requiredFiles || []).map(file => [file, false])
    );
    const entries = await fs.readdir(current, {
      recursive: true,
      withFileTypes: true
    });
    for (const entry of entries) {
      if (!this.hadModules && entry.isDirectory() && entry.name == 'node_modules') {
        this.hadModules = true;
        this.deductPoints(5, 'Included node_modules in submission.');
        continue;
      }
      if (this.hadModules && entry.path.includes('node_modules')) continue;
      const filePath = path.join('current_submission', entry.path, entry.name);
      if (entry.name === 'package.json') {
        this.directory = path.join('current_submission', entry.path);
        package = await import(filePath, { assert: { type: 'json' } });
        continue;
      }
      if (requiredFiles[entry.name] !== undefined) {
        requiredFiles[entry.name] = true;
        if (!package) this.directory = entry.path;
      }
    }
    if (!package) {
      this.deductPoints(5, 'Missing package.json file.');
      if (!this.assignmentConfig?.startScript)
        throw new Error('Student did not provide start script and no default was provided.');
      this.start = this.assignmentConfig.startScript;
    } else {
      if (!package.type || package.type !== 'module')
        this.module = false;
      if (package.author) this.author = package.author;
      if (!package.scripts || !package.scripts.start) {
        this.deductPoints(5, 'Missing start script in package.json file.');
        if (!this.assignmentConfig.startScript)
          throw new Error('Student did not provide start script and no default was provided.');
        this.start = this.assignmentConfig.startScript;
      }
    }
    const missingFiles = requiredFiles.entries()
      .filter(([_, found]) => found)
      .map(([file, _]) => file)
      .join(', ');
    if (missingFiles) throw new Error('Missing file(s): ' + missingFiles);
    execSync('npm i', { cwd: this.directory });
  }

  async run() {
    if (!this.testCases)
      throw new Error('Please implement testCases() with appropriate test cases for the assignment.');
    await this.checks();
    if (this.assignmentConfig.runStartScript)
      await this.runStartScript();
    await this.testCases();
    await this.cleanup();
    return {
      grade: this.score,
      comments: this.comments.join('\n')
    };
  }

  async cleanup() {
    if (!this.hadModules) {
      await fs.rm(path.join(this.directory, 'node_modules'), {
        recursive: true,
        force: true
      });
    }
    if (this.subprocess)
      if (!this.subprocess.kill())
        console.warn('Failed to kill student submission process.');
  }
};